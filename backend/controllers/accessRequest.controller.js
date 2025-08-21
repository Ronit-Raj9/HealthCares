import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { ApiResponse } from '../utils/apiResponse.js';
import AccessRequest from '../models/accessRequest.model.js';
import Doctor from '../models/doctor.model.js';
import Patient from '../models/patient.model.js';
import MedicalRecord from '../models/medicalRecord.model.js';
import NotificationService from '../services/notificationService.js';
import crypto from 'crypto';
import { generateKeyFromSignature } from '../utils/encryption.js';
import contractService from '../services/contractService.js';
import { trackPatientTransaction, trackAccessTransaction } from '../utils/transactionTracker.js';

// Get patient contract info for blockchain transaction (without creating request)
export const getPatientContractInfo = asyncHandler(async (req, res) => {
    const { patientId } = req.params;
    const doctorId = req.user._id;

    if (!patientId) {
        throw new ApiError(400, "Patient ID is required");
    }

    // Verify the doctor exists
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
        throw new ApiError(404, "Doctor not found");
    }

    // Check if patient exists
    const patient = await Patient.findById(patientId);
    if (!patient) {
        throw new ApiError(404, "Patient not found");
    }

    // Check if there's already a pending request from this doctor to this patient
    const existingRequest = await AccessRequest.findOne({
        doctorId,
        patientId,
        status: 'pending'
    });

    if (existingRequest) {
        throw new ApiError(400, "You already have a pending request for this patient");
    }

    return res.status(200).json(
        new ApiResponse(200, {
            patientId: patient._id,
            patientName: patient.name,
            contractAddress: patient.contractAddress,
            contractDeploymentStatus: patient.contractDeploymentStatus,
            hasBlockchainContract: !!(patient.contractAddress && patient.contractDeploymentStatus === 'deployed')
        }, "Patient contract info retrieved successfully")
    );
});

// Doctor creates an access request
export const createAccessRequest = asyncHandler(async (req, res) => {
    const { patientId, requestReason, requestType = 'all_records', walletAddress } = req.body;
    const doctorId = req.user._id;

    if (!patientId || !requestReason) {
        throw new ApiError(400, "Patient ID and request reason are required");
    }

    if (!walletAddress) {
        throw new ApiError(400, "Wallet connection required to send access requests");
    }

    // Verify the doctor has this wallet address registered
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
        throw new ApiError(404, "Doctor not found");
    }

    if (!doctor.walletAddress || doctor.walletAddress.toLowerCase() !== walletAddress.toLowerCase()) {
        throw new ApiError(403, "Wallet address does not match registered doctor wallet");
    }

    // Check if patient exists and has a deployed contract
    const patient = await Patient.findById(patientId);
    if (!patient) {
        throw new ApiError(404, "Patient not found");
    }

    // Check if there's already a pending request from this doctor to this patient
    const existingRequest = await AccessRequest.findOne({
        doctorId,
        patientId,
        status: 'pending'
    });

    if (existingRequest) {
        throw new ApiError(400, "You already have a pending request for this patient");
    }

    const accessRequest = await AccessRequest.create({
        doctorId,
        patientId,
        requestReason,
        requestType,
        doctorWalletAddress: walletAddress
    });

    // If patient has a deployed contract, create blockchain access request
    if (patient.contractAddress && patient.contractDeploymentStatus === 'deployed') {
        try {
            // Note: The doctor needs to call requestAccess() on the blockchain
            // This should be done from the frontend, but we store the contract info for reference
            accessRequest.patientContractAddress = patient.contractAddress;
            await accessRequest.save();
            
            console.log('Access request created with blockchain contract info:', {
                requestId: accessRequest._id,
                patientContract: patient.contractAddress,
                doctorWallet: walletAddress
            });
        } catch (contractError) {
            console.warn('Could not create blockchain access request:', contractError.message);
        }
    }

    // Create access request notifications
    await NotificationService.createAccessRequestNotification(
        patient._id,
        doctor._id,
        accessRequest._id,
        'requested'
    );

    // Populate doctor info for response
    await accessRequest.populate('doctorId', 'name email specialization');

    return res.status(201).json(
        new ApiResponse(201, {
            ...accessRequest.toObject(),
            requiresBlockchainAction: !!(patient.contractAddress && patient.contractDeploymentStatus === 'deployed'),
            patientContractAddress: patient.contractAddress
        }, "Access request sent successfully")
    );
});

// Get all requests made by a doctor
export const getDoctorRequests = asyncHandler(async (req, res) => {
    const doctorId = req.user._id;

    const requests = await AccessRequest.find({ doctorId })
        .populate('patientId', 'name email age gender contractAddress contractDeploymentStatus')
        .populate('selectedRecords', 'name recordType dateCreated')
        .sort({ requestedAt: -1 });

    return res.status(200).json(
        new ApiResponse(200, requests, "Doctor requests retrieved successfully")
    );
});

// Get all requests for a patient
export const getPatientRequests = asyncHandler(async (req, res) => {
    const patientId = req.user._id;

    const requests = await AccessRequest.find({ patientId })
        .populate('doctorId', 'name email specialization image walletAddress')
        .sort({ requestedAt: -1 });

    return res.status(200).json(
        new ApiResponse(200, requests, "Patient requests retrieved successfully")
    );
});

