import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { ApiResponse } from '../utils/apiResponse.js';
import Patient from '../models/patient.model.js';
import Doctor from '../models/doctor.model.js';
import MedicalRecord from '../models/medicalRecord.model.js';
import AccessRequest from '../models/accessRequest.model.js';
import contractService from '../services/contractService.js';

/**
 * Admin Controller for Factory Utility Functions and System Statistics
 * Provides comprehensive system overview and blockchain factory contract integration
 */

// ========================================
// FACTORY CONTRACT UTILITY FUNCTIONS
// ========================================

// Get all patient IDs from factory contract
export const getAllPatientIds = asyncHandler(async (req, res) => {
    try {
        const patientIds = await contractService.getAllPatientIds();

        // Also get database patient count for comparison
        const databasePatientCount = await Patient.countDocuments({
            contractDeploymentStatus: 'deployed'
        });

        return res.status(200).json(
            new ApiResponse(200, {
                blockchainPatientIds: patientIds,
                blockchainCount: patientIds.length,
                databaseDeployedCount: databasePatientCount,
                isConsistent: patientIds.length === databasePatientCount
            }, "All patient IDs fetched from factory contract successfully")
        );
    } catch (error) {
        console.error('Failed to fetch patient IDs from factory:', error);
        throw new ApiError(500, `Failed to fetch patient IDs: ${error.message}`);
    }
});

// Get total patient count from factory contract
export const getPatientCount = asyncHandler(async (req, res) => {
    try {
        const blockchainCount = await contractService.getPatientCount();
        
        // Get database statistics for comparison
        const databaseStats = {
            total: await Patient.countDocuments(),
            deployed: await Patient.countDocuments({ contractDeploymentStatus: 'deployed' }),
            pending: await Patient.countDocuments({ contractDeploymentStatus: 'pending' }),
            failed: await Patient.countDocuments({ contractDeploymentStatus: 'failed' })
        };

        return res.status(200).json(
            new ApiResponse(200, {
                blockchainCount,
                databaseStats,
                consistency: {
                    isConsistent: blockchainCount === databaseStats.deployed,
                    difference: databaseStats.deployed - blockchainCount
                }
            }, "Patient count fetched successfully")
        );
    } catch (error) {
        console.error('Failed to fetch patient count:', error);
        throw new ApiError(500, `Failed to fetch patient count: ${error.message}`);
    }
});

// Get contract address by patient ID from factory
export const getContractByPatientId = asyncHandler(async (req, res) => {
    const { patientId } = req.params;

    if (!patientId) {
        throw new ApiError(400, "Patient ID is required");
    }

    try {
        // Convert MongoDB ObjectId to number (this might need adjustment based on your ID system)
        const numericPatientId = parseInt(patientId.slice(-8), 16); // Use last 8 chars as hex
        
        const contractAddress = await contractService.getContractByPatientId(numericPatientId);
        
        // Also get database info for comparison
        const patient = await Patient.findById(patientId).select('contractAddress contractDeploymentStatus name');
        
        return res.status(200).json(
            new ApiResponse(200, {
                patientId,
                numericPatientId,
                blockchainContractAddress: contractAddress,
                databaseInfo: patient ? {
                    contractAddress: patient.contractAddress,
                    deploymentStatus: patient.contractDeploymentStatus,
                    name: patient.name,
                    isConsistent: patient.contractAddress === contractAddress
                } : null
            }, "Contract address fetched from factory successfully")
        );
    } catch (error) {
        console.error('Failed to fetch contract by patient ID:', error);
        throw new ApiError(500, `Failed to fetch contract: ${error.message}`);
    }
});

// Get patient ID by wallet address from factory
export const getPatientIdByAddress = asyncHandler(async (req, res) => {
    const { walletAddress } = req.params;

    if (!walletAddress) {
        throw new ApiError(400, "Wallet address is required");
    }

    try {
        const patientId = await contractService.getPatientIdByAddress(walletAddress);
        
        // Also get database info for comparison
        const patient = await Patient.findOne({ walletAddress }).select('_id name contractAddress contractDeploymentStatus');
        
        return res.status(200).json(
            new ApiResponse(200, {
                walletAddress,
                blockchainPatientId: patientId,
                databaseInfo: patient ? {
                    databaseId: patient._id,
                    name: patient.name,
                    contractAddress: patient.contractAddress,
                    deploymentStatus: patient.contractDeploymentStatus
                } : null
            }, "Patient ID fetched from factory successfully")
        );
    } catch (error) {
        console.error('Failed to fetch patient ID by address:', error);
        throw new ApiError(500, `Failed to fetch patient ID: ${error.message}`);
    }
});

// ========================================
// SYSTEM STATISTICS AND OVERVIEW
// ========================================

