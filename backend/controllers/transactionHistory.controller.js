import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { 
    getPatientTransactions, 
    getPatientTransactionStats 
} from '../utils/transactionTracker.js';
import Patient from '../models/patient.model.js';
import MedicalRecord from '../models/medicalRecord.model.js';

/**
 * Get all contract transactions for a patient
 */
export const getPatientTransactionHistory = asyncHandler(async (req, res) => {
    const patientId = req.user._id;
    
    try {
        const transactions = await getPatientTransactions(patientId);
        const stats = await getPatientTransactionStats(patientId);
        
        return res.status(200).json(
            new ApiResponse(200, {
                transactions,
                stats,
                totalTransactions: transactions.length
            }, "Transaction history fetched successfully")
        );
    } catch (error) {
        throw new ApiError(500, `Failed to fetch transaction history: ${error.message}`);
    }
});

/**
 * Get transaction history for a specific medical record
 */
export const getRecordTransactionHistory = asyncHandler(async (req, res) => {
    const { recordId } = req.params;
    const userId = req.user._id;
    
    try {
        // Verify user has access to this record
        const record = await MedicalRecord.findById(recordId);
        if (!record) {
            throw new ApiError(404, "Medical record not found");
        }
        
        // Check if user is the owner or has authorized access
        const isOwner = record.patientId.toString() === userId.toString();
        const isAuthorized = record.authorizedUsers.some(
            user => user.userId.toString() === userId.toString() && user.accessStatus === 'approved'
        );
        
        if (!isOwner && !isAuthorized) {
            throw new ApiError(403, "Not authorized to view this record's transaction history");
        }
        
        // Get transaction history from the record
        const transactionHistory = {
            upload: record.blockchainTransactions?.upload || null,
            accessTransactions: record.blockchainTransactions?.accessTransactions || []
        };
        
        return res.status(200).json(
            new ApiResponse(200, {
                recordId,
                recordName: record.name,
                recordType: record.recordType,
                transactionHistory,
                contractAddress: record.patientContractAddress,
                onChainRecordId: record.recordId_onchain
            }, "Record transaction history fetched successfully")
        );
    } catch (error) {
        throw new ApiError(500, `Failed to fetch record transaction history: ${error.message}`);
    }
});

/**
 * Get contract transaction statistics for patient
 */
export const getPatientContractStats = asyncHandler(async (req, res) => {
    const patientId = req.user._id;
    
    try {
        const patient = await Patient.findById(patientId).select(
            'contractAddress contractDeploymentTx contractDeploymentStatus contractDeploymentBlockNumber contractDeploymentGasUsed'
        );
        
        if (!patient) {
            throw new ApiError(404, "Patient not found");
        }
        
        const stats = await getPatientTransactionStats(patientId);
        
        return res.status(200).json(
            new ApiResponse(200, {
                contractInfo: {
                    address: patient.contractAddress,
                    deploymentTx: patient.contractDeploymentTx,
                    deploymentStatus: patient.contractDeploymentStatus,
                    deploymentBlock: patient.contractDeploymentBlockNumber,
                    deploymentGas: patient.contractDeploymentGasUsed
                },
                transactionStats: stats
            }, "Contract statistics fetched successfully")
        );
    } catch (error) {
        throw new ApiError(500, `Failed to fetch contract statistics: ${error.message}`);
    }
});

/**
 * Get transactions by function type
 */
export const getTransactionsByFunction = asyncHandler(async (req, res) => {
    const { contractFunction } = req.params;
    const patientId = req.user._id;
    
    try {
        const transactions = await getPatientTransactions(patientId);
        const filteredTransactions = transactions.filter(
            tx => tx.contractFunction === contractFunction
        );
        
        return res.status(200).json(
            new ApiResponse(200, {
                contractFunction,
                transactions: filteredTransactions,
                count: filteredTransactions.length
            }, `Transactions for ${contractFunction} fetched successfully`)
        );
    } catch (error) {
        throw new ApiError(500, `Failed to fetch transactions by function: ${error.message}`);
    }
}); 