// Patient responds to an access request
export const respondToAccessRequest = asyncHandler(async (req, res) => {
    const { requestId, action, selectedRecords, patientNotes, accessDuration = 30, patientSignature } = req.body;
    const patientId = req.user._id;

    if (!requestId || !action) {
        throw new ApiError(400, "Request ID and action are required");
    }

    if (!['approve', 'deny'].includes(action)) {
        throw new ApiError(400, "Action must be 'approve' or 'deny'");
    }

    const accessRequest = await AccessRequest.findOne({
        _id: requestId,
        patientId,
        status: 'pending'
    }).populate('doctorId');

    if (!accessRequest) {
        throw new ApiError(404, "Access request not found or already processed");
    }

    accessRequest.status = action === 'approve' ? 'approved' : 'denied';
    accessRequest.respondedAt = new Date();
    accessRequest.patientNotes = patientNotes;

    if (action === 'approve') {
        if (!selectedRecords || selectedRecords.length === 0) {
            throw new ApiError(400, "At least one record must be selected for approval");
        }

        if (!patientSignature) {
            throw new ApiError(400, "Patient signature is required for approval to encrypt access keys");
        }

        // Validate that all selected records belong to the patient
        const records = await MedicalRecord.find({
            _id: { $in: selectedRecords },
            patientId
        });

        if (records.length !== selectedRecords.length) {
            throw new ApiError(400, "Some selected records don't belong to you");
        }

        accessRequest.selectedRecords = selectedRecords;

        // Calculate access expiry date based on provided duration using proper time arithmetic
        // This ensures consistency between database and blockchain calculations
        const currentTime = new Date();
        const expiryDurationInMilliseconds = accessDuration * 24 * 60 * 60 * 1000; // Convert days to milliseconds
        const accessExpiresAt = new Date(currentTime.getTime() + expiryDurationInMilliseconds);
        accessRequest.accessExpiresAt = accessExpiresAt;

        console.log(`Access approval details:`, {
            currentTime: currentTime.toISOString(),
            accessDuration: accessDuration,
            expiryDurationDays: accessDuration,
            expiryDurationMs: expiryDurationInMilliseconds,
            accessExpiresAt: accessExpiresAt.toISOString(),
            doctorId: accessRequest.doctorId._id,
            doctorWallet: accessRequest.doctorId.walletAddress
        });

        // Generate patient's encryption key from their signature
        const patientEncryptionKey = generateKeyFromSignature(patientSignature);

        // Create access granted records with patient's original encryption key
        accessRequest.accessGrantedRecords = records.map(record => ({
            recordId: record._id,
            accessKey: crypto.randomBytes(32).toString('hex'), // Unique access identifier
            patientEncryptionKey: patientEncryptionKey // Store patient's original encryption key
        }));

        // Update medical records to include authorized access
        await MedicalRecord.updateMany(
            { _id: { $in: selectedRecords } },
            {
                $push: {
                    authorizedUsers: {
                        userId: accessRequest.doctorId._id,
                        userType: 'Doctor',
                        accessExpiresAt: accessExpiresAt,
                        grantedAt: new Date()
                    }
                }
            }
        );

        // Handle blockchain approval if patient has a deployed contract
        const patient = await Patient.findById(patientId);
        if (patient && patient.contractAddress && patient.contractDeploymentStatus === 'deployed') {
            try {
                // Group records by type for blockchain approval
                const recordsByType = {
                    prescriptionIds: [],
                    reportIds: [],
                    billIds: []
                };

                for (const record of records) {
                    if (record.recordId_onchain !== null && record.recordId_onchain !== undefined) {
                        switch (record.recordType) {
                            case 'prescription':
                                recordsByType.prescriptionIds.push(record.recordId_onchain);
                                break;
                            case 'report':
                                recordsByType.reportIds.push(record.recordId_onchain);
                                break;
                            case 'bill':
                                recordsByType.billIds.push(record.recordId_onchain);
                                break;
                        }
                    }
                }

                // Only approve if there are on-chain records
                const hasOnChainRecords = recordsByType.prescriptionIds.length > 0 || 
                                        recordsByType.reportIds.length > 0 || 
                                        recordsByType.billIds.length > 0;

                if (hasOnChainRecords && accessRequest.doctorId.walletAddress) {
                    const expiryDuration = accessDuration * 24 * 60 * 60; // Convert days to seconds
                    
                    console.log(`Blockchain access approval:`, {
                        doctorAddress: accessRequest.doctorId.walletAddress,
                        accessDurationDays: accessDuration,
                        expiryDurationSeconds: expiryDuration,
                        databaseExpiresAt: accessRequest.accessExpiresAt.toISOString(),
                        blockchainExpiryTime: new Date(Date.now() + (expiryDuration * 1000)).toISOString(),
                        recordsByType
                    });
                    
                    const blockchainResult = await contractService.grantAccess(
                        patient.contractAddress,
                        accessRequest.doctorId.walletAddress,
                        expiryDuration,
                        recordsByType.prescriptionIds,
                        recordsByType.reportIds,
                        recordsByType.billIds
                    );

                    // Verify the approval was successful
                    const verification = await contractService.verifyAccessApproval(
                        patient.contractAddress,
                        accessRequest.doctorId.walletAddress
                    );

                    accessRequest.blockchainTransactions = {
                        approval: {
                            transactionHash: blockchainResult.transactionHash,
                            blockNumber: blockchainResult.blockNumber,
                            gasUsed: blockchainResult.gasUsed,
                            contractFunction: 'approveAccess',
                            timestamp: new Date(),
                            status: 'confirmed',
                            expiryDuration: expiryDuration,
                            expiryDurationDays: accessDuration,
                            blockchainExpiryTime: new Date(Date.now() + (expiryDuration * 1000)),
                            databaseExpiryTime: accessRequest.accessExpiresAt,
                            verification: verification
                        }
                    };

                    console.log('Blockchain access approval successful:', {
                        transactionHash: blockchainResult.transactionHash,
                        doctorAddress: accessRequest.doctorId.walletAddress,
                        expiryDuration: expiryDuration,
                        recordCount: recordsByType.prescriptionIds.length + recordsByType.reportIds.length + recordsByType.billIds.length
                    });
                } else {
                    console.log('No on-chain records to approve or doctor wallet not available', {
                        hasOnChainRecords,
                        doctorWallet: accessRequest.doctorId.walletAddress,
                        recordsByType
                    });
                }
            } catch (contractError) {
                console.warn('Blockchain approval failed, but off-chain approval continues:', contractError.message);
                // Don't fail the entire approval if blockchain fails
                accessRequest.blockchainError = contractError.message;
            }
        }
    }

    await accessRequest.save();

    // Create access request response notifications
    await NotificationService.createAccessRequestNotification(
        accessRequest.patientId,
        accessRequest.doctorId._id,
        accessRequest._id,
        action === 'approve' ? 'granted' : 'denied'
    );

    // Populate for response
    await accessRequest.populate([
        { path: 'doctorId', select: 'name email specialization walletAddress' },
        { path: 'selectedRecords', select: 'name recordType dateCreated' }
    ]);

    return res.status(200).json(
        new ApiResponse(200, accessRequest, `Access request ${action}d successfully`)
    );
});

