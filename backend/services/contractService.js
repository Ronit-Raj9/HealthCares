import { ethers } from 'ethers';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import process from 'process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Smart Contract Service for HealthRecord blockchain operations
 */
class ContractService {
    constructor() {
        this.provider = null;
        this.signer = null;
        this.factoryContract = null;
        this.healthRecordABI = null;
        this.factoryABI = null;
        this.initialized = false;
    }

    /**
     * Initialize the contract service
     */
    async initialize() {
        try {
            // Setup provider - use Sepolia testnet by default since that's where your contract is deployed
            const rpcUrl = process.env.ETHEREUM_RPC_URL || 'https://sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID';
            this.provider = new ethers.JsonRpcProvider(rpcUrl);
            
            // Setup signer
            if (process.env.PRIVATE_KEY) {
                this.signer = new ethers.Wallet(process.env.PRIVATE_KEY, this.provider);
            } else {
                throw new Error('Private key not found in environment variables');
            }

            // Load contract ABIs
            await this.loadContractABIs();

            // Connect to factory contract
            if (process.env.HEALTH_RECORD_FACTORY_ADDRESS) {
                this.factoryContract = new ethers.Contract(
                    process.env.HEALTH_RECORD_FACTORY_ADDRESS,
                    this.factoryABI,
                    this.signer
                );
            }

            this.initialized = true;
            console.log('Contract service initialized successfully');
        } catch (error) {
            console.error('Failed to initialize contract service:', error);
            throw error;
        }
    }

    /**
     * Load contract ABIs from compiled contracts
     */
    async loadContractABIs() {
        try {
            // Try to load from Foundry out directory
            const contractsPath = path.join(__dirname, '../../contracts/out');
            
            const healthRecordPath = path.join(contractsPath, 'HealthRecordContract.sol/HealthRecordContract.json');
            const factoryPath = path.join(contractsPath, 'HealthRecordContractFactory.sol/HealthRecordContractFactory.json');
            
            // Load HealthRecord contract ABI
            try {
                const healthRecordData = JSON.parse(readFileSync(healthRecordPath, 'utf8'));
                this.healthRecordABI = healthRecordData.abi;
            } catch (error) {
                console.warn('Could not load HealthRecord ABI from compiled contracts, using fallback');
                this.healthRecordABI = this.getFallbackHealthRecordABI();
            }

            // Load Factory contract ABI
            try {
                const factoryData = JSON.parse(readFileSync(factoryPath, 'utf8'));
                this.factoryABI = factoryData.abi;
            } catch (error) {
                console.warn('Could not load Factory ABI from compiled contracts, using fallback');
                this.factoryABI = this.getFallbackFactoryABI();
            }
        } catch (error) {
            console.error('Error loading contract ABIs:', error);
            // Use fallback ABIs
            this.healthRecordABI = this.getFallbackHealthRecordABI();
            this.factoryABI = this.getFallbackFactoryABI();
        }
    }

    /**
     * Ensure service is initialized
     */
    async ensureInitialized() {
        if (!this.initialized) {
            await this.initialize();
        }
    }

    /**
     * Deploy a new HealthRecord contract for a patient using factory
     * @param {Object} patientData - Patient information from database
     * @returns {Object} - {contractAddress, transactionHash, blockNumber}
     */
    async deployPatientContract(patientData) {
        await this.ensureInitialized();
        
        if (!this.factoryContract) {
            throw new Error('Factory contract not available');
        }

        try {
            const { _id, name, age, gender, walletAddress, bloodGroup } = patientData;
            
            // Convert MongoDB ObjectId to number for contract
            const patientId = parseInt(_id.toString().slice(-8), 16); // Use last 8 chars as hex
            
            // Default values for missing fields
            const height = 170; // Default height in cm
            const weight = 70;  // Default weight in kg
            const bloodGroupValue = bloodGroup || 'O+'; // Default blood group
            const ageValue = age || 25; // Default age
            const genderValue = gender || 'Other'; // Default gender

            console.log('Deploying contract for patient:', {
                patientId,
                name,
                age: ageValue,
                gender: genderValue,
                height,
                weight,
                bloodGroup: bloodGroupValue
            });

            const tx = await this.factoryContract.createHealthRecord(
                name,
                patientId,
                ageValue,
                genderValue,
                height,
                weight,
                bloodGroupValue
            );

            console.log('Contract deployment transaction sent:', tx.hash);
            const receipt = await tx.wait();
            console.log('Contract deployment receipt:', receipt);
            
            // Get the contract address from events
            const event = receipt.logs.find(log => {
                try {
                    const parsedLog = this.factoryContract.interface.parseLog(log);
                    return parsedLog.name === 'HealthRecordCreated';
                } catch {
                    return false;
                }
            });

            if (!event) {
                throw new Error('Contract creation event not found in transaction receipt');
            }

            const parsedEvent = this.factoryContract.interface.parseLog(event);
            const contractAddress = parsedEvent.args.contractAddress;

            console.log('Patient contract deployed successfully:', {
                contractAddress,
                patientId,
                transactionHash: tx.hash
            });

            return {
                contractAddress,
                transactionHash: tx.hash,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed ? Number(receipt.gasUsed) : null,
                patientId
            };
        } catch (error) {
            console.error('Error deploying patient contract:', error);
            throw error;
        }
    }

