import mongoose from 'mongoose';
import { Schema } from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Report from './report.model.js';
import  Appointment from './appointment.model.js';

const  patientSchema = new Schema({
    walletAddress: {
        type: String,
        required: true,
        unique: true,
    },
    name: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        unique: true,
    },
    password: {
        type: String,
        required: true,
    },
    phone: {
        type: String,
        
    },
    address: {
        type: String,
        
    },
    age: {
        type: Number,
        
    },
    gender: {
        type: String,
       
    },
   bloodGroup: {
        type: String,
        
    },
    image: {
        type: String,
        
    },
    // Blockchain contract address for this patient
    contractAddress: {
        type: String,
        default: null,
    },
    // Contract deployment transaction hash
    contractDeploymentTx: {
        type: String,
        default: null,
    },
    // Contract deployment status
    contractDeploymentStatus: {
        type: String,
        enum: ['pending', 'deployed', 'failed'],
        default: 'pending',
    },
    // Additional transaction tracking
    contractDeploymentBlockNumber: {
        type: Number,
        default: null,
    },
    contractDeploymentGasUsed: {
        type: Number,
        default: null,
    },
    // Complete blockchain transaction history for this patient's contract
    contractTransactionHistory: [{
        transactionHash: {
            type: String,
            required: true
        },
        contractFunction: {
            type: String,
            enum: [
                // Factory functions
                'createHealthRecord',
                // Patient profile functions  
                'updatePatientName', 'updatePatientAge', 'updatePatientGender', 
                'updatePatientHeight', 'updatePatientWeight', 'updatePatientBloodGroup',
                // Record management functions
                'addBill', 'addPrescription', 'addReport',
                // Access control functions
                'requestAccess', 'approveAccess', 'revokeAccess', 
                'requestExtendAccess', 'approveExtendAccess'
            ],
            required: true
        },
        blockNumber: {
            type: Number
        },
        gasUsed: {
            type: Number
        },
        timestamp: {
            type: Date,
            default: Date.now
        },
        status: {
            type: String,
            enum: ['pending', 'confirmed', 'failed'],
            default: 'pending'
        },
        // Additional context based on function
        relatedData: {
            recordId: { type: Number }, // For record-related transactions
            recordType: { type: String, enum: ['bill', 'prescription', 'report'] },
            doctorAddress: { type: String }, // For access-related transactions
            recordName: { type: String } // For record uploads
        }
    }],
    isVerified: {
        type: Boolean,
        default: false,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    reports: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Report',
    }],
    appointments: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Appointment',
    }],
    refreshToken:{
        type: String,
        default: null,
    },
    notifications: {
       type: [{
         _id:{type:mongoose.Schema.Types.ObjectId, ref: 'Notification'},
         message: { type: String, required: true },
        isRead: { type: Boolean, default: false },
         }],
        default: [],
    }
});


    
patientSchema.pre('save', async function (next) {
    if (this.isModified('password')) {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
    }
    next();
});
patientSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

patientSchema.methods.generateAccessToken = async function () {
    return await  jwt.sign(
        { 
            _id: this._id ,
            email:this.email,
            walletAddress: this.walletAddress,

        },
        "hello123",// process.env.ACCESSJWT_SECRET
        {
        expiresIn: '7d',
    });

}

patientSchema.methods.generateRefreshToken = async function () {
    return await jwt.sign(
        {
            _id: this._id,
           
        },
        "hello123",//process.env.REFRESHJWT_SECRET
        {
            expiresIn: '30d',
        }
    );
    
};

const Patient= mongoose.model('Patient', patientSchema);
export default Patient;