// Get authorized records for a doctor
export const getAuthorizedRecords = asyncHandler(async (req, res) => {
    const doctorId = req.user._id;

    try {
        // Find all approved access requests for this doctor
        const approvedRequests = await AccessRequest.find({
            doctorId,
            status: 'approved',
            accessExpiresAt: { $gt: new Date() } // Not expired
        }).populate('selectedRecords').populate('patientId', 'name contractAddress');

        // Flatten all authorized records with patient and access info
        const authorizedRecords = [];
        for (const request of approvedRequests) {
            for (const record of request.selectedRecords || []) {
                // Add patient name and access info
                const recordWithAccess = {
                    ...record.toObject(),
                    patientName: request.patientId?.name || 'Unknown Patient',
                    patientContractAddress: request.patientId?.contractAddress || null,
                    accessExpiresAt: request.accessExpiresAt,
                    grantedAt: request.respondedAt,
                    requestId: request._id,
                    // Add blockchain verification status
                    hasBlockchainVerification: !!(record.patientContractAddress && record.recordId_onchain !== null)
                };
                authorizedRecords.push(recordWithAccess);
            }
        }

        return res.status(200).json(
            new ApiResponse(200, authorizedRecords, "Authorized records retrieved successfully")
        );
    } catch (error) {
        console.error('Error getting authorized records:', error);
        throw new ApiError(500, "Error retrieving authorized records");
    }
});

// Get blockchain-verified authorized records for a doctor
export const getBlockchainAuthorizedRecords = asyncHandler(async (req, res) => {
    const doctorId = req.user._id;

    try {
        const doctor = await Doctor.findById(doctorId);
        if (!doctor || !doctor.walletAddress) {
            throw new ApiError(400, "Doctor wallet address not found");
        }

        // Find all approved requests with blockchain contracts
        const approvedRequests = await AccessRequest.find({
            doctorId,
            status: 'approved',
            accessExpiresAt: { $gt: new Date() },
            patientContractAddress: { $exists: true, $ne: null }
        }).populate('patientId', 'name contractAddress');

        const blockchainAuthorizedRecords = [];

        for (const request of approvedRequests) {
            if (request.patientContractAddress) {
                try {
                    // Get approved records from blockchain
                    const blockchainRecords = await contractService.getApprovedRecords(
                        request.patientContractAddress,
                        doctor.walletAddress
                    );

                    // Combine blockchain data with database records
                    const allBlockchainRecords = [
                        ...blockchainRecords.prescriptions.map(r => ({ ...r, type: 'prescription' })),
                        ...blockchainRecords.reports.map(r => ({ ...r, type: 'report' })),
                        ...blockchainRecords.bills.map(r => ({ ...r, type: 'bill' }))
                    ];

                    for (const blockchainRecord of allBlockchainRecords) {
                        // Find corresponding database record
                        const dbRecord = await MedicalRecord.findOne({
                            name: blockchainRecord.prescriptionName || blockchainRecord.reportName || blockchainRecord.billName,
                            recordType: blockchainRecord.type,
                            patientId: request.patientId._id
                        });

                        if (dbRecord) {
                            blockchainAuthorizedRecords.push({
                                ...dbRecord.toObject(),
                                patientName: request.patientId.name,
                                accessExpiresAt: request.accessExpiresAt,
                                grantedAt: request.respondedAt,
                                requestId: request._id,
                                blockchainVerified: true,
                                blockchainHash: blockchainRecord.prescriptionDataHash || blockchainRecord.reportDataHash || blockchainRecord.billDataHash
                            });
                        }
                    }
                } catch (contractError) {
                    console.error('Error getting blockchain records for contract:', request.patientContractAddress, contractError);
                }
            }
        }

        return res.status(200).json(
            new ApiResponse(200, blockchainAuthorizedRecords, "Blockchain-verified authorized records retrieved successfully")
        );
    } catch (error) {
        console.error('Error getting blockchain authorized records:', error);
        throw new ApiError(500, "Error retrieving blockchain authorized records");
    }
});

// Revoke access to a specific record (patient only)
export const revokeAccess = asyncHandler(async (req, res) => {
    const { recordId, doctorId } = req.body;
    const patientId = req.user._id;

    if (!recordId || !doctorId) {
        throw new ApiError(400, "Record ID and Doctor ID are required");
    }

    // Remove doctor from record's authorized users
    const result = await MedicalRecord.updateOne(
        { 
            _id: recordId, 
            patientId,
            'authorizedUsers.userId': doctorId 
        },
        {
            $pull: {
                authorizedUsers: { userId: doctorId }
            }
        }
    );

    if (result.modifiedCount === 0) {
        throw new ApiError(404, "Record not found or doctor doesn't have access");
    }

    // Update access request status if it exists
    await AccessRequest.updateMany(
        {
            doctorId,
            patientId,
            selectedRecords: recordId,
            status: 'approved'
        },
        {
            $pull: { selectedRecords: recordId }
        }
    );

    return res.status(200).json(
        new ApiResponse(200, null, "Record access revoked successfully")
    );
});

