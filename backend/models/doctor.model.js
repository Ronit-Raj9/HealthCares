import mongoose from 'mongoose';
import { Schema } from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const doctorSchema = new Schema({
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
        unique: true,
    },
    password: {
        type: String,
        required: true,
    },
    specialization: {
        type: String,
        required: true,
    },
    hospitalName: {
        type: String,
       
    },
    phone: {
        type: String,
        
    },
    address: {
        type: String,
      
    },
    experience: {
        type: String,
        required: true,
    },
    qualification: {
        type: String,
       
    },
    fees: {
        type: Number,
        required: true,
    },
    gender: {
        type: String,
        
    },
    image: {
        type: String,
        
    },
    isVerified: {
        type: Boolean,
        default: false,
    },
    notifications: {
        type: [{
            _id: { type: mongoose.Schema.Types.ObjectId, ref: 'Notification' },
            message: { type: String, required: true },
            isRead: {
                type: Boolean,
                default: false
            }
        }],
        default: [],
    },
    appointments: {
        type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' }],
        default: [],
    },
    // Encryption keys for secure patient data access
    publicKey: {
        type: String, // RSA public key in PEM format
        required: false // Will be generated on first login/key generation
    },
    privateKey: {
        type: String, // RSA private key in PEM format (encrypted with doctor's password)
        required: false
    },
    keyGeneratedAt: {
        type: Date
    },
    isKeyPairGenerated: {
        type: Boolean,
        default: false
    }
});
// Hash the password before saving
doctorSchema.pre('save', async function (next) {
    if (!this.isModified('password')) {
        return next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});
// Method to compare passwords
doctorSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};
doctorSchema.methods.generateAccessToken = async function () {
    return await jwt.sign(
        { _id: this._id, walletAddress: this.walletAddress, email: this.email },
        "hello123",//process.env.ACCESSJWT_SECRET
        { expiresIn: '30d' }
    );
};

doctorSchema.methods.generateRefreshToken = async function () {
 return await jwt.sign(
        { _id: this._id, },
        "hello123",//process.env.REFRESHJWT_SECRET
        { expiresIn: '30d' }
    );
};
// Method to generate a JWT token

const Doctor= mongoose.model('Doctor', doctorSchema);
export default Doctor;