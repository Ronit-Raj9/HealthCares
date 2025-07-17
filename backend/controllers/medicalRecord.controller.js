import MedicalRecord from '../models/medicalRecord.model.js';
import { create } from 'ipfs-http-client';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { 
    generateKeyFromSignature, 
    encryptFile, 
    decryptFile, 
    generateFileHash,
    verifyFileIntegrity
} from '../utils/encryption.js';
import contractService from '../services/contractService.js';
import Patient from '../models/patient.model.js'; // Added import for Patient model
import { trackPatientTransaction } from '../utils/transactionTracker.js';
import process from 'process';
import { Buffer } from 'buffer';

// Initialize IPFS client
const ipfs = create({
    host: process.env.IPFS_HOST || 'localhost',
    port: process.env.IPFS_PORT || '5001',
    protocol: process.env.IPFS_PROTOCOL || 'http'
});

// Upload medical record to IPFS and save metadata to MongoDB
const uploadMedicalRecord = asyncHandler(async (req, res) => {
    const { recordType, name, description, walletSignature } = req.body;
    const file = req.file;

    if (!file || !recordType || !name || !walletSignature) {
        throw new ApiError(400, "File, record type, name, and wallet signature are required");
    }

    // Get patient information including contract address
    const patient = await Patient.findById(req.user._id);
    if (!patient) {
        throw new ApiError(404, "Patient not found");
    }

    // Format the record name to include current date and time for uniqueness
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    const uniqueName = `${name}-${dateStr}`;

    // Get file buffer
    const fileBuffer = file.buffer;

    try {
        // Step 1: Generate integrity hash (Hash 1) of raw file
        const dataHash = generateFileHash(fileBuffer);

        // Step 2: Generate patient's symmetric key from wallet signature
        const symmetricKey = generateKeyFromSignature(walletSignature);

        // Step 3: Encrypt the file
        const { encryptedData, iv } = encryptFile(fileBuffer, symmetricKey);

        // Step 4: Upload encrypted file to IPFS
        const result = await ipfs.add(encryptedData);
    const ipfsHash = result.path;

        // Step 5: Store integrity hash on blockchain using patient's contract address
        let onChainData = null;
        let transactionData = {};
        if (patient.contractAddress && patient.contractDeploymentStatus === 'deployed') {
            try {
                console.log('Storing record on patient contract:', patient.contractAddress);
                onChainData = await contractService.addRecord(
                    patient.contractAddress,
                    recordType,
                    uniqueName,
                    dataHash
                );
                console.log('Record stored on blockchain:', onChainData);
                
                // Extract transaction details if available
                if (onChainData.transactionHash) {
                    // Determine which contract function was called based on record type
                    const contractFunction = `add${recordType.charAt(0).toUpperCase() + recordType.slice(1)}`;
                    
                    transactionData = {
                        blockchainTransactions: {
                            upload: {
                                transactionHash: onChainData.transactionHash,
                                blockNumber: onChainData.blockNumber,
                                gasUsed: onChainData.gasUsed,
                                contractFunction: contractFunction, // addBill, addPrescription, addReport
                                timestamp: new Date(),
                                status: 'confirmed'
                            }
                        }
                    };
                    
                    // Also add to patient's contract transaction history
                    await trackPatientTransaction(req.user._id, {
                        transactionHash: onChainData.transactionHash,
                        contractFunction: contractFunction,
                        blockNumber: onChainData.blockNumber,
                        gasUsed: onChainData.gasUsed,
                        status: 'confirmed',
                        relatedData: {
                            recordId: onChainData.recordId,
                            recordType: recordType,
                            recordName: uniqueName
                        }
                    });
                }
            } catch (contractError) {
                console.warn('Blockchain operation failed, proceeding without on-chain storage:', contractError.message);
            }
        } else {
            console.log('No contract deployed for patient, skipping blockchain storage');
        }

        // Step 6: Create medical record in database with encryption metadata
    const medicalRecord = await MedicalRecord.create({
        patientId: req.user._id,
        recordType,
        name: uniqueName,
            originalFilename: file.originalname, // Store original filename with extension
        description,
        ipfsHash,
        dataHash,
            encryptionIv: iv,
            // encryptionTag not used in CBC mode, will be undefined (optional field)
            isEncrypted: true,
            recordId_onchain: onChainData?.recordId,
            patientContractAddress: patient.contractAddress || null,
            // Add transaction tracking data
            ...transactionData,
            // Add patient's own access to encrypted keys
            encryptedSymmetricKeys: [{
                userId: req.user._id,
                userType: 'Patient',
                encryptedKey: symmetricKey // For patient, store the key itself (they can always regenerate)
            }],
        authorizedUsers: [{
            userId: req.user._id,
                userType: 'Patient',
                accessStatus: 'approved'
        }]
    });

    return res.status(201).json(
            new ApiResponse(201, {
                ...medicalRecord.toObject(),
                onChainData: onChainData || null,
                encryptionStatus: 'encrypted',
                contractAddress: patient.contractAddress,
                contractDeploymentStatus: patient.contractDeploymentStatus
            }, "Medical record uploaded and encrypted successfully")
    );
    } catch (error) {
        console.error('Error in uploadMedicalRecord:', error);
        throw new ApiError(500, `Failed to upload medical record: ${error.message}`);
    }
});