// Revoke complete access for a doctor (all records) - with blockchain integration
export const revokeCompleteAccess = asyncHandler(async (req, res) => {
    const { accessRequestId } = req.body;
    const patientId = req.user._id;

    if (!accessRequestId) {
        throw new ApiError(400, "Access request ID is required");
    }

    // Find the access request
    const accessRequest = await AccessRequest.findById(accessRequestId).populate('doctorId', 'name email walletAddress');
    if (!accessRequest) {
        throw new ApiError(404, "Access request not found");
    }

    // Verify patient ownership
    if (accessRequest.patientId.toString() !== patientId.toString()) {
        throw new ApiError(403, "Not authorized to revoke access for this request");
    }

    // Check if access is currently active
    if (accessRequest.status !== 'approved') {
        throw new ApiError(400, "Access is not currently approved");
    }

    try {
        // Get patient info for blockchain transaction
        const patient = await Patient.findById(patientId);
        if (!patient) {
            throw new ApiError(404, "Patient not found");
        }

        // Step 1: Blockchain transaction (if contract deployed)
        let blockchainTransactionHash = null;
        if (patient.contractAddress && patient.contractDeploymentStatus === 'deployed' && accessRequest.doctorId.walletAddress) {
            const blockchainResult = await contractService.revokeAccess(
                patient.contractAddress,
                accessRequest.doctorId.walletAddress
            );
            blockchainTransactionHash = blockchainResult.transactionHash;

            // Track blockchain transaction
            await trackPatientTransaction(patientId, {
                transactionHash: blockchainResult.transactionHash,
                contractFunction: 'revokeAccess',
                blockNumber: blockchainResult.blockNumber,
                gasUsed: blockchainResult.gasUsed,
                status: 'confirmed',
                relatedData: {
                    doctorAddress: accessRequest.doctorId.walletAddress,
                    revokedAccessRequestId: accessRequestId
                }
            });
        }

        // Step 2: Update database - revoke access request
        accessRequest.status = 'revoked';
        accessRequest.revokedAt = new Date();
        accessRequest.revokedBy = patientId;

        // Add revocation transaction info
        if (!accessRequest.blockchainTransactions) {
            accessRequest.blockchainTransactions = {};
        }
        accessRequest.blockchainTransactions.revocation = {
            transactionHash: blockchainTransactionHash,
            timestamp: new Date(),
            status: blockchainTransactionHash ? 'confirmed' : 'not_available'
        };

        await accessRequest.save();

        // Step 3: Remove doctor from all medical records' authorized users
        await MedicalRecord.updateMany(
            { 
                patientId,
                'authorizedUsers.userId': accessRequest.doctorId._id 
            },
            {
                $pull: {
                    authorizedUsers: { userId: accessRequest.doctorId._id }
                }
            }
        );

        return res.status(200).json(
            new ApiResponse(200, {
                accessRequest,
                blockchainTransactionHash,
                revokedAt: accessRequest.revokedAt
            }, "Complete access revoked successfully")
        );
    } catch (error) {
        console.error('Access revocation failed:', error);
        throw new ApiError(500, `Failed to revoke access: ${error.message}`);
    }
});

// Get revoked access requests for patient
export const getRevokedAccessRequests = asyncHandler(async (req, res) => {
    const patientId = req.user._id;

    try {
        const revokedRequests = await AccessRequest.find({
            patientId,
            status: 'revoked'
        }).populate('doctorId', 'name email specialization').sort({ revokedAt: -1 });

        return res.status(200).json(
            new ApiResponse(200, revokedRequests, "Revoked access requests fetched successfully")
        );
    } catch (error) {
        console.error('Failed to fetch revoked requests:', error);
        throw new ApiError(500, `Failed to fetch revoked requests: ${error.message}`);
    }
});

// Cleanup expired access (admin function)
export const cleanupExpiredAccess = asyncHandler(async (req, res) => {
    try {
        const now = new Date();
        console.log(`Starting expired access cleanup at: ${now.toISOString()}`);

        // Find all expired access requests
        const expiredRequests = await AccessRequest.find({
            status: 'approved',
            accessExpiresAt: { $lt: now }
        }).populate('doctorId', 'walletAddress name email')
          .populate('patientId', 'contractAddress contractDeploymentStatus name');

        console.log(`Found ${expiredRequests.length} expired access requests`);

        let cleanupResults = {
            totalExpired: expiredRequests.length,
            databaseCleanedUp: 0,
            blockchainRevoked: 0,
            errors: []
        };

        for (const request of expiredRequests) {
            try {
                // Update status to expired in database
                request.status = 'expired';
                await request.save();
                cleanupResults.databaseCleanedUp++;

                // Remove from medical records authorized users
                await MedicalRecord.updateMany(
                    { 'authorizedUsers.userId': request.doctorId._id },
                    {
                        $pull: {
                            authorizedUsers: {
                                userId: request.doctorId._id,
                                userType: 'Doctor'
                            }
                        }
                    }
                );

                // Optionally revoke on blockchain if contract is deployed
                if (request.patientId.contractAddress && 
                    request.patientId.contractDeploymentStatus === 'deployed' &&
                    request.doctorId.walletAddress) {
                    
                    try {
                        console.log(`Attempting blockchain revocation for doctor ${request.doctorId.walletAddress} from patient ${request.patientId.name}`);
                        
                        await contractService.revokeAccess(
                            request.patientId.contractAddress,
                            request.doctorId.walletAddress
                        );
                        
                        cleanupResults.blockchainRevoked++;
                        console.log(`Successfully revoked blockchain access for doctor ${request.doctorId.walletAddress}`);
                    } catch (blockchainError) {
                        console.warn(`Blockchain revocation failed for doctor ${request.doctorId.walletAddress}:`, blockchainError.message);
                        cleanupResults.errors.push({
                            doctorId: request.doctorId._id,
                            doctorEmail: request.doctorId.email,
                            error: `Blockchain revocation failed: ${blockchainError.message}`
                        });
                    }
                }

                console.log(`Cleaned up expired access: Doctor ${request.doctorId.email} -> Patient ${request.patientId.name}`);
            } catch (error) {
                console.error(`Error cleaning up request ${request._id}:`, error);
                cleanupResults.errors.push({
                    requestId: request._id,
                    doctorEmail: request.doctorId?.email,
                    error: error.message
                });
            }
        }

        console.log(`Cleanup completed:`, cleanupResults);

        return res.status(200).json(
            new ApiResponse(200, cleanupResults, "Expired access cleanup completed")
        );
    } catch (error) {
        console.error('Cleanup expired access failed:', error);
        throw new ApiError(500, `Cleanup failed: ${error.message}`);
    }
});

