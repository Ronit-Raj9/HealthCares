import Patient from '../models/patient.model.js';
import MedicalRecord from '../models/medicalRecord.model.js';

/**
 * Track a blockchain transaction in patient's contract transaction history
 * @param {string} patientId - Patient's ID
 * @param {Object} transactionData - Transaction details
 * @param {string} transactionData.transactionHash - Transaction hash
 * @param {string} transactionData.contractFunction - Smart contract function called
 * @param {number} transactionData.blockNumber - Block number
 * @param {number} transactionData.gasUsed - Gas used
 * @param {string} transactionData.status - Transaction status
 * @param {Object} transactionData.relatedData - Additional context data
 */
export const trackPatientTransaction = async (patientId, transactionData) => {
    try {
        await Patient.findByIdAndUpdate(patientId, {
            $push: {
                contractTransactionHistory: {
                    transactionHash: transactionData.transactionHash,
                    contractFunction: transactionData.contractFunction,
                    blockNumber: transactionData.blockNumber,
                    gasUsed: transactionData.gasUsed,
                    timestamp: new Date(),
                    status: transactionData.status || 'confirmed',
                    relatedData: transactionData.relatedData || {}
                }
            }
        });
        console.log(`Contract transaction ${transactionData.contractFunction} tracked for patient ${patientId}`);
    } catch (error) {
        console.error('Error tracking patient transaction:', error);
    }
};

/**
 * Track access-related transaction in medical record based on your contract functions
 * @param {string} recordId - Medical record ID
 * @param {string} doctorId - Doctor ID  
 * @param {string} doctorWalletAddress - Doctor's wallet address
 * @param {Object} transactionData - Transaction details including contractFunction
 */
export const trackAccessTransaction = async (recordId, doctorId, doctorWalletAddress, transactionData) => {
    try {
        const accessTransaction = {
            doctorWalletAddress,
            doctorId,
            transactionHash: transactionData.transactionHash,
            blockNumber: transactionData.blockNumber,
            gasUsed: transactionData.gasUsed,
            contractFunction: transactionData.contractFunction, // requestAccess, approveAccess, revokeAccess
            timestamp: new Date(),
            status: transactionData.status || 'confirmed'
        };

        // Add specific data for approveAccess function
        if (transactionData.contractFunction === 'approveAccess') {
            accessTransaction.expiryDuration = transactionData.expiryDuration;
            accessTransaction.approvedRecordIds = transactionData.approvedRecordIds;
            accessTransaction.recordType = transactionData.recordType;
        }

        await MedicalRecord.findByIdAndUpdate(recordId, {
            $push: {
                'blockchainTransactions.accessTransactions': accessTransaction
            }
        });
        
        console.log(`Access transaction ${transactionData.contractFunction} tracked for record ${recordId}`);
    } catch (error) {
        console.error('Error tracking access transaction:', error);
    }
};

/**
 * Get all contract transactions for a patient
 * @param {string} patientId - Patient's ID
 * @returns {Array} Array of contract transactions
 */
export const getPatientTransactions = async (patientId) => {
    try {
        const patient = await Patient.findById(patientId).select('contractTransactionHistory');
        return patient?.contractTransactionHistory || [];
    } catch (error) {
        console.error('Error fetching patient transactions:', error);
        return [];
    }
};

/**
 * Get transaction statistics for a patient
 * @param {string} patientId - Patient's ID
 * @returns {Object} Transaction statistics
 */
export const getPatientTransactionStats = async (patientId) => {
    try {
        const patient = await Patient.findById(patientId).select('contractTransactionHistory');
        const transactions = patient?.contractTransactionHistory || [];
        
        const stats = {
            total: transactions.length,
            byFunction: {}, // Group by contract function called
            byStatus: {},
            byRecordType: {}, // For record-related transactions
            totalGasUsed: 0,
            latestTransaction: null,
            contractStats: {
                profileUpdates: 0,
                recordUploads: 0,
                accessManagement: 0
            }
        };
        
        transactions.forEach(tx => {
            // Count by contract function
            stats.byFunction[tx.contractFunction] = (stats.byFunction[tx.contractFunction] || 0) + 1;
            
            // Count by status
            stats.byStatus[tx.status] = (stats.byStatus[tx.status] || 0) + 1;
            
            // Count by record type for record-related transactions
            if (tx.relatedData?.recordType) {
                stats.byRecordType[tx.relatedData.recordType] = (stats.byRecordType[tx.relatedData.recordType] || 0) + 1;
            }
            
            // Categorize contract operations
            if (['updatePatientName', 'updatePatientAge', 'updatePatientGender', 'updatePatientHeight', 'updatePatientWeight', 'updatePatientBloodGroup'].includes(tx.contractFunction)) {
                stats.contractStats.profileUpdates++;
            } else if (['addBill', 'addPrescription', 'addReport'].includes(tx.contractFunction)) {
                stats.contractStats.recordUploads++;
            } else if (['requestAccess', 'approveAccess', 'revokeAccess', 'requestExtendAccess', 'approveExtendAccess'].includes(tx.contractFunction)) {
                stats.contractStats.accessManagement++;
            }
            
            // Sum gas used
            if (tx.gasUsed) {
                stats.totalGasUsed += tx.gasUsed;
            }
            
            // Track latest transaction
            if (!stats.latestTransaction || tx.timestamp > stats.latestTransaction.timestamp) {
                stats.latestTransaction = tx;
            }
        });
        
        return stats;
    } catch (error) {
        console.error('Error calculating transaction stats:', error);
        return null;
    }
}; 