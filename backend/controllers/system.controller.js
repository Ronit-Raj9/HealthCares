import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { ApiResponse } from '../utils/apiResponse.js';
import contractService from '../services/contractService.js';
import integrityService from '../services/integrityService.js';
import Patient from '../models/patient.model.js';
import Doctor from '../models/doctor.model.js';
import MedicalRecord from '../models/medicalRecord.model.js';
import AccessRequest from '../models/accessRequest.model.js';
import { verifyFileIntegrity, generateFileHash } from '../utils/encryption.js';

/**
 * System Status and Integration Testing Controller
 */

// Get overall system health and status
export const getSystemStatus = asyncHandler(async (req, res) => {
    try {
        // Check database connectivity
        const dbStatus = {
            connected: true,
            patientCount: await Patient.countDocuments(),
            doctorCount: await Doctor.countDocuments(),
            recordCount: await MedicalRecord.countDocuments(),
            accessRequestCount: await AccessRequest.countDocuments()
        };

        // Check contract service status
        let contractStatus = {
            initialized: false,
            factoryAvailable: false,
            error: null
        };

        try {
            await contractService.ensureInitialized();
            contractStatus.initialized = true;
            contractStatus.factoryAvailable = !!contractService.factoryContract;
        } catch (error) {
            contractStatus.error = error.message;
        }

        // Check IPFS connectivity (basic test)
        let ipfsStatus = {
            connected: false,
            error: null
        };

        try {
            // Simple IPFS test - this would need to be implemented based on your IPFS setup
            ipfsStatus.connected = true; // Placeholder - implement actual IPFS check
        } catch (error) {
            ipfsStatus.error = error.message;
        }

        return res.status(200).json(
            new ApiResponse(200, {
                database: dbStatus,
                blockchain: contractStatus,
                ipfs: ipfsStatus,
                timestamp: new Date().toISOString()
            }, "System status retrieved successfully")
        );
    } catch (error) {
        throw new ApiError(500, `System status check failed: ${error.message}`);
    }
});

// Test complete workflow for a patient
export const testPatientWorkflow = asyncHandler(async (req, res) => {
    const patientId = req.user._id;
    
    try {
        // Get patient info
        const patient = await Patient.findById(patientId);
        if (!patient) {
            throw new ApiError(404, "Patient not found");
        }

        // Get patient's records
        const records = await MedicalRecord.find({ patientId }).limit(5);
        
        // Get integrity status for each record
        const recordIntegrityStatus = await Promise.all(
            records.map(async (record) => {
                try {
                    const status = await integrityService.getRecordIntegrityStatus(record._id);
                    return {
                        recordId: record._id,
                        recordName: record.name,
                        status: 'OK',
                        integrityStatus: status
                    };
                } catch (error) {
                    return {
                        recordId: record._id,
                        recordName: record.name,
                        status: 'ERROR',
                        error: error.message
                    };
                }
            })
        );

        // Get access requests
        const accessRequests = await AccessRequest.find({ patientId }).limit(3);

        // Check contract deployment status
        let contractInfo = {
            deployed: false,
            address: null,
            error: null
        };

        if (patient.contractAddress) {
            try {
                // Test contract connectivity
                const contract = await contractService.connectToPatientContract(patient.contractAddress);
                contractInfo = {
                    deployed: true,
                    address: patient.contractAddress,
                    error: null
                };
            } catch (error) {
                contractInfo.error = error.message;
            }
        }

        return res.status(200).json(
            new ApiResponse(200, {
                patient: {
                    id: patient._id,
                    name: patient.name,
                    contractDeploymentStatus: patient.contractDeploymentStatus
                },
                records: {
                    total: records.length,
                    integrityStatus: recordIntegrityStatus
                },
                accessRequests: {
                    total: accessRequests.length,
                    breakdown: accessRequests.reduce((acc, req) => {
                        acc[req.status] = (acc[req.status] || 0) + 1;
                        return acc;
                    }, {})
                },
                contract: contractInfo,
                testTimestamp: new Date().toISOString()
            }, "Patient workflow test completed")
        );
    } catch (error) {
        throw new ApiError(500, `Patient workflow test failed: ${error.message}`);
    }
});