// Get access request details with blockchain status
export const getAccessRequestDetails = asyncHandler(async (req, res) => {
    const { requestId } = req.params;

    const accessRequest = await AccessRequest.findById(requestId)
        .populate('doctorId', 'name email specialization walletAddress')
        .populate('patientId', 'name contractAddress contractDeploymentStatus')
        .populate('selectedRecords');

    if (!accessRequest) {
        throw new ApiError(404, "Access request not found");
    }

    // Check if user has permission to view this request
    const userId = req.user._id.toString();
    const isDoctorRequest = accessRequest.doctorId._id.toString() === userId;
    const isPatientRequest = accessRequest.patientId._id.toString() === userId;

    if (!isDoctorRequest && !isPatientRequest) {
        throw new ApiError(403, "Not authorized to view this access request");
    }

    // Add blockchain verification status
    let blockchainStatus = null;
    if (accessRequest.patientContractAddress && accessRequest.status === 'approved') {
        try {
            const doctor = accessRequest.doctorId;
            if (doctor.walletAddress) {
                const blockchainRecords = await contractService.getApprovedRecords(
                    accessRequest.patientContractAddress,
                    doctor.walletAddress
                );
                
                blockchainStatus = {
                    contractAddress: accessRequest.patientContractAddress,
                    hasBlockchainAccess: !!(blockchainRecords.prescriptions.length || blockchainRecords.reports.length || blockchainRecords.bills.length),
                    blockchainRecords
                };
            }
        } catch (error) {
            blockchainStatus = {
                contractAddress: accessRequest.patientContractAddress,
                error: error.message
            };
        }
    }

    return res.status(200).json(
        new ApiResponse(200, {
            ...accessRequest.toObject(),
            blockchainStatus
        }, "Access request details retrieved successfully")
    );
});

// ========================================
// ACCESS EXTENSION WORKFLOW
// ========================================

// Doctor requests access extension
export const requestAccessExtension = asyncHandler(async (req, res) => {
    const { accessRequestId, additionalTime, reason } = req.body;
    const doctorId = req.user._id;

    if (!accessRequestId || !additionalTime || additionalTime <= 0) {
        throw new ApiError(400, "Access request ID and valid additional time (in seconds) are required");
    }

    // Find the access request
    const accessRequest = await AccessRequest.findById(accessRequestId).populate('patientId', 'contractAddress contractDeploymentStatus');
    if (!accessRequest) {
        throw new ApiError(404, "Access request not found");
    }

    // Verify doctor ownership
    if (accessRequest.doctorId.toString() !== doctorId.toString()) {
        throw new ApiError(403, "Not authorized to request extension for this access request");
    }

    // Check if access is currently approved
    if (accessRequest.status !== 'approved') {
        throw new ApiError(400, "Can only request extension for approved access requests");
    }

    // Check if access has not expired yet
    if (accessRequest.accessExpiresAt && accessRequest.accessExpiresAt < new Date()) {
        throw new ApiError(400, "Cannot request extension for expired access");
    }

    try {
        // Step 1: Blockchain transaction (if patient has deployed contract)
        let blockchainTransactionHash = null;
        if (accessRequest.patientId.contractAddress && accessRequest.patientId.contractDeploymentStatus === 'deployed') {
            const blockchainResult = await contractService.requestExtendAccess(
                accessRequest.patientId.contractAddress,
                additionalTime
            );
            blockchainTransactionHash = blockchainResult.transactionHash;

            // Track blockchain transaction
            await trackAccessTransaction(
                accessRequestId,
                doctorId,
                accessRequest.doctorId.walletAddress,
                {
                    transactionHash: blockchainResult.transactionHash,
                    blockNumber: blockchainResult.blockNumber,
                    gasUsed: blockchainResult.gasUsed,
                    contractFunction: 'requestExtendAccess',
                    status: 'confirmed'
                }
            );
        }

        // Step 2: Add extension request to database
        accessRequest.extensionRequests.push({
            additionalTime: additionalTime,
            reason: reason || '',
            status: 'pending',
            blockchainTransactionHash
        });

        await accessRequest.save();

        // Populate for response
        await accessRequest.populate([
            { path: 'doctorId', select: 'name email specialization' },
            { path: 'patientId', select: 'name email' }
        ]);

        return res.status(200).json(
            new ApiResponse(200, {
                accessRequest,
                extensionRequest: accessRequest.extensionRequests[accessRequest.extensionRequests.length - 1],
                blockchainTransactionHash
            }, "Access extension requested successfully")
        );
    } catch (error) {
        console.error('Extension request failed:', error);
        throw new ApiError(500, `Failed to request access extension: ${error.message}`);
    }
});