// Get all medical records for a patient (owner or authorized)
const getPatientRecords = asyncHandler(async (req, res) => {
    const records = await MedicalRecord.find({
        $or: [
            { patientId: req.user._id },
            { 'authorizedUsers.userId': req.user._id }
        ]
    }).sort({ uploadedAt: -1 });

    return res.status(200).json(
        new ApiResponse(200, records, "Records fetched successfully")
    );
});

// Grant access to a user (doctor or another patient)
const grantAccess = asyncHandler(async (req, res) => {
    const { recordId, userId, userType, expiryDate } = req.body;
    if (!recordId || !userId || !userType) {
        throw new ApiError(400, "Missing required fields");
    }
    if (!['Patient', 'Doctor'].includes(userType)) {
        throw new ApiError(400, "Invalid userType");
    }
    const record = await MedicalRecord.findById(recordId);
    if (!record) {
        throw new ApiError(404, "Record not found");
    }
    if (record.patientId.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "Not authorized to grant access");
    }
    // Prevent duplicate access grants
    const alreadyGranted = record.authorizedUsers.some(
        user => user.userId.toString() === userId.toString() && user.userType === userType
    );
    if (alreadyGranted) {
        throw new ApiError(409, "Access already granted to this user");
    }
    record.authorizedUsers.push({
        userId,
        userType,
        accessExpiresAt: expiryDate
    });
    await record.save();
    return res.status(200).json(
        new ApiResponse(200, record, "Access granted successfully")
    );
});

// Revoke access from a user
const revokeAccess = asyncHandler(async (req, res) => {
    const { recordId, userId } = req.body;
    if (!recordId || !userId) {
        throw new ApiError(400, "Missing required fields");
    }
    const record = await MedicalRecord.findById(recordId);
    if (!record) {
        throw new ApiError(404, "Record not found");
    }
    if (record.patientId.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "Not authorized to revoke access");
    }
    record.authorizedUsers = record.authorizedUsers.filter(
        user => user.userId.toString() !== userId.toString()
    );
    await record.save();
    return res.status(200).json(
        new ApiResponse(200, record, "Access revoked successfully")
    );
});

// Get all records a user is authorized to access (doctor or patient)
const getAuthorizedRecords = asyncHandler(async (req, res) => {
    const now = new Date();
    const records = await MedicalRecord.find({
        'authorizedUsers.userId': req.user._id,
        $or: [
            { 'authorizedUsers.accessExpiresAt': { $exists: false } },
            { 'authorizedUsers.accessExpiresAt': { $gt: now } }
        ]
    }).sort({ uploadedAt: -1 });
    return res.status(200).json(
        new ApiResponse(200, records, "Authorized records fetched successfully")
    );
});