// Test complete workflow for a doctor
export const testDoctorWorkflow = asyncHandler(async (req, res) => {
    const doctorId = req.user._id;
    
    try {
        // Get doctor info
        const doctor = await Doctor.findById(doctorId);
        if (!doctor) {
            throw new ApiError(404, "Doctor not found");
        }

        // Get doctor's access requests
        const accessRequests = await AccessRequest.find({ doctorId }).limit(5);
        
        // Get authorized records
        const authorizedRecords = await AccessRequest.find({
            doctorId,
            status: 'approved',
            accessExpiresAt: { $gt: new Date() }
        }).populate('selectedRecords').limit(5);

        // Test blockchain authorized records if doctor has wallet
        let blockchainRecordsTest = {
            available: false,
            recordCount: 0,
            error: null
        };

        if (doctor.walletAddress) {
            try {
                // Find approved requests with contract addresses
                const contractRequests = await AccessRequest.find({
                    doctorId,
                    status: 'approved',
                    patientContractAddress: { $exists: true, $ne: null },
                    accessExpiresAt: { $gt: new Date() }
                }).limit(3);

                let totalBlockchainRecords = 0;
                for (const request of contractRequests) {
                    try {
                        const blockchainRecords = await contractService.getApprovedRecords(
                            request.patientContractAddress,
                            doctor.walletAddress
                        );
                        totalBlockchainRecords += 
                            blockchainRecords.prescriptions.length + 
                            blockchainRecords.reports.length + 
                            blockchainRecords.bills.length;
                    } catch (error) {
                        console.warn('Contract access test failed:', error.message);
                    }
                }

                blockchainRecordsTest = {
                    available: true,
                    recordCount: totalBlockchainRecords,
                    contractsChecked: contractRequests.length,
                    error: null
                };
            } catch (error) {
                blockchainRecordsTest.error = error.message;
            }
        }

        return res.status(200).json(
            new ApiResponse(200, {
                doctor: {
                    id: doctor._id,
                    name: doctor.name,
                    hasWallet: !!doctor.walletAddress,
                    hasKeyPair: doctor.isKeyPairGenerated
                },
                accessRequests: {
                    total: accessRequests.length,
                    breakdown: accessRequests.reduce((acc, req) => {
                        acc[req.status] = (acc[req.status] || 0) + 1;
                        return acc;
                    }, {})
                },
                authorizedRecords: {
                    total: authorizedRecords.reduce((sum, req) => sum + (req.selectedRecords?.length || 0), 0),
                    activeRequests: authorizedRecords.length
                },
                blockchainAccess: blockchainRecordsTest,
                testTimestamp: new Date().toISOString()
            }, "Doctor workflow test completed")
        );
    } catch (error) {
        throw new ApiError(500, `Doctor workflow test failed: ${error.message}`);
    }
});

// Test blockchain integration for a specific patient contract
export const testBlockchainIntegration = asyncHandler(async (req, res) => {
    const { contractAddress } = req.params;
    
    if (!contractAddress) {
        throw new ApiError(400, "Contract address is required");
    }

    try {
        // Test contract connectivity
        const contract = await contractService.connectToPatientContract(contractAddress);
        
        // Get patient info
        const patient = await Patient.findOne({ contractAddress });
        if (!patient) {
            throw new ApiError(404, "Patient not found for this contract address");
        }

        // Check if user has permission
        const userId = req.user._id.toString();
        const isPatient = patient._id.toString() === userId;
        
        if (!isPatient) {
            throw new ApiError(403, "Not authorized to test this contract");
        }

        // Get records associated with this contract
        const contractRecords = await MedicalRecord.find({
            patientContractAddress: contractAddress,
            recordId_onchain: { $ne: null }
        }).limit(10);

        // Test hash retrieval for each record type
        const hashTests = [];
        const recordTypes = ['bill', 'prescription', 'report'];
        
        for (const record of contractRecords) {
            try {
                const blockchainHash = await contractService.getRecordHash(
                    contractAddress,
                    record.name,
                    record.recordType
                );
                
                hashTests.push({
                    recordId: record._id,
                    recordName: record.name,
                    recordType: record.recordType,
                    databaseHash: record.dataHash,
                    blockchainHash,
                    hashesMatch: record.dataHash === blockchainHash,
                    status: 'SUCCESS'
                });
            } catch (error) {
                hashTests.push({
                    recordId: record._id,
                    recordName: record.name,
                    recordType: record.recordType,
                    status: 'ERROR',
                    error: error.message
                });
            }
        }

        // Summary statistics
        const summary = {
            totalRecords: contractRecords.length,
            successfulHashRetrievals: hashTests.filter(t => t.status === 'SUCCESS').length,
            matchingHashes: hashTests.filter(t => t.hashesMatch === true).length,
            errors: hashTests.filter(t => t.status === 'ERROR').length
        };

        return res.status(200).json(
            new ApiResponse(200, {
                contractAddress,
                patient: {
                    id: patient._id,
                    name: patient.name
                },
                summary,
                details: hashTests,
                testTimestamp: new Date().toISOString()
            }, "Blockchain integration test completed")
        );
    } catch (error) {
        throw new ApiError(500, `Blockchain integration test failed: ${error.message}`);
    }
});

// Get integrity report for all records of a patient
export const getIntegrityReport = asyncHandler(async (req, res) => {
    const patientId = req.user._id;
    
    try {
        const integrityStatuses = await integrityService.getPatientRecordsIntegrityStatus(patientId);
        
        // Generate summary
        const summary = {
            totalRecords: integrityStatuses.length,
            withDatabaseHash: integrityStatuses.filter(s => s.hasIntegrityHash).length,
            withBlockchainHash: integrityStatuses.filter(s => s.blockchainHashStatus?.available).length,
            hashMatches: integrityStatuses.filter(s => 
                s.blockchainHashStatus?.available && 
                s.databaseHash === s.blockchainHashStatus.hash
            ).length,
            errors: integrityStatuses.filter(s => s.error).length
        };

        return res.status(200).json(
            new ApiResponse(200, {
                summary,
                records: integrityStatuses,
                reportGeneratedAt: new Date().toISOString()
            }, "Integrity report generated successfully")
        );
    } catch (error) {
        throw new ApiError(500, `Integrity report generation failed: ${error.message}`);
    }
}); 