// Patient approves access extension
export const approveAccessExtension = asyncHandler(async (req, res) => {
    const { accessRequestId, extensionRequestId } = req.body;
    const patientId = req.user._id;

    if (!accessRequestId || !extensionRequestId) {
        throw new ApiError(400, "Access request ID and extension request ID are required");
    }

    // Find the access request
    const accessRequest = await AccessRequest.findById(accessRequestId).populate('doctorId', 'name email walletAddress');
    if (!accessRequest) {
        throw new ApiError(404, "Access request not found");
    }

    // Verify patient ownership
    if (accessRequest.patientId.toString() !== patientId.toString()) {
        throw new ApiError(403, "Not authorized to approve extension for this access request");
    }

    // Find the extension request
    const extensionRequest = accessRequest.extensionRequests.id(extensionRequestId);
    if (!extensionRequest) {
        throw new ApiError(404, "Extension request not found");
    }

    // Check if extension request is still pending
    if (extensionRequest.status !== 'pending') {
        throw new ApiError(400, "Extension request has already been processed");
    }

    try {
        // Get patient info for blockchain transaction
        const patient = await Patient.findById(patientId);
        if (!patient) {
            throw new ApiError(404, "Patient not found");
        }

        // Step 1: Blockchain transaction (if contract deployed)
        let blockchainTransactionHash = null;
        if (patient.contractAddress && patient.contractDeploymentStatus === 'deployed') {
            const blockchainResult = await contractService.approveExtendAccess(
                patient.contractAddress,
                accessRequest.doctorId.walletAddress
            );
            blockchainTransactionHash = blockchainResult.transactionHash;

            // Track blockchain transaction
            await trackPatientTransaction(patientId, {
                transactionHash: blockchainResult.transactionHash,
                contractFunction: 'approveExtendAccess',
                blockNumber: blockchainResult.blockNumber,
                gasUsed: blockchainResult.gasUsed,
                status: 'confirmed',
                relatedData: {
                    doctorAddress: accessRequest.doctorId.walletAddress,
                    additionalTime: extensionRequest.additionalTime
                }
            });
        }

        // Step 2: Update database - extend access time
        const currentExpiryTime = accessRequest.accessExpiresAt || new Date();
        const newExpiryTime = new Date(currentExpiryTime.getTime() + (extensionRequest.additionalTime * 1000));
        
        accessRequest.accessExpiresAt = newExpiryTime;
        
        // Update extension request status
        extensionRequest.status = 'approved';
        extensionRequest.processedAt = new Date();
        extensionRequest.processedBy = patientId;
        extensionRequest.blockchainTransactionHash = blockchainTransactionHash;

        await accessRequest.save();

        return res.status(200).json(
            new ApiResponse(200, {
                accessRequest,
                extensionRequest,
                newExpiryTime,
                blockchainTransactionHash
            }, "Access extension approved successfully")
        );
    } catch (error) {
        console.error('Extension approval failed:', error);
        throw new ApiError(500, `Failed to approve access extension: ${error.message}`);
    }
});

// Patient denies access extension
export const denyAccessExtension = asyncHandler(async (req, res) => {
    const { accessRequestId, extensionRequestId, denialReason } = req.body;
    const patientId = req.user._id;

    if (!accessRequestId || !extensionRequestId) {
        throw new ApiError(400, "Access request ID and extension request ID are required");
    }

    // Find the access request
    const accessRequest = await AccessRequest.findById(accessRequestId);
    if (!accessRequest) {
        throw new ApiError(404, "Access request not found");
    }

    // Verify patient ownership
    if (accessRequest.patientId.toString() !== patientId.toString()) {
        throw new ApiError(403, "Not authorized to deny extension for this access request");
    }

    // Find the extension request
    const extensionRequest = accessRequest.extensionRequests.id(extensionRequestId);
    if (!extensionRequest) {
        throw new ApiError(404, "Extension request not found");
    }

    // Check if extension request is still pending
    if (extensionRequest.status !== 'pending') {
        throw new ApiError(400, "Extension request has already been processed");
    }

    // Update extension request status
    extensionRequest.status = 'denied';
    extensionRequest.processedAt = new Date();
    extensionRequest.processedBy = patientId;
    extensionRequest.reason = denialReason || extensionRequest.reason;

    await accessRequest.save();

    return res.status(200).json(
        new ApiResponse(200, {
            extensionRequest
        }, "Access extension denied successfully")
    );
});

// Get pending extension requests for a patient
export const getPatientExtensionRequests = asyncHandler(async (req, res) => {
    const patientId = req.user._id;

    try {
        const accessRequestsWithExtensions = await AccessRequest.find({
            patientId,
            'extensionRequests.status': 'pending'
        }).populate('doctorId', 'name email specialization');

        // Extract pending extension requests
        const pendingExtensions = [];
        accessRequestsWithExtensions.forEach(accessRequest => {
            accessRequest.extensionRequests.forEach(extension => {
                if (extension.status === 'pending') {
                    pendingExtensions.push({
                        accessRequestId: accessRequest._id,
                        extensionRequestId: extension._id,
                        doctor: accessRequest.doctorId,
                        currentExpiry: accessRequest.accessExpiresAt,
                        additionalTime: extension.additionalTime,
                        reason: extension.reason,
                        requestedAt: extension.requestedAt
                    });
                }
            });
        });

        return res.status(200).json(
            new ApiResponse(200, pendingExtensions, "Pending extension requests fetched successfully")
        );
    } catch (error) {
        console.error('Failed to fetch extension requests:', error);
        throw new ApiError(500, `Failed to fetch extension requests: ${error.message}`);
    }
});

// Get authorized access for a patient (doctors who have approved access)
export const getPatientAuthorizedAccess = asyncHandler(async (req, res) => {
    const patientId = req.user._id;

    try {
        const authorizedRequests = await AccessRequest.find({
            patientId,
            status: 'approved'
        }).populate('doctorId', 'name email specialization image phone')
          .populate('selectedRecords', 'name recordType dateCreated')
          .sort({ respondedAt: -1 });

        // Format the response to include useful information
        const formattedAccess = authorizedRequests.map(request => ({
            _id: request._id,
            doctorId: request.doctorId,
            status: request.status,
            approvedAt: request.respondedAt,
            accessExpiresAt: request.accessExpiresAt,
            isExpired: request.accessExpiresAt && request.accessExpiresAt < new Date(),
            accessDuration: request.accessExpiresAt ? 
                Math.ceil((new Date(request.accessExpiresAt) - new Date(request.respondedAt)) / (1000 * 60 * 60 * 24)) : null,
            authorizedRecords: request.selectedRecords,
            recordsCount: request.selectedRecords?.length || 0,
            requestReason: request.requestReason,
            patientNotes: request.patientNotes,
            extensionRequestsCount: request.extensionRequests?.filter(ext => ext.status === 'pending').length || 0,
            blockchainTransactions: request.blockchainTransactions
        }));

        return res.status(200).json(
            new ApiResponse(200, formattedAccess, "Authorized access fetched successfully")
        );
    } catch (error) {
        console.error('Failed to fetch authorized access:', error);
        throw new ApiError(500, `Failed to fetch authorized access: ${error.message}`);
    }
});