// View/download a medical record from IPFS by its hash with decryption
const viewMedicalRecord = asyncHandler(async (req, res) => {
    const { ipfsHash } = req.params;
    const { walletSignature } = req.query; // For patients
    const { encryptedSymmetricKey } = req.query; // For doctors
    
    if (!ipfsHash) {
        throw new ApiError(400, "IPFS hash is required");
    }

    try {
        // Find the medical record by IPFS hash to get encryption metadata
        const record = await MedicalRecord.findOne({ ipfsHash });
        if (!record) {
            throw new ApiError(404, "Medical record not found");
        }

        // Check authorization
        const userId = req.user._id.toString();
        const isOwner = record.patientId.toString() === userId;
        const isAuthorized = record.authorizedUsers.some(
            user => user.userId.toString() === userId && 
                   (!user.accessExpiresAt || user.accessExpiresAt > new Date())
        );

        console.log('Authorization check:', {
            userId,
            patientId: record.patientId.toString(),
            isOwner,
            isAuthorized,
            authorizedUsers: record.authorizedUsers.map(u => ({
                userId: u.userId.toString(),
                userType: u.userType,
                accessExpiresAt: u.accessExpiresAt
            }))
        });

        if (!isOwner && !isAuthorized) {
            throw new ApiError(403, "Not authorized to view this record");
        }

        // Fetch encrypted file from IPFS
        const chunks = [];
        for await (const chunk of ipfs.cat(ipfsHash)) {
            chunks.push(chunk);
        }
        const encryptedData = Buffer.concat(chunks);

        // Determine decryption method
        let symmetricKey;
        if (isOwner && walletSignature) {
            // Patient access: regenerate key from signature
            symmetricKey = generateKeyFromSignature(walletSignature);
        } else if (!isOwner && encryptedSymmetricKey) {
            // Doctor access: find the patient's original encryption key from access request
            const doctorId = req.user._id.toString();
            const recordId = record._id.toString();
            
            // Find the access request that granted this doctor access to this record
            const { default: AccessRequest } = await import('../models/accessRequest.model.js');
            const accessRequest = await AccessRequest.findOne({
                doctorId,
                status: 'approved',
                'accessGrantedRecords.recordId': recordId,
                accessExpiresAt: { $gt: new Date() }
            });

            if (!accessRequest) {
                throw new ApiError(403, "No valid access grant found for this record");
            }

            // Find the specific record grant
            const recordGrant = accessRequest.accessGrantedRecords.find(
                grant => grant.recordId.toString() === recordId
            );

            if (!recordGrant || !recordGrant.patientEncryptionKey) {
                throw new ApiError(500, "Patient encryption key not found. Patient may need to re-approve access with wallet connected.");
            }

            // Use the patient's original encryption key
            symmetricKey = recordGrant.patientEncryptionKey;
        } else {
            throw new ApiError(400, "Missing decryption credentials. Patients need walletSignature, doctors need encryptedSymmetricKey (signature)");
        }

        // Decrypt the file
        const decryptedData = decryptFile(
            encryptedData,
            symmetricKey,
            record.encryptionIv
        );

        // Verify integrity against local hash
        const isLocalHashValid = verifyFileIntegrity(decryptedData, record.dataHash);
        
        // Verify integrity against blockchain hash if available
        let isBlockchainHashValid = true;
        let blockchainHashMessage = '';
        
        if (record.recordId_onchain && record.blockchainHash) {
            isBlockchainHashValid = verifyFileIntegrity(decryptedData, record.blockchainHash);
            if (isBlockchainHashValid) {
                blockchainHashMessage = 'Blockchain integrity verified';
            } else {
                blockchainHashMessage = 'Blockchain integrity verification failed - data may be tampered';
            }
        } else {
            blockchainHashMessage = 'No blockchain hash available for verification';
        }

        if (!isLocalHashValid) {
            throw new ApiError(400, "Local file integrity verification failed. Data may be corrupted or tampered with.");
        }

        // Set response headers - use original filename to preserve extension
        const downloadFilename = record.originalFilename || record.name;
        res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('X-Integrity-Verified', isLocalHashValid && isBlockchainHashValid ? 'true' : 'false');
        res.setHeader('X-Local-Hash-Verified', isLocalHashValid ? 'true' : 'false');
        res.setHeader('X-Blockchain-Hash-Verified', isBlockchainHashValid ? 'true' : 'false');
        res.setHeader('X-Blockchain-Message', blockchainHashMessage);
        
        // Send decrypted file
        res.send(decryptedData);

    } catch (err) {
        console.error('Error in viewMedicalRecord:', err);
        if (err instanceof ApiError) {
            throw err;
        }
        throw new ApiError(500, `Error processing medical record: ${err.message}`);
    }
});

// Get a single medical record by ID (with authorization)
const getRecordById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) {
        throw new ApiError(400, "Record ID is required");
    }
    const record = await MedicalRecord.findById(id);
    if (!record) {
        throw new ApiError(404, "Record not found");
    }
    // Only allow owner or authorized user
    const isOwner = record.patientId.toString() === req.user._id.toString();
    const isAuthorized = record.authorizedUsers.some(
        user => user.userId.toString() === req.user._id.toString()
    );
    if (!isOwner && !isAuthorized) {
        throw new ApiError(403, "Not authorized to view this record");
    }
    return res.status(200).json(
        new ApiResponse(200, record, "Record fetched successfully")
    );
});

export {
    uploadMedicalRecord,
    getPatientRecords,
    grantAccess,
    revokeAccess,
    getAuthorizedRecords,
    viewMedicalRecord,
    getRecordById
}; 