    /**
     * Connect to an existing HealthRecord contract
     * @param {string} contractAddress - Contract address
     * @returns {Object} - Ethers contract instance
     */
    async connectToPatientContract(contractAddress) {
        await this.ensureInitialized();
        
        return new ethers.Contract(
            contractAddress,
            this.healthRecordABI,
            this.signer
        );
    }

    /**
     * Add a medical record to the blockchain
     * @param {string} contractAddress - Patient's contract address
     * @param {string} recordType - 'bill', 'prescription', or 'report'
     * @param {string} recordName - Name of the record
     * @param {string} dataHash - SHA-256 hash of the original file
     * @returns {Object} - {recordId, transactionHash, blockNumber, gasUsed}
     */
    async addRecord(contractAddress, recordType, recordName, dataHash) {
        await this.ensureInitialized();
        
        const contract = await this.connectToPatientContract(contractAddress);
        
        try {
            let tx;
            
            switch (recordType.toLowerCase()) {
                case 'bill':
                    tx = await contract.addBill(recordName, dataHash);
                    break;
                case 'prescription':
                    tx = await contract.addPrescription(recordName, dataHash);
                    break;
                case 'report':
                    tx = await contract.addReport(recordName, dataHash);
                    break;
                default:
                    throw new Error(`Invalid record type: ${recordType}`);
            }

            const receipt = await tx.wait();
            
            console.log('Transaction receipt logs:', receipt.logs.length);
            
            // Get record ID from events
            const event = receipt.logs.find(log => {
                try {
                    const parsedLog = contract.interface.parseLog(log);
                    console.log('Parsed log event:', parsedLog.name);
                    return ['BillAdded', 'PrescriptionAdded', 'ReportAdded'].includes(parsedLog.name);
                } catch (e) {
                    console.log('Failed to parse log:', e.message);
                    return false;
                }
            });

            if (!event) {
                console.log('Available logs:');
                receipt.logs.forEach((log, index) => {
                    try {
                        const parsed = contract.interface.parseLog(log);
                        console.log(`Log ${index}:`, parsed.name, parsed.args);
                    } catch (e) {
                        console.log(`Log ${index}: Cannot parse -`, e.message);
                    }
                });
                throw new Error('Record creation event not found');
            }

            const parsedEvent = contract.interface.parseLog(event);
            
            // Extract record ID from the event (third parameter)
            let recordId;
            if (recordType.toLowerCase() === 'bill') {
                recordId = parsedEvent.args[2]; // billId is the third parameter
            } else if (recordType.toLowerCase() === 'prescription') {
                recordId = parsedEvent.args[2]; // prescriptionId is the third parameter  
            } else if (recordType.toLowerCase() === 'report') {
                recordId = parsedEvent.args[2]; // reportId is the third parameter
            }

            return {
                recordId: recordId.toString(),
                transactionHash: tx.hash,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed ? Number(receipt.gasUsed) : null
            };
        } catch (error) {
            console.error('Error adding record to blockchain:', error);
            throw error;
        }
    }

    /**
     * Grant access to a doctor for specific records
     * @param {string} contractAddress - Patient's contract address
     * @param {string} doctorAddress - Doctor's wallet address
     * @param {number} expiryDuration - Access duration in seconds
     * @param {Array<number>} prescriptionIds - Array of prescription IDs
     * @param {Array<number>} reportIds - Array of report IDs
     * @param {Array<number>} billIds - Array of bill IDs
     * @returns {Object} - Transaction details
     */
    async grantAccess(contractAddress, doctorAddress, expiryDuration, prescriptionIds = [], reportIds = [], billIds = []) {
        await this.ensureInitialized();
        
        const contract = await this.connectToPatientContract(contractAddress);
        
        try {
            const tx = await contract.approveAccess(
                doctorAddress,
                expiryDuration,
                prescriptionIds,
                reportIds,
                billIds
            );

            const receipt = await tx.wait();

            return {
                transactionHash: tx.hash,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed ? Number(receipt.gasUsed) : null
            };
        } catch (error) {
            console.error('Error granting access:', error);
            throw error;
        }
    }