// Get extension requests for a doctor
export const getDoctorExtensionRequests = asyncHandler(async (req, res) => {
    const doctorId = req.user._id;

    try {
        const accessRequestsWithExtensions = await AccessRequest.find({
            doctorId,
            $or: [
                { 'extensionRequests.status': 'pending' },
                { 'extensionRequests.status': 'approved' },
                { 'extensionRequests.status': 'denied' }
            ]
        }).populate('patientId', 'name email');

        // Extract extension requests
        const extensionRequests = [];
        accessRequestsWithExtensions.forEach(accessRequest => {
            accessRequest.extensionRequests.forEach(extension => {
                extensionRequests.push({
                    accessRequestId: accessRequest._id,
                    extensionRequestId: extension._id,
                    patient: accessRequest.patientId,
                    currentExpiry: accessRequest.accessExpiresAt,
                    additionalTime: extension.additionalTime,
                    reason: extension.reason,
                    status: extension.status,
                    requestedAt: extension.requestedAt,
                    processedAt: extension.processedAt,
                    blockchainTransactionHash: extension.blockchainTransactionHash
                });
            });
        });

        return res.status(200).json(
            new ApiResponse(200, extensionRequests, "Extension requests fetched successfully")
        );
    } catch (error) {
        console.error('Failed to fetch doctor extension requests:', error);
        throw new ApiError(500, `Failed to fetch extension requests: ${error.message}`);
    }
});

// Check extension request status on blockchain
export const checkBlockchainExtensionStatus = asyncHandler(async (req, res) => {
    const { contractAddress, doctorAddress } = req.params;

    if (!contractAddress || !doctorAddress) {
        throw new ApiError(400, "Contract address and doctor address are required");
    }

    try {
        const extensionInfo = await contractService.checkExtensionRequest(contractAddress, doctorAddress);

        return res.status(200).json(
            new ApiResponse(200, {
                exists: extensionInfo.exists,
                additionalTime: extensionInfo.additionalTime,
                requestTime: extensionInfo.requestTime,
                contractAddress,
                doctorAddress
            }, "Blockchain extension status fetched successfully")
        );
    } catch (error) {
        console.error('Failed to check blockchain extension status:', error);
        throw new ApiError(500, `Failed to check blockchain extension status: ${error.message}`);
    }
});

// ========================================
// ACCESS MONITORING FUNCTIONS
// ========================================

// Check if doctor's access has expired (doctor endpoint)
export const checkAccessExpiry = asyncHandler(async (req, res) => {
    const { contractAddress } = req.params;
    const doctorId = req.user._id;

    if (!contractAddress) {
        throw new ApiError(400, "Contract address is required");
    }

    try {
        // Get doctor's wallet address
        const doctor = await Doctor.findById(doctorId);
        if (!doctor || !doctor.walletAddress) {
            throw new ApiError(404, "Doctor or wallet address not found");
        }

        // Check access expiry on blockchain
        const hasExpired = await contractService.hasAccessExpired(contractAddress, doctor.walletAddress);

        // Also check database status for comparison
        const now = new Date();
        const databaseAccessRequest = await AccessRequest.findOne({
            doctorId,
            status: 'approved',
            accessExpiresAt: { $gt: now }
        }).populate('patientId', 'name contractAddress');

        return res.status(200).json(
            new ApiResponse(200, {
                contractAddress,
                doctorAddress: doctor.walletAddress,
                blockchainExpired: hasExpired,
                databaseHasActiveAccess: !!databaseAccessRequest,
                databaseAccessRequest: databaseAccessRequest ? {
                    id: databaseAccessRequest._id,
                    patientName: databaseAccessRequest.patientId?.name,
                    expiresAt: databaseAccessRequest.accessExpiresAt
                } : null,
                isConsistent: hasExpired === !databaseAccessRequest,
                lastChecked: new Date().toISOString()
            }, "Access expiry status checked successfully")
        );
    } catch (error) {
        console.error('Failed to check access expiry:', error);
        throw new ApiError(500, `Failed to check access expiry: ${error.message}`);
    }
});

// Get comprehensive access status for a doctor (doctor endpoint)
export const getDoctorAccessStatus = asyncHandler(async (req, res) => {
    const { contractAddress } = req.params;
    const doctorId = req.user._id;

    if (!contractAddress) {
        throw new ApiError(400, "Contract address is required");
    }

    try {
        // Get doctor's wallet address
        const doctor = await Doctor.findById(doctorId);
        if (!doctor || !doctor.walletAddress) {
            throw new ApiError(404, "Doctor or wallet address not found");
        }

        // Get comprehensive access status from blockchain
        const accessStatus = await contractService.getAccessStatus(contractAddress, doctor.walletAddress);

        // Get database access info for comparison
        const databaseAccessRequests = await AccessRequest.find({
            doctorId,
            status: 'approved'
        }).populate('patientId', 'name contractAddress')
          .sort({ accessExpiresAt: -1 });

        return res.status(200).json(
            new ApiResponse(200, {
                blockchainStatus: accessStatus,
                databaseRequests: databaseAccessRequests.map(request => ({
                    id: request._id,
                    patientName: request.patientId?.name,
                    status: request.status,
                    expiresAt: request.accessExpiresAt,
                    isExpired: request.accessExpiresAt && request.accessExpiresAt < new Date(),
                    recordsCount: request.selectedRecords?.length || 0
                })),
                summary: {
                    totalApprovedRequests: databaseAccessRequests.length,
                    activeRequests: databaseAccessRequests.filter(r => 
                        !r.accessExpiresAt || r.accessExpiresAt > new Date()
                    ).length,
                    expiredRequests: databaseAccessRequests.filter(r => 
                        r.accessExpiresAt && r.accessExpiresAt < new Date()
                    ).length
                }
            }, "Doctor access status retrieved successfully")
        );
    } catch (error) {
        console.error('Failed to get doctor access status:', error);
        throw new ApiError(500, `Failed to get access status: ${error.message}`);
    }
});