// Get comprehensive system statistics
export const getSystemStatistics = asyncHandler(async (req, res) => {
    try {
        // Database statistics
        const dbStats = {
            patients: {
                total: await Patient.countDocuments(),
                deployed: await Patient.countDocuments({ contractDeploymentStatus: 'deployed' }),
                pending: await Patient.countDocuments({ contractDeploymentStatus: 'pending' }),
                failed: await Patient.countDocuments({ contractDeploymentStatus: 'failed' })
            },
            doctors: {
                total: await Doctor.countDocuments(),
                verified: await Doctor.countDocuments({ isVerified: true }),
                withKeys: await Doctor.countDocuments({ isKeyPairGenerated: true })
            },
            records: {
                total: await MedicalRecord.countDocuments(),
                withBlockchain: await MedicalRecord.countDocuments({ recordId_onchain: { $ne: null } }),
                bills: await MedicalRecord.countDocuments({ recordType: 'bill' }),
                prescriptions: await MedicalRecord.countDocuments({ recordType: 'prescription' }),
                reports: await MedicalRecord.countDocuments({ recordType: 'report' })
            },
            accessRequests: {
                total: await AccessRequest.countDocuments(),
                pending: await AccessRequest.countDocuments({ status: 'pending' }),
                approved: await AccessRequest.countDocuments({ status: 'approved' }),
                denied: await AccessRequest.countDocuments({ status: 'denied' }),
                revoked: await AccessRequest.countDocuments({ status: 'revoked' })
            }
        };

        // Blockchain statistics (if factory available)
        let blockchainStats = null;
        try {
            const blockchainPatientCount = await contractService.getPatientCount();
            const allPatientIds = await contractService.getAllPatientIds();
            
            blockchainStats = {
                totalPatients: blockchainPatientCount,
                patientIds: allPatientIds,
                consistency: {
                    dbVsBlockchain: blockchainPatientCount === dbStats.patients.deployed,
                    difference: dbStats.patients.deployed - blockchainPatientCount
                }
            };
        } catch (error) {
            blockchainStats = {
                error: error.message,
                available: false
            };
        }

        // System health indicators
        const healthIndicators = {
            contractDeploymentRate: dbStats.patients.total > 0 ? 
                (dbStats.patients.deployed / dbStats.patients.total * 100).toFixed(2) + '%' : '0%',
            blockchainIntegrationRate: dbStats.records.total > 0 ? 
                (dbStats.records.withBlockchain / dbStats.records.total * 100).toFixed(2) + '%' : '0%',
            doctorVerificationRate: dbStats.doctors.total > 0 ? 
                (dbStats.doctors.verified / dbStats.doctors.total * 100).toFixed(2) + '%' : '0%',
            accessApprovalRate: dbStats.accessRequests.total > 0 ? 
                (dbStats.accessRequests.approved / dbStats.accessRequests.total * 100).toFixed(2) + '%' : '0%'
        };

        return res.status(200).json(
            new ApiResponse(200, {
                databaseStats: dbStats,
                blockchainStats,
                healthIndicators,
                timestamp: new Date().toISOString()
            }, "System statistics fetched successfully")
        );
    } catch (error) {
        console.error('Failed to fetch system statistics:', error);
        throw new ApiError(500, `Failed to fetch system statistics: ${error.message}`);
    }
});

// Get recent system activity
export const getRecentActivity = asyncHandler(async (req, res) => {
    const { limit = 20 } = req.query;

    try {
        // Recent patient registrations
        const recentPatients = await Patient.find()
            .select('name email createdAt contractDeploymentStatus')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit) / 4);

        // Recent doctor registrations
        const recentDoctors = await Doctor.find()
            .select('name email specialization createdAt isVerified')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit) / 4);

        // Recent medical records
        const recentRecords = await MedicalRecord.find()
            .populate('patientId', 'name')
            .select('name recordType uploadedAt patientId recordId_onchain')
            .sort({ uploadedAt: -1 })
            .limit(parseInt(limit) / 4);

        // Recent access requests
        const recentAccessRequests = await AccessRequest.find()
            .populate('doctorId', 'name specialization')
            .populate('patientId', 'name')
            .select('status createdAt respondedAt doctorId patientId')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit) / 4);

        return res.status(200).json(
            new ApiResponse(200, {
                recentPatients,
                recentDoctors,
                recentRecords,
                recentAccessRequests
            }, "Recent system activity fetched successfully")
        );
    } catch (error) {
        console.error('Failed to fetch recent activity:', error);
        throw new ApiError(500, `Failed to fetch recent activity: ${error.message}`);
    }
});

// Get blockchain vs database consistency report
export const getConsistencyReport = asyncHandler(async (req, res) => {
    try {
        // Get all patients with deployed contracts
        const deployedPatients = await Patient.find({
            contractDeploymentStatus: 'deployed',
            contractAddress: { $ne: null }
        }).select('_id name contractAddress');

        // Check consistency for each patient
        const consistencyChecks = await Promise.all(
            deployedPatients.slice(0, 10).map(async (patient) => { // Limit to 10 for performance
                try {
                    // Check if contract exists on blockchain
                    const blockchainDetails = await contractService.getPatientDetails(patient.contractAddress);
                    
                    return {
                        patientId: patient._id,
                        patientName: patient.name,
                        contractAddress: patient.contractAddress,
                        status: 'consistent',
                        blockchainName: blockchainDetails.name,
                        nameMatches: patient.name === blockchainDetails.name
                    };
                } catch (error) {
                    return {
                        patientId: patient._id,
                        patientName: patient.name,
                        contractAddress: patient.contractAddress,
                        status: 'inconsistent',
                        error: error.message
                    };
                }
            })
        );

        const consistentCount = consistencyChecks.filter(check => check.status === 'consistent').length;
        const inconsistentCount = consistencyChecks.filter(check => check.status === 'inconsistent').length;

        return res.status(200).json(
            new ApiResponse(200, {
                totalChecked: consistencyChecks.length,
                consistent: consistentCount,
                inconsistent: inconsistentCount,
                consistencyRate: consistencyChecks.length > 0 ? 
                    (consistentCount / consistencyChecks.length * 100).toFixed(2) + '%' : '0%',
                details: consistencyChecks
            }, "Consistency report generated successfully")
        );
    } catch (error) {
        console.error('Failed to generate consistency report:', error);
        throw new ApiError(500, `Failed to generate consistency report: ${error.message}`);
    }
}); 