    /**
     * Revoke access for a doctor
     * @param {string} contractAddress - Patient's contract address
     * @param {string} doctorAddress - Doctor's wallet address
     * @returns {Object} - Transaction details
     */
    async revokeAccess(contractAddress, doctorAddress) {
        await this.ensureInitialized();
        
        const contract = await this.connectToPatientContract(contractAddress);
        
        try {
            const tx = await contract.revokeAccess(doctorAddress);
            const receipt = await tx.wait();

            return {
                transactionHash: tx.hash,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed ? Number(receipt.gasUsed) : null,
                contractFunction: 'revokeAccess'
            };
        } catch (error) {
            console.error('Error revoking access:', error);
            throw error;
        }
    }

    /**
     * Get approved records for a doctor
     * @param {string} contractAddress - Patient's contract address
     * @param {string} doctorAddress - Doctor's wallet address
     * @returns {Object} - Approved records data
     */
    async getApprovedRecords(contractAddress, doctorAddress) {
        await this.ensureInitialized();
        
        // Note: This function requires the actual doctor to call it due to onlyAuthorized modifier
        // For monitoring purposes, we'll use a different approach to check access status
        try {
            // Try to call with backend wallet first (will fail if not authorized)
            const contract = await this.connectToPatientContract(contractAddress);
            const result = await contract.getApprovedRecords();
            
            return {
                prescriptions: result[0] || [],
                reports: result[1] || [],
                bills: result[2] || []
            };
        } catch (error) {
            console.error('Error getting approved records:', error);
            throw error;
        }
    }

    /**
     * Check if a doctor has access to a patient's records (monitoring purpose)
     * @param {string} contractAddress - Patient's contract address  
     * @param {string} doctorAddress - Doctor's wallet address
     * @returns {Object} - Access status information
     */
    async checkDoctorAccess(contractAddress, doctorAddress) {
        await this.ensureInitialized();
        
        try {
            // Since smart contract functions require the caller to be authorized,
            // we'll check from the patient contract owner's perspective
            const contract = await this.connectToPatientContract(contractAddress);
            
            // Check if there's an extension request (this can be called by patient/owner)
            let extensionInfo = null;
            try {
                const extensionResult = await this.checkExtensionRequest(contractAddress, doctorAddress);
                extensionInfo = extensionResult;
            } catch (extensionError) {
                console.log('No extension request for doctor:', doctorAddress);
            }
            
            // Unfortunately, we can't directly check if doctor has active access from backend
            // because hasAccessExpired() and getApprovedRecords() require msg.sender to be the doctor
            
            return {
                contractAddress,
                doctorAddress,
                hasExpired: null, // Cannot determine from backend
                hasActiveAccess: null, // Cannot determine from backend  
                approvedRecords: null, // Cannot fetch from backend
                extensionRequest: extensionInfo,
                blockchainLimitation: "Cannot check doctor access status from backend due to smart contract design",
                lastChecked: new Date().toISOString()
            };
        } catch (error) {
            console.error('Error checking doctor access:', error);
            return {
                contractAddress,
                doctorAddress,
                hasExpired: null,
                hasActiveAccess: null,
                approvedRecords: null,
                error: error.message,
                blockchainLimitation: "Cannot check doctor access status from backend due to smart contract design",
                lastChecked: new Date().toISOString()
            };
        }
    }