// Get access monitoring dashboard for patient (patient endpoint)
export const getPatientAccessMonitoring = asyncHandler(async (req, res) => {
    const patientId = req.user._id;

    try {
        // Get patient's contract info
        const patient = await Patient.findById(patientId);
        if (!patient) {
            throw new ApiError(404, "Patient not found");
        }

        // Get all approved access requests for this patient
        const approvedRequests = await AccessRequest.find({
            patientId,
            status: 'approved'
        }).populate('doctorId', 'name email specialization walletAddress');

        // If no contract deployed, return database-only info
        if (!patient.contractAddress || patient.contractDeploymentStatus !== 'deployed') {
            return res.status(200).json(
                new ApiResponse(200, {
                    contractAddress: null,
                    contractDeployed: false,
                    databaseAccessRequests: approvedRequests.map(request => ({
                        id: request._id,
                        doctor: request.doctorId,
                        expiresAt: request.accessExpiresAt,
                        isExpired: request.accessExpiresAt && request.accessExpiresAt < new Date(),
                        recordsCount: request.selectedRecords?.length || 0,
                        extensionRequestsCount: request.extensionRequests?.filter(ext => ext.status === 'pending').length || 0
                    })),
                    blockchainStatus: null
                }, "Patient access monitoring (database only - no contract deployed)")
            );
        }

        // Get doctors with wallet addresses for blockchain checking
        const doctorsWithWallets = approvedRequests
            .filter(request => request.doctorId.walletAddress)
            .map(request => request.doctorId.walletAddress);

        // Batch check blockchain access status for all doctors
        let blockchainStatuses = [];
        if (doctorsWithWallets.length > 0) {
            try {
                blockchainStatuses = await contractService.batchCheckAccessStatus(
                    patient.contractAddress, 
                    doctorsWithWallets
                );
            } catch (error) {
                console.error('Blockchain batch check failed:', error);
                blockchainStatuses = [];
            }
        }

        // Combine database and blockchain info
        const accessMonitoring = approvedRequests.map(request => {
            const blockchainStatus = blockchainStatuses.find(
                status => status.doctorAddress === request.doctorId.walletAddress
            );

            return {
                id: request._id,
                doctor: {
                    id: request.doctorId._id,
                    name: request.doctorId.name,
                    email: request.doctorId.email,
                    specialization: request.doctorId.specialization,
                    walletAddress: request.doctorId.walletAddress
                },
                databaseStatus: {
                    expiresAt: request.accessExpiresAt,
                    isExpired: request.accessExpiresAt && request.accessExpiresAt < new Date(),
                    recordsCount: request.selectedRecords?.length || 0,
                    pendingExtensions: request.extensionRequests?.filter(ext => ext.status === 'pending').length || 0
                },
                blockchainStatus: blockchainStatus || null,
                isConsistent: blockchainStatus ? 
                    (request.accessExpiresAt && request.accessExpiresAt < new Date()) === blockchainStatus.hasExpired : 
                    null
            };
        });

        // Calculate summary statistics
        const now = new Date();
        const summary = {
            totalApprovedRequests: approvedRequests.length,
            activeRequests: approvedRequests.filter(r => !r.accessExpiresAt || r.accessExpiresAt > now).length,
            expiredRequests: approvedRequests.filter(r => r.accessExpiresAt && r.accessExpiresAt < now).length,
            pendingExtensions: approvedRequests.reduce((count, r) => 
                count + (r.extensionRequests?.filter(ext => ext.status === 'pending').length || 0), 0
            ),
            doctorsWithBlockchainAccess: blockchainStatuses.filter(status => !status.error && status.hasActiveAccess).length,
            blockchainInconsistencies: accessMonitoring.filter(item => item.isConsistent === false).length
        };

        return res.status(200).json(
            new ApiResponse(200, {
                contractAddress: patient.contractAddress,
                contractDeployed: true,
                accessMonitoring,
                summary,
                lastChecked: new Date().toISOString()
            }, "Patient access monitoring retrieved successfully")
        );
    } catch (error) {
        console.error('Failed to get patient access monitoring:', error);
        throw new ApiError(500, `Failed to get access monitoring: ${error.message}`);
    }
});

// Force refresh access status from blockchain
export const refreshAccessStatus = asyncHandler(async (req, res) => {
    const { contractAddress, doctorAddress } = req.body;
    
    if (!contractAddress) {
        throw new ApiError(400, "Contract address is required");
    }

    try {
        let result;
        
        if (doctorAddress) {
            // Refresh specific doctor's access status
            result = await contractService.getAccessStatus(contractAddress, doctorAddress);
        } else {
            // Get all approved requests for this patient/contract
            const patient = await Patient.findOne({ contractAddress });
            if (!patient) {
                throw new ApiError(404, "Patient not found for this contract address");
            }

            const approvedRequests = await AccessRequest.find({
                patientId: patient._id,
                status: 'approved'
            }).populate('doctorId', 'walletAddress');

            const doctorAddresses = approvedRequests
                .map(req => req.doctorId.walletAddress)
                .filter(addr => addr);

            result = await contractService.batchCheckAccessStatus(contractAddress, doctorAddresses);
        }

        return res.status(200).json(
            new ApiResponse(200, result, "Access status refreshed successfully")
        );
    } catch (error) {
        console.error('Failed to refresh access status:', error);
        throw new ApiError(500, `Failed to refresh access status: ${error.message}`);
    }
}); 