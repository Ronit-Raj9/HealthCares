import Doctor from '../models/doctor.model.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { 
    generateDoctorKeyPair, 
    encryptSymmetricKey, 
    decryptSymmetricKey 
} from '../utils/encryption.js';
import crypto from 'crypto';
import { Buffer } from 'buffer';

/**
 * Generate RSA key pair for doctor
 * This should be called when doctor first logs in or requests key generation
 */
const generateKeyPair = asyncHandler(async (req, res) => {
    const doctorId = req.user._id;
    const { password } = req.body; // Doctor's password for encrypting private key
    
    if (!password) {
        throw new ApiError(400, "Password is required to secure private key");
    }

    // Check if doctor already has keys
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
        throw new ApiError(404, "Doctor not found");
    }

    if (doctor.isKeyPairGenerated) {
        throw new ApiError(409, "Key pair already exists for this doctor");
    }

    // Generate RSA key pair
    const { publicKey, privateKey } = generateDoctorKeyPair();

    // Encrypt private key with doctor's password
    const encryptedPrivateKey = encryptPrivateKeyWithPassword(privateKey, password);

    // Update doctor record
    doctor.publicKey = publicKey;
    doctor.privateKey = encryptedPrivateKey;
    doctor.keyGeneratedAt = new Date();
    doctor.isKeyPairGenerated = true;

    await doctor.save();

    return res.status(200).json(
        new ApiResponse(200, {
            publicKey,
            keyGeneratedAt: doctor.keyGeneratedAt
        }, "Key pair generated successfully")
    );
});

/**
 * Get doctor's public key
 * This is used by patients when they want to share encrypted keys
 */
const getPublicKey = asyncHandler(async (req, res) => {
    const { doctorId } = req.params;

    const doctor = await Doctor.findById(doctorId).select('publicKey isKeyPairGenerated');
    if (!doctor) {
        throw new ApiError(404, "Doctor not found");
    }

    if (!doctor.isKeyPairGenerated || !doctor.publicKey) {
        throw new ApiError(404, "Doctor has not generated encryption keys yet");
    }

    return res.status(200).json(
        new ApiResponse(200, {
            publicKey: doctor.publicKey,
            doctorId: doctor._id
        }, "Public key retrieved successfully")
    );
});

/**
 * Decrypt symmetric key for doctor to access patient records
 * This is used when doctor wants to access patient's encrypted files
 */
const decryptPatientKey = asyncHandler(async (req, res) => {
    const doctorId = req.user._id;
    const { encryptedSymmetricKey, password } = req.body;

    if (!encryptedSymmetricKey || !password) {
        throw new ApiError(400, "Encrypted symmetric key and password are required");
    }

    // Get doctor's encrypted private key
    const doctor = await Doctor.findById(doctorId).select('privateKey isKeyPairGenerated');
    if (!doctor || !doctor.isKeyPairGenerated) {
        throw new ApiError(404, "Doctor encryption keys not found");
    }

    try {
        // Decrypt doctor's private key using password
        const doctorPrivateKey = decryptPrivateKeyWithPassword(doctor.privateKey, password);

        // Decrypt patient's symmetric key using doctor's private key
        const patientSymmetricKey = decryptSymmetricKey(encryptedSymmetricKey, doctorPrivateKey);

        return res.status(200).json(
            new ApiResponse(200, {
                symmetricKey: patientSymmetricKey
            }, "Patient key decrypted successfully")
        );
    } catch (err) {
        console.error("Decryption error:", err);
        throw new ApiError(400, "Failed to decrypt patient key. Invalid password or corrupted key.");
    }
});

/**
 * Encrypt patient's symmetric key with doctor's public key
 * This is used when patient approves access for a doctor
 */
const encryptPatientKey = asyncHandler(async (req, res) => {
    const { doctorId, symmetricKey } = req.body;

    if (!doctorId || !symmetricKey) {
        throw new ApiError(400, "Doctor ID and symmetric key are required");
    }

    // Get doctor's public key
    const doctor = await Doctor.findById(doctorId).select('publicKey isKeyPairGenerated');
    if (!doctor || !doctor.isKeyPairGenerated) {
        throw new ApiError(404, "Doctor encryption keys not found");
    }

    try {
        // Encrypt symmetric key with doctor's public key
        const encryptedKey = encryptSymmetricKey(symmetricKey, doctor.publicKey);

        return res.status(200).json(
            new ApiResponse(200, {
                encryptedSymmetricKey: encryptedKey,
                doctorId
            }, "Patient key encrypted successfully")
        );
    } catch (err) {
        console.error("Encryption error:", err);
        throw new ApiError(500, "Failed to encrypt patient key");
    }
});

/**
 * Regenerate key pair for doctor (in case of compromise)
 */
const regenerateKeyPair = asyncHandler(async (req, res) => {
    const doctorId = req.user._id;
    const { password, newPassword } = req.body;

    if (!password || !newPassword) {
        throw new ApiError(400, "Current password and new password are required");
    }

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
        throw new ApiError(404, "Doctor not found");
    }

    // Verify current password
    const isPasswordValid = await doctor.comparePassword(password);
    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid current password");
    }

    // Generate new RSA key pair
    const { publicKey, privateKey } = generateDoctorKeyPair();

    // Encrypt private key with new password
    const encryptedPrivateKey = encryptPrivateKeyWithPassword(privateKey, newPassword);

    // Update doctor record
    doctor.publicKey = publicKey;
    doctor.privateKey = encryptedPrivateKey;
    doctor.keyGeneratedAt = new Date();

    await doctor.save();

    return res.status(200).json(
        new ApiResponse(200, {
            publicKey,
            keyGeneratedAt: doctor.keyGeneratedAt
        }, "Key pair regenerated successfully")
    );
});

/**
 * Helper function to encrypt private key with password
 */
function encryptPrivateKeyWithPassword(privateKey, password) {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(password, 'salt', 32);
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    
    let encrypted = cipher.update(privateKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return iv.toString('hex') + ':' + encrypted;
}

/**
 * Helper function to decrypt private key with password
 */
function decryptPrivateKeyWithPassword(encryptedPrivateKey, password) {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(password, 'salt', 32);
    
    const parts = encryptedPrivateKey.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = parts[1];
    
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
}

export {
    generateKeyPair,
    getPublicKey,
    decryptPatientKey,
    encryptPatientKey,
    regenerateKeyPair
}; 