import { verifyFileIntegrity, generateFileHash } from '../utils/encryption.js';
import contractService from './contractService.js';
import MedicalRecord from '../models/medicalRecord.model.js';

/**
 * Integrity Service for medical records
 * Provides functions to verify data integrity against blockchain and database
 */

/**
 * Verify integrity of a medical record against on-chain hash
 * @param {Buffer} fileBuffer - Decrypted file data
 * @param {string} recordId - Medical record ID
 * @returns {Object} - Verification result
 */
export const verifyRecordIntegrity = async (fileBuffer, recordId) => {
    try {
        // Get record from database
        const record = await MedicalRecord.findById(recordId);
        if (!record) {
            throw new Error('Medical record not found');
        }

        // Generate current hash of the file
        const currentHash = generateFileHash(fileBuffer);

        // Verify against stored hash in database
        const isValidAgainstDB = verifyFileIntegrity(fileBuffer, record.dataHash);
        
        let blockchainVerification = {
            available: false,
            verified: false,
            hash: null,
            error: null
        };

        // If record is on blockchain, verify against on-chain hash
        if (record.patientContractAddress && record.name && record.recordType) {
            try {
                const blockchainHash = await contractService.getRecordHash(
                    record.patientContractAddress,
                    record.name,
                    record.recordType
                );

                if (blockchainHash) {
                    blockchainVerification = {
                        available: true,
                        verified: verifyFileIntegrity(fileBuffer, blockchainHash),
                        hash: blockchainHash,
                        error: null
                    };
                } else {
                    blockchainVerification = {
                        available: false,
                        verified: false,
                        hash: null,
                        error: 'Blockchain hash not found'
                    };
                }
            } catch (error) {
                blockchainVerification = {
                    available: false,
                    verified: false,
                    hash: null,
                    error: error.message
                };
            }
        }

        return {
            isValid: isValidAgainstDB && (blockchainVerification.verified || !blockchainVerification.available),
            verifiedAgainstDatabase: isValidAgainstDB,
            databaseHash: record.dataHash,
            computedHash: currentHash,
            blockchainVerification,
            recordInfo: {
                id: record._id,
                name: record.name,
                type: record.recordType,
                uploadedAt: record.uploadedAt,
                isEncrypted: record.isEncrypted,
                hasBlockchainRecord: !!(record.patientContractAddress && record.recordId_onchain !== null)
            }
        };
    } catch (error) {
        throw new Error(`Integrity verification failed: ${error.message}`);
    }
};

/**
 * Batch verify multiple records
 * @param {Array} verificationRequests - Array of {fileBuffer, recordId}
 * @returns {Array} - Array of verification results
 */
export const batchVerifyIntegrity = async (verificationRequests) => {
    const results = [];
    
    for (const request of verificationRequests) {
        try {
            const result = await verifyRecordIntegrity(request.fileBuffer, request.recordId);
            results.push({
                recordId: request.recordId,
                success: true,
                ...result
            });
        } catch (error) {
            results.push({
                recordId: request.recordId,
                success: false,
                error: error.message
            });
        }
    }
    
    return results;
};

/**
 * Get integrity status for a record without file data
 * @param {string} recordId - Medical record ID
 * @returns {Object} - Integrity status information
 */