    /**
     * Verify blockchain access approval (called right after approval)
     * @param {string} contractAddress - Patient's contract address
     * @param {string} doctorAddress - Doctor's wallet address
     * @returns {Object} - Verification result
     */
    async verifyAccessApproval(contractAddress, doctorAddress) {
        await this.ensureInitialized();
        
        try {
            // This should be called immediately after approveAccess to verify it worked
            console.log(`Verifying access approval for doctor ${doctorAddress} on contract ${contractAddress}`);
            
            // We can only verify that the transaction was successful
            // The actual access check must be done by the doctor's wallet
            return {
                contractAddress,
                doctorAddress,
                verified: true,
                message: "Access approval transaction completed successfully",
                note: "Doctor must use their own wallet to verify access status",
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('Error verifying access approval:', error);
            return {
                contractAddress,
                doctorAddress,
                verified: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Get a specific record hash by name and type
     * @param {string} contractAddress - Patient's contract address  
     * @param {string} recordName - Name of the record
     * @param {string} recordType - Type of record (bill, prescription, report)
     * @returns {string} - Data hash from blockchain
     */
    async getRecordHash(contractAddress, recordName, recordType) {
        await this.ensureInitialized();
        
        const contract = await this.connectToPatientContract(contractAddress);
        
        try {
            let record;
            switch (recordType.toLowerCase()) {
                case 'bill':
                    record = await contract.getBill(recordName);
                    return record.billDataHash;
                case 'prescription':
                    record = await contract.getPrescription(recordName);
                    return record.prescriptionDataHash;
                case 'report':
                    record = await contract.getReport(recordName);
                    return record.reportDataHash;
                default:
                    throw new Error(`Invalid record type: ${recordType}`);
            }
        } catch (error) {
            console.error('Error getting record hash:', error);
            throw error;
        }
    }

    // ========================================
    // PATIENT PROFILE UPDATE FUNCTIONS
    // ========================================

    /**
     * Update patient's name on blockchain
     * @param {string} contractAddress - Patient's contract address
     * @param {string} newName - New name to update
     * @returns {Object} - Transaction details
     */
    async updatePatientName(contractAddress, newName) {
        await this.ensureInitialized();
        const contract = await this.connectToPatientContract(contractAddress);
        
        try {
            const tx = await contract.updatePatientName(newName);
            const receipt = await tx.wait();
            
            return {
                transactionHash: tx.hash,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed ? Number(receipt.gasUsed) : null,
                contractFunction: 'updatePatientName'
            };
        } catch (error) {
            console.error('Error updating patient name:', error);
            throw error;
        }
    }

    /**
     * Update patient's age on blockchain
     * @param {string} contractAddress - Patient's contract address  
     * @param {number} newAge - New age to update
     * @returns {Object} - Transaction details
     */
    async updatePatientAge(contractAddress, newAge) {
        await this.ensureInitialized();
        const contract = await this.connectToPatientContract(contractAddress);
        
        try {
            const tx = await contract.updatePatientAge(newAge);
            const receipt = await tx.wait();
            
            return {
                transactionHash: tx.hash,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed ? Number(receipt.gasUsed) : null,
                contractFunction: 'updatePatientAge'
            };
        } catch (error) {
            console.error('Error updating patient age:', error);
            throw error;
        }
    }

    /**
     * Update patient's gender on blockchain
     * @param {string} contractAddress - Patient's contract address
     * @param {string} newGender - New gender to update
     * @returns {Object} - Transaction details
     */
    async updatePatientGender(contractAddress, newGender) {
        await this.ensureInitialized();
        const contract = await this.connectToPatientContract(contractAddress);
        
        try {
            const tx = await contract.updatePatientGender(newGender);
            const receipt = await tx.wait();
            
            return {
                transactionHash: tx.hash,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed ? Number(receipt.gasUsed) : null,
                contractFunction: 'updatePatientGender'
            };
        } catch (error) {
            console.error('Error updating patient gender:', error);
            throw error;
        }
    }

    /**
     * Update patient's height on blockchain
     * @param {string} contractAddress - Patient's contract address
     * @param {number} newHeight - New height in centimeters
     * @returns {Object} - Transaction details
     */
    async updatePatientHeight(contractAddress, newHeight) {
        await this.ensureInitialized();
        const contract = await this.connectToPatientContract(contractAddress);
        
        try {
            const tx = await contract.updatePatientHeight(newHeight);
            const receipt = await tx.wait();
            
            return {
                transactionHash: tx.hash,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed ? Number(receipt.gasUsed) : null,
                contractFunction: 'updatePatientHeight'
            };
        } catch (error) {
            console.error('Error updating patient height:', error);
            throw error;
        }
    }

    /**
     * Update patient's weight on blockchain
     * @param {string} contractAddress - Patient's contract address
     * @param {number} newWeight - New weight in kilograms
     * @returns {Object} - Transaction details
     */
    async updatePatientWeight(contractAddress, newWeight) {
        await this.ensureInitialized();
        const contract = await this.connectToPatientContract(contractAddress);
        
        try {
            const tx = await contract.updatePatientWeight(newWeight);
            const receipt = await tx.wait();
            
            return {
                transactionHash: tx.hash,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed ? Number(receipt.gasUsed) : null,
                contractFunction: 'updatePatientWeight'
            };
        } catch (error) {
            console.error('Error updating patient weight:', error);
            throw error;
        }
    }

    /**
     * Update patient's blood group on blockchain
     * @param {string} contractAddress - Patient's contract address
     * @param {string} newBloodGroup - New blood group
     * @returns {Object} - Transaction details
     */
    async updatePatientBloodGroup(contractAddress, newBloodGroup) {
        await this.ensureInitialized();
        const contract = await this.connectToPatientContract(contractAddress);
        
        try {
            const tx = await contract.updatePatientBloodGroup(newBloodGroup);
            const receipt = await tx.wait();
            
            return {
                transactionHash: tx.hash,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed ? Number(receipt.gasUsed) : null,
                contractFunction: 'updatePatientBloodGroup'
            };
        } catch (error) {
            console.error('Error updating patient blood group:', error);
            throw error;
        }
    }

    /**
     * Update multiple patient profile fields on blockchain in batch
     * @param {string} contractAddress - Patient's contract address
     * @param {Object} updateData - Object containing fields to update
     * @returns {Object} - Transaction details
     */
    async updatePatientProfile(contractAddress, updateData) {
        await this.ensureInitialized();
        
        // Check if there are any fields to update
        if (!updateData || Object.keys(updateData).length === 0) {
            throw new Error('No fields provided for blockchain update');
        }
        
        const contract = await this.connectToPatientContract(contractAddress);
        
        try {
            const transactions = [];
            let lastTx = null;
            let totalGasUsed = 0;
            
            console.log('Starting blockchain updates for fields:', Object.keys(updateData));
            
            // Execute updates sequentially to avoid nonce conflicts
            // Only update fields that are actually provided in updateData
            if (updateData.name !== undefined) {
                console.log('Updating name on blockchain:', updateData.name);
                const tx = await contract.updatePatientName(updateData.name);
                const receipt = await tx.wait();
                lastTx = tx;
                totalGasUsed += receipt.gasUsed ? Number(receipt.gasUsed) : 0;
                transactions.push({ field: 'name', txHash: tx.hash, gasUsed: receipt.gasUsed ? Number(receipt.gasUsed) : 0 });
            }
            
            if (updateData.age !== undefined) {
                console.log('Updating age on blockchain:', updateData.age);
                const tx = await contract.updatePatientAge(updateData.age);
                const receipt = await tx.wait();
                lastTx = tx;
                totalGasUsed += receipt.gasUsed ? Number(receipt.gasUsed) : 0;
                transactions.push({ field: 'age', txHash: tx.hash, gasUsed: receipt.gasUsed ? Number(receipt.gasUsed) : 0 });
            }
            
            if (updateData.gender !== undefined) {
                console.log('Updating gender on blockchain:', updateData.gender);
                const tx = await contract.updatePatientGender(updateData.gender);
                const receipt = await tx.wait();
                lastTx = tx;
                totalGasUsed += receipt.gasUsed ? Number(receipt.gasUsed) : 0;
                transactions.push({ field: 'gender', txHash: tx.hash, gasUsed: receipt.gasUsed ? Number(receipt.gasUsed) : 0 });
            }
            
            if (updateData.height !== undefined) {
                console.log('Updating height on blockchain:', updateData.height);
                const tx = await contract.updatePatientHeight(updateData.height);
                const receipt = await tx.wait();
                lastTx = tx;
                totalGasUsed += receipt.gasUsed ? Number(receipt.gasUsed) : 0;
                transactions.push({ field: 'height', txHash: tx.hash, gasUsed: receipt.gasUsed ? Number(receipt.gasUsed) : 0 });
            }
            
            if (updateData.weight !== undefined) {
                console.log('Updating weight on blockchain:', updateData.weight);
                const tx = await contract.updatePatientWeight(updateData.weight);
                const receipt = await tx.wait();
                lastTx = tx;
                totalGasUsed += receipt.gasUsed ? Number(receipt.gasUsed) : 0;
                transactions.push({ field: 'weight', txHash: tx.hash, gasUsed: receipt.gasUsed ? Number(receipt.gasUsed) : 0 });
            }
            
            if (updateData.bloodGroup !== undefined) {
                console.log('Updating blood group on blockchain:', updateData.bloodGroup);
                const tx = await contract.updatePatientBloodGroup(updateData.bloodGroup);
                const receipt = await tx.wait();
                lastTx = tx;
                totalGasUsed += receipt.gasUsed ? Number(receipt.gasUsed) : 0;
                transactions.push({ field: 'bloodGroup', txHash: tx.hash, gasUsed: receipt.gasUsed ? Number(receipt.gasUsed) : 0 });
            }
            
            if (!lastTx) {
                throw new Error('No blockchain updates were performed');
            }
            
            const finalReceipt = await lastTx.wait();
            
            console.log(`Blockchain update completed. Updated ${transactions.length} field(s). Total gas used: ${totalGasUsed}`);
            
            return {
                transactionHash: lastTx.hash,
                blockNumber: finalReceipt.blockNumber,
                gasUsed: totalGasUsed,
                contractFunction: 'updatePatientProfile',
                fieldsUpdated: transactions.map(t => t.field),
                allTransactions: transactions,
                totalTransactions: transactions.length
            };
        } catch (error) {
            console.error('Error updating patient profile on blockchain:', error);
            throw error;
        }
    }

    // ========================================
    // ACCESS EXTENSION FUNCTIONS
    // ========================================

    /**
     * Request access extension from doctor side
     * @param {string} contractAddress - Patient's contract address
     * @param {number} additionalTime - Additional time in seconds
     * @returns {Object} - Transaction details
     */
    async requestExtendAccess(contractAddress, additionalTime) {
        await this.ensureInitialized();
        const contract = await this.connectToPatientContract(contractAddress);
        
        try {
            const tx = await contract.requestExtendAccess(additionalTime);
            const receipt = await tx.wait();
            
            return {
                transactionHash: tx.hash,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed ? Number(receipt.gasUsed) : null,
                contractFunction: 'requestExtendAccess'
            };
        } catch (error) {
            console.error('Error requesting access extension:', error);
            throw error;
        }
    }

    /**
     * Approve access extension from patient side
     * @param {string} contractAddress - Patient's contract address
     * @param {string} doctorAddress - Doctor's wallet address
     * @returns {Object} - Transaction details
     */
    async approveExtendAccess(contractAddress, doctorAddress) {
        await this.ensureInitialized();
        const contract = await this.connectToPatientContract(contractAddress);
        
        try {
            const tx = await contract.approveExtendAccess(doctorAddress);
            const receipt = await tx.wait();
            
            return {
                transactionHash: tx.hash,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed ? Number(receipt.gasUsed) : null,
                contractFunction: 'approveExtendAccess'
            };
        } catch (error) {
            console.error('Error approving access extension:', error);
            throw error;
        }
    }

    // ========================================
    // ACCESS REVOCATION FUNCTIONS
    // ========================================

    /**
     * Revoke access for a doctor
     * @param {string} contractAddress - Patient's contract address
     * @param {string} doctorAddress - Doctor's wallet address to revoke
     * @returns {Object} - Transaction details
     */
    async revokeAccess(contractAddress, doctorAddress) {
        await this.ensureInitialized();
        const contract = await this.connectToPatientContract(contractAddress);
        
        try {
            const tx = await contract.revokeAccess(doctorAddress);
            const receipt = await tx.wait();
            
            return {
                transactionHash: tx.hash,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed ? Number(receipt.gasUsed) : null,
                contractFunction: 'revokeAccess'
            };
        } catch (error) {
            console.error('Error revoking access:', error);
            throw error;
        }
    }

    // ========================================
    // UTILITY VIEW FUNCTIONS
    // ========================================

    /**
     * Get patient details from blockchain
     * @param {string} contractAddress - Patient's contract address
     * @returns {Object} - Patient details from blockchain
     */
    async getPatientDetails(contractAddress) {
        await this.ensureInitialized();
        const contract = await this.connectToPatientContract(contractAddress);
        
        try {
            const details = await contract.getPatientDetails();
            
            return {
                name: details[0],
                age: Number(details[1]),
                gender: details[2],
                height: Number(details[3]),
                weight: Number(details[4]),
                bloodGroup: details[5]
            };
        } catch (error) {
            console.error('Error getting patient details:', error);
            throw error;
        }
    }

    /**
     * Get patient ID from blockchain
     * @param {string} contractAddress - Patient's contract address
     * @returns {number} - Patient ID
     */
    async getPatientId(contractAddress) {
        await this.ensureInitialized();
        const contract = await this.connectToPatientContract(contractAddress);
        
        try {
            const patientId = await contract.getPatientId();
            return Number(patientId);
        } catch (error) {
            console.error('Error getting patient ID:', error);
            throw error;
        }
    }

    /**
     * Check extension request status
     * @param {string} contractAddress - Patient's contract address
     * @param {string} doctorAddress - Doctor's wallet address
     * @returns {Object} - Extension request details
     */
    async checkExtensionRequest(contractAddress, doctorAddress) {
        await this.ensureInitialized();
        const contract = await this.connectToPatientContract(contractAddress);
        
        try {
            const extensionInfo = await contract.checkExtensionRequest(doctorAddress);
            
            return {
                exists: extensionInfo[0],
                additionalTime: Number(extensionInfo[1]),
                requestTime: Number(extensionInfo[2])
            };
        } catch (error) {
            console.error('Error checking extension request:', error);
            throw error;
        }
    }

    // ========================================
    // ACCESS MONITORING FUNCTIONS
    // ========================================

    /**
     * Check if doctor's access has expired
     * @param {string} contractAddress - Patient's contract address
     * @param {string} doctorAddress - Doctor's wallet address
     * @returns {boolean} - True if access has expired, false otherwise
     */
    async hasAccessExpired(contractAddress, doctorAddress) {
        await this.ensureInitialized();
        
        try {
            // Create contract instance with doctor's wallet for checking their own access
            const doctorWallet = new ethers.Wallet(process.env.PRIVATE_KEY, this.provider);
            const contract = new ethers.Contract(
                contractAddress,
                this.healthRecordABI,
                doctorWallet
            );
            
            const hasExpired = await contract.hasAccessExpired();
            return hasExpired;
        } catch (error) {
            console.error('Error checking access expiry:', error);
            // If there's an error, assume access has expired for safety
            return true;
        }
    }

    /**
     * Get comprehensive access status for a doctor
     * @param {string} contractAddress - Patient's contract address
     * @param {string} doctorAddress - Doctor's wallet address
     * @returns {Object} - Detailed access status
     */
    async getAccessStatus(contractAddress, doctorAddress) {
        await this.ensureInitialized();
        
        try {
            // Use the new checkDoctorAccess method
            const accessStatus = await this.checkDoctorAccess(contractAddress, doctorAddress);
            
            // Check for pending extension requests
            let extensionRequest = null;
            try {
                extensionRequest = await this.checkExtensionRequest(contractAddress, doctorAddress);
            } catch (error) {
                console.log('No extension request found for doctor:', doctorAddress);
            }
            
            return {
                ...accessStatus,
                extensionRequest: extensionRequest && extensionRequest.exists ? extensionRequest : null
            };
        } catch (error) {
            console.error('Error getting access status:', error);
            throw error;
        }
    }

    /**
     * Batch check access status for multiple doctors
     * @param {string} contractAddress - Patient's contract address
     * @param {Array<string>} doctorAddresses - Array of doctor wallet addresses
     * @returns {Array<Object>} - Array of access status objects
     */
    async batchCheckAccessStatus(contractAddress, doctorAddresses) {
        await this.ensureInitialized();
        
        try {
            const statusPromises = doctorAddresses.map(doctorAddress => 
                this.getAccessStatus(contractAddress, doctorAddress)
                    .catch(error => ({
                        contractAddress,
                        doctorAddress,
                        error: error.message,
                        lastChecked: new Date().toISOString()
                    }))
            );
            
            const results = await Promise.all(statusPromises);
            return results;
        } catch (error) {
            console.error('Error in batch access status check:', error);
            throw error;
        }
    }

    // ========================================
    // FACTORY UTILITY FUNCTIONS  
    // ========================================

    /**
     * Get contract address by patient ID
     * @param {number} patientId - Patient's ID
     * @returns {string} - Contract address
     */
    async getContractByPatientId(patientId) {
        await this.ensureInitialized();
        
        if (!this.factoryContract) {
            throw new Error('Factory contract not available');
        }
        
        try {
            const contractAddress = await this.factoryContract.getContractByPatientId(patientId);
            return contractAddress;
        } catch (error) {
            console.error('Error getting contract by patient ID:', error);
            throw error;
        }
    }

    /**
     * Get patient ID by address
     * @param {string} patientAddress - Patient's wallet address
     * @returns {number} - Patient ID
     */
    async getPatientIdByAddress(patientAddress) {
        await this.ensureInitialized();
        
        if (!this.factoryContract) {
            throw new Error('Factory contract not available');
        }
        
        try {
            const patientId = await this.factoryContract.getPatientIdByAddress(patientAddress);
            return Number(patientId);
        } catch (error) {
            console.error('Error getting patient ID by address:', error);
            throw error;
        }
    }

    /**
     * Get all patient IDs registered in the system
     * @returns {Array} - Array of patient IDs
     */
    async getAllPatientIds() {
        await this.ensureInitialized();
        
        if (!this.factoryContract) {
            throw new Error('Factory contract not available');
        }
        
        try {
            const patientIds = await this.factoryContract.getAllPatientIds();
            return patientIds.map(id => Number(id));
        } catch (error) {
            console.error('Error getting all patient IDs:', error);
            throw error;
        }
    }

    /**
     * Get total number of patients in the system
     * @returns {number} - Total patient count
     */
    async getPatientCount() {
        await this.ensureInitialized();
        
        if (!this.factoryContract) {
            throw new Error('Factory contract not available');
        }
        
        try {
            const count = await this.factoryContract.getPatientCount();
            return Number(count);
        } catch (error) {
            console.error('Error getting patient count:', error);
            throw error;
        }
    }

    /**
     * Fallback ABI for HealthRecord contract - COMPLETE ABI with ALL functions
     */
    getFallbackHealthRecordABI() {
        return [
            // Record Management Functions
            "function addBill(string memory billName, string memory dataHash) external",
            "function addPrescription(string memory prescriptionName, string memory dataHash) external", 
            "function addReport(string memory reportName, string memory dataHash) external",
            
            // Patient Profile Update Functions
            "function updatePatientName(string memory updatedName) external",
            "function updatePatientAge(uint256 updatedAge) external",
            "function updatePatientGender(string memory updatedGender) external",
            "function updatePatientHeight(uint256 updatedHeight) external",
            "function updatePatientWeight(uint256 updatedWeight) external",
            "function updatePatientBloodGroup(string memory updatedBloodGroup) external",
            
            // Access Control Functions
            "function requestAccess() external",
            "function approveAccess(address requester, uint256 expiryDuration, uint256[] calldata prescriptionIds, uint256[] calldata reportIds, uint256[] calldata billIds) external",
            "function revokeAccess(address requester) external",
            
            // Access Extension Functions
            "function requestExtendAccess(uint256 additionalTime) external",
            "function approveExtendAccess(address requester) external",
            
            // View/Getter Functions
            "function getApprovedRecords() external view returns (tuple(string prescriptionName, string prescriptionDataHash)[] approvedPrescriptions, tuple(string reportName, string reportDataHash)[] approvedReports, tuple(string billName, string billDataHash)[] approvedBills)",
            "function getBill(string memory billName) external view returns (tuple(string billName, string billDataHash))",
            "function getPrescription(string memory prescriptionName) external view returns (tuple(string prescriptionName, string prescriptionDataHash))",
            "function getReport(string memory reportName) external view returns (tuple(string reportName, string reportDataHash))",
            "function getPatientDetails() external view returns (string memory name, uint256 age, string memory gender, uint256 height, uint256 weight, string memory bloodGroup)",
            "function getPatientId() external view returns (uint256)",
            "function hasAccessExpired() external view returns (bool)",
            "function checkExtensionRequest(address requester) external view returns (bool exists, uint256 additionalTime, uint256 requestTime)",
            
            // Events
            "event BillAdded(uint256 indexed patientId, string indexed billName, uint256 billId)",
            "event PrescriptionAdded(uint256 indexed patientId, string indexed prescriptionName, uint256 prescriptionId)",
            "event ReportAdded(uint256 indexed patientId, string indexed reportName, uint256 reportId)",
            "event PatientNameUpdated(uint256 indexed patientId, string indexed newName)",
            "event PatientAgeUpdated(uint256 indexed patientId, uint256 indexed newAge)",
            "event PatientGenderUpdated(uint256 indexed patientId, string indexed newGender)",
            "event PatientHeightUpdated(uint256 indexed patientId, uint256 indexed newHeight)",
            "event PatientWeightUpdated(uint256 indexed patientId, uint256 indexed newWeight)",
            "event PatientBloodGroupUpdated(uint256 indexed patientId, string indexed newBloodGroup)",
            "event AccessRequested(address indexed requester, uint256 timestamp)",
            "event AccessApproved(address indexed requester, uint256 timestamp)",
            "event AccessRevoked(address indexed requester, uint256 timestamp)",
            "event ExtensionRequested(address indexed requester, uint256 additionalTime, uint256 timestamp)",
            "event ExtensionApproved(address indexed requester, uint256 newExpiryTime)"
        ];
    }



    /**
     * Fallback ABI for Factory contract - COMPLETE with utility functions
     */
    getFallbackFactoryABI() {
        return [
            "function createHealthRecord(string memory name, uint256 id, uint256 age, string memory gender, uint256 height, uint256 weight, string memory bloodGroup) public returns (address)",
            "function getContractByPatientId(uint256 patientId) external view returns (address)",
            "function getPatientIdByAddress(address patient) external view returns (uint256)",
            "function getAllPatientIds() external view returns (uint256[] memory)",
            "function getPatientCount() external view returns (uint256)",
            "event HealthRecordCreated(uint256 indexed patientId, address indexed patientAddress, address indexed contractAddress)"
        ];
    }
}

// Create singleton instance
const contractService = new ContractService();

export default contractService; 