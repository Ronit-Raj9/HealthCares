import mongoose from 'mongoose';

const accessRequestSchema = new mongoose.Schema({
    doctorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Doctor',
        required: true
    },
    patientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Patient',
        required: true
    },
    requestReason: {
        type: String,
        required: true,
        trim: true
    },
    requestType: {
        type: String,
        enum: ['all_records', 'specific_records'],
        default: 'all_records'
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'denied', 'expired'],
        default: 'pending'
    },
    
    // Request details
    requestedAt: {
        type: Date,
        default: Date.now
    },
    
    // Patient response
    respondedAt: {
        type: Date
    },
    selectedRecords: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MedicalRecord'
    }],
    patientNotes: {
        type: String,
        trim: true
    },
    
    // Access control
    accessExpiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days default
    },
    
    // Audit trail
    accessGrantedRecords: [{
        recordId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'MedicalRecord'
        },
        grantedAt: {
            type: Date,
            default: Date.now
        },
        accessKey: String, // Encrypted key for this doctor to access this record
        patientEncryptionKey: String // The original key patient used to encrypt this record
    }],
    
    // Extension Request Tracking (for requestExtendAccess/approveExtendAccess workflow)
    extensionRequests: [{
        requestedAt: {
            type: Date,
            default: Date.now
        },
        additionalTime: {
            type: Number, // Additional time in seconds
            required: true
        },
        reason: {
            type: String,
            trim: true
        },
        status: {
            type: String,
            enum: ['pending', 'approved', 'denied'],
            default: 'pending'
        },
        processedAt: {
            type: Date
        },
        processedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Patient'
        },
        blockchainTransactionHash: {
            type: String // Transaction hash for approveExtendAccess
        }
    }]
}, {
    timestamps: true
});

// Indexes for efficient queries
accessRequestSchema.index({ doctorId: 1, status: 1 });
accessRequestSchema.index({ patientId: 1, status: 1 });
accessRequestSchema.index({ status: 1, accessExpiresAt: 1 });

// Auto-expire pending requests after 7 days
accessRequestSchema.index({ 
    requestedAt: 1 
}, { 
    expireAfterSeconds: 7 * 24 * 60 * 60, // 7 days
    partialFilterExpression: { status: 'pending' }
});

const AccessRequest = mongoose.model('AccessRequest', accessRequestSchema);

export default AccessRequest; 