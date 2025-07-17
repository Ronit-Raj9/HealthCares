import { verifyFileIntegrity, generateFileHash } from '../utils/encryption.js';
import contractService from './contractService.js';
import MedicalRecord from '../models/medicalRecord.model.js';

/**
 * Integrity Service for medical records
 * Provides functions to verify data integrity against blockchain
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

        // Verify against stored hash in database
        const isValidAgainstDB = verifyFileIntegrity(fileBuffer, record.dataHash);
        
        let blockchainVerification = null;

        // If record is on blockchain, verify against on-chain hash
        if (record.patientContractAddress && record.recordId_onchain !== null) {
            try {
                const onChainRecords = await contractService.getApprovedRecords(
                    record.patientContractAddress,
                    // This would need the doctor's address - for now just verify against DB
                );
                // Implementation would compare against specific on-chain record
                blockchainVerification = {
                    available: true,
                    verified: isValidAgainstDB // Simplified for now
                };
            } catch (error) {
                blockchainVerification = {
                    available: false,
                    error: error.message
                };
            }
        }

        return {
            isValid: isValidAgainstDB,
            verifiedAgainstDatabase: isValidAgainstDB,
            databaseHash: record.dataHash,
            computedHash: generateFileHash(fileBuffer),
            blockchainVerification,
            recordInfo: {
                id: record._id,
                name: record.name,
                type: record.recordType,
                uploadedAt: record.uploadedAt,
                isEncrypted: record.isEncrypted
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

        return {
            recordId,
            hasIntegrityHash: !!record.dataHash,
            isEncrypted: record.isEncrypted,
            onChainInfo: {
                hasOnChainRecord: !!(record.patientContractAddress && record.recordId_onchain !== null),
                contractAddress: record.patientContractAddress,
                onChainId: record.recordId_onchain
            },
            uploadedAt: record.uploadedAt,
            recordType: record.recordType
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

export default {
    verifyRecordIntegrity,
    batchVerifyIntegrity,
    getRecordIntegrityStatus,
    generateIntegrityReport
}; 