export const getRecordIntegrityStatus = async (recordId) => {
    try {
        const record = await MedicalRecord.findById(recordId);
        if (!record) {
            throw new Error('Medical record not found');
        }

        let blockchainHashStatus = {
            available: false,
            hash: null,
            error: null
        };

        // Check if blockchain hash is available
        if (record.patientContractAddress && record.name && record.recordType) {
            try {
                const blockchainHash = await contractService.getRecordHash(
                    record.patientContractAddress,
                    record.name,
                    record.recordType
                );

                if (blockchainHash) {
                    blockchainHashStatus = {
                        available: true,
                        hash: blockchainHash,
                        error: null
                    };
                } else {
                    blockchainHashStatus = {
                        available: false,
                        hash: null,
                        error: 'Hash not found on blockchain'
                    };
                }
            } catch (error) {
                blockchainHashStatus = {
                    available: false,
                    hash: null,
                    error: error.message
                };
            }
        }

        return {
            recordId,
            hasIntegrityHash: !!record.dataHash,
            databaseHash: record.dataHash,
            isEncrypted: record.isEncrypted,
            onChainInfo: {
                hasOnChainRecord: !!(record.patientContractAddress && record.recordId_onchain !== null),
                contractAddress: record.patientContractAddress,
                onChainId: record.recordId_onchain
            },
            blockchainHashStatus,
            uploadedAt: record.uploadedAt,
            recordType: record.recordType,
            recordName: record.name
        };
    } catch (error) {
        throw new Error(`Failed to get integrity status: ${error.message}`);
    }
};

/**
 * Verify integrity and return detailed report
 * @param {Buffer} fileBuffer - File data
 * @param {string} expectedHash - Expected hash
 * @param {Object} additionalInfo - Additional verification info
 * @returns {Object} - Detailed verification report
 */
export const generateIntegrityReport = (fileBuffer, expectedHash, additionalInfo = {}) => {
    const computedHash = generateFileHash(fileBuffer);
    const isValid = computedHash === expectedHash;
    
    return {
        isValid,
        expectedHash,
        computedHash,
        fileSize: fileBuffer.length,
        verificationTimestamp: new Date().toISOString(),
        hashAlgorithm: 'SHA-256',
        additionalInfo
    };
};

/**
 * Compare database and blockchain hashes for a record
 * @param {string} recordId - Medical record ID
 * @returns {Object} - Hash comparison result
 */
export const compareHashes = async (recordId) => {
    try {
        const record = await MedicalRecord.findById(recordId);
        if (!record) {
            throw new Error('Medical record not found');
        }

        let blockchainHash = null;
        let blockchainError = null;

        if (record.patientContractAddress && record.name && record.recordType) {
            try {
                blockchainHash = await contractService.getRecordHash(
                    record.patientContractAddress,
                    record.name,
                    record.recordType
                );
            } catch (error) {
                blockchainError = error.message;
            }
        }

        const hashesMatch = blockchainHash && record.dataHash && (blockchainHash === record.dataHash);

        return {
            recordId,
            databaseHash: record.dataHash,
            blockchainHash,
            hashesMatch,
            blockchainAvailable: !!blockchainHash,
            blockchainError,
            comparisonTimestamp: new Date().toISOString()
        };
    } catch (error) {
        throw new Error(`Hash comparison failed: ${error.message}`);
    }
};

/**
 * Get all records with integrity verification status for a patient
 * @param {string} patientId - Patient ID
 * @returns {Array} - Array of records with integrity status
 */
export const getPatientRecordsIntegrityStatus = async (patientId) => {
    try {
        const records = await MedicalRecord.find({ patientId });
        
        const integrityStatuses = await Promise.all(
            records.map(async (record) => {
                try {
                    const status = await getRecordIntegrityStatus(record._id);
                    return {
                        recordId: record._id,
                        recordName: record.name,
                        recordType: record.recordType,
                        uploadedAt: record.uploadedAt,
                        ...status
                    };
                } catch (error) {
                    return {
                        recordId: record._id,
                        recordName: record.name,
                        recordType: record.recordType,
                        uploadedAt: record.uploadedAt,
                        error: error.message
                    };
                }
            })
        );

        return integrityStatuses;
    } catch (error) {
        throw new Error(`Failed to get patient records integrity status: ${error.message}`);
    }
};

export default {
    verifyRecordIntegrity,
    batchVerifyIntegrity,
    getRecordIntegrityStatus,
    generateIntegrityReport,
    compareHashes,
    getPatientRecordsIntegrityStatus
}; 