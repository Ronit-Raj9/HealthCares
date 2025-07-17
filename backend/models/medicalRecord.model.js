import mongoose from 'mongoose';
import { Schema } from 'mongoose';

const medicalRecordSchema = new Schema({
    patientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Patient',
        required: true
    },
    recordType: {
        type: String,
        enum: ['prescription', 'report', 'bill'],
        required: true
    },
    name: {
        type: String,
        required: true
    },
    originalFilename: { // Original filename with extension from upload
        type: String,
        required: true
    },
    description: {
        type: String
    },
    ipfsHash: {
        type: String,
        required: true
    },
    dataHash: { // sha256 hash of the raw file for integrity
        type: String,
        required: true
    },
    recordId_onchain: { // on-chain record ID from smart contract
        type: Number
    },
    patientContractAddress: { // patient's deployed contract address
        type: String
    },
    // Blockchain transaction tracking for your specific contract functions
    blockchainTransactions: {
        // Transaction for adding record (addBill/addPrescription/addReport)
        upload: {
            transactionHash: { type: String },
            blockNumber: { type: Number },
            gasUsed: { type: Number },
            contractFunction: { 
                type: String, 
                enum: ['addBill', 'addPrescription', 'addReport'] 
            },
            timestamp: { type: Date },
            status: { 
                type: String, 
                enum: ['pending', 'confirmed', 'failed'], 
                default: 'pending' 
            }
        },
        // Transactions for access control (requestAccess, approveAccess, revokeAccess)
        accessTransactions: [{
            doctorWalletAddress: { type: String },
            doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
            transactionHash: { type: String },
            blockNumber: { type: Number },
            gasUsed: { type: Number },
            contractFunction: { 
                type: String, 
                enum: ['requestAccess', 'approveAccess', 'revokeAccess', 'requestExtendAccess', 'approveExtendAccess'] 
            },
            timestamp: { type: Date, default: Date.now },
            status: { 
                type: String, 
                enum: ['pending', 'confirmed', 'failed'], 
                default: 'pending' 
            },
            // For approveAccess function parameters
            expiryDuration: { type: Number }, // Duration in seconds
            approvedRecordIds: [{ type: Number }], // Array of record IDs approved
            recordType: { type: String, enum: ['prescription', 'bill', 'report'] }
        }]
    },
    // Encryption-related fields
    encryptionIv: { // initialization vector for AES encryption
        type: String,
        required: true
    },
    encryptionTag: { // authentication tag for AES-GCM (optional, not used in CBC mode)
        type: String,
        required: false
    },
    isEncrypted: { // flag to indicate if file is encrypted
        type: Boolean,
        default: true
    },
    // Key management for authorized users
    encryptedSymmetricKeys: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: 'userType'
        },
        userType: {
            type: String,
            enum: ['Patient', 'Doctor']
        },
        encryptedKey: { // patient's symmetric key encrypted with user's public key
            type: String,
            required: true
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],
    uploadedAt: {
        type: Date,
        default: Date.now
    },
    authorizedUsers: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: 'userType'
        },
        userType: {
            type: String,
            enum: ['Patient', 'Doctor']
        },
        accessGrantedAt: {
            type: Date,
            default: Date.now
        },
        accessExpiresAt: {
            type: Date
        },
        accessStatus: {
            type: String,
            enum: ['pending', 'approved', 'denied', 'revoked'],
            default: 'approved'
        }
    }]
});

const MedicalRecord = mongoose.model('MedicalRecord', medicalRecordSchema);
export default MedicalRecord; 