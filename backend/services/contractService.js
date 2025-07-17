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
     * @returns {Object} - {recordId, transactionHash}
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
            } else {
                recordId = parsedEvent.args.recordId;
            }

            return {
                recordId: recordId.toString(),
                transactionHash: tx.hash,
                blockNumber: receipt.blockNumber
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
     * @param {Array} recordIds - Array of record IDs
     * @param {string} recordType - Type of records
     * @param {number} duration - Access duration in days
     * @returns {Object} - Transaction details
     */
    async grantAccess(contractAddress, doctorAddress, recordIds, recordType, duration) {
        await this.ensureInitialized();
        
        const contract = await this.connectToPatientContract(contractAddress);
        
        try {
            const tx = await contract.approveAccess(
                doctorAddress,
                recordIds,
                recordType.toLowerCase(),
                duration
            );

            const receipt = await tx.wait();

            return {
                transactionHash: tx.hash,
                blockNumber: receipt.blockNumber
            };
        } catch (error) {
            console.error('Error granting access:', error);
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
        
        const contract = await this.connectToPatientContract(contractAddress);
        
        try {
            const result = await contract.getApprovedRecords(doctorAddress);
            
            return {
                bills: result.bills || [],
                prescriptions: result.prescriptions || [],
                reports: result.reports || []
            };
        } catch (error) {
            console.error('Error getting approved records:', error);
            throw error;
        }
    }

    /**
     * Fallback ABI for HealthRecord contract
     */
    getFallbackHealthRecordABI() {
        return [
            "function addBill(string memory billName, string memory billDataHash) public",
            "function addPrescription(string memory prescriptionName, string memory prescriptionDataHash) public",
            "function addReport(string memory reportName, string memory reportDataHash) public",
            "function approveAccess(address requester, uint256[] memory recordIds, string memory recordType, uint256 duration) public",
            "function getApprovedRecords(address requester) public view returns (tuple(string name, string dataHash)[] bills, tuple(string name, string dataHash)[] prescriptions, tuple(string name, string dataHash)[] reports)",
            "event BillAdded(uint256 indexed patientId, string indexed billName, uint256 billId)",
            "event PrescriptionAdded(uint256 indexed patientId, string indexed prescriptionName, uint256 prescriptionId)",
            "event ReportAdded(uint256 indexed patientId, string indexed reportName, uint256 reportId)"
        ];
    }

    /**
     * Fallback ABI for Factory contract
     */
    getFallbackFactoryABI() {
        return [
            "function createHealthRecord(string memory name, uint256 id, uint256 age, string memory gender, uint256 height, uint256 weight, string memory bloodGroup) public returns (address)",
            "event HealthRecordCreated(uint256 indexed patientId, address indexed patientAddress, address indexed contractAddress)"
        ];
    }
}

// Create singleton instance
const contractService = new ContractService();

export default contractService; 