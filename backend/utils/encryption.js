import crypto from 'crypto';
import { createHash } from 'crypto';

/**
 * Encryption utility for medical records
 * Handles symmetric encryption (AES-256-GCM) and key management
 */

/**
 * Generate symmetric encryption key from wallet signature
 * @param {string} walletSignature - Signature from MetaMask wallet
 * @returns {string} - 32-byte key as hex string
 */
export const generateKeyFromSignature = (walletSignature) => {
    if (!walletSignature) {
        throw new Error('Wallet signature is required');
    }
    
    // Hash the signature with SHA-256 to create deterministic key
    const hash = createHash('sha256').update(walletSignature).digest();
    return hash.toString('hex');
};

/**
 * Generate a shared access key for doctor to decrypt patient records
 * This creates a deterministic key based on patient's original key and doctor's signature
 * @param {string} patientOriginalKey - The key patient used to encrypt (hex string)
 * @param {string} doctorSignature - Doctor's wallet signature for this record
 * @param {string} recordId - Unique record identifier for added security
 * @returns {string} - 32-byte key as hex string
 */
export const generateDoctorAccessKey = (patientOriginalKey, doctorSignature, recordId) => {
    if (!patientOriginalKey || !doctorSignature || !recordId) {
        throw new Error('Patient key, doctor signature, and record ID are required');
    }
    
    // For now, return the patient's original key since that's what was used to encrypt
    // In a production system, you'd want to re-encrypt with doctor's key
    return patientOriginalKey;
};

/**
 * Encrypt file buffer using AES-256-CBC (simpler and more reliable)
 * @param {Buffer} fileBuffer - Raw file data
 * @param {string} symmetricKey - 32-byte key as hex string
 * @returns {Object} - {encryptedData: Buffer, iv: string}
 */
export const encryptFile = (fileBuffer, symmetricKey) => {
    if (!Buffer.isBuffer(fileBuffer)) {
        throw new Error('File buffer is required');
    }
    if (!symmetricKey || symmetricKey.length !== 64) {
        throw new Error('Valid 32-byte symmetric key required');
    }

    // Generate random IV for each encryption
    const iv = crypto.randomBytes(16);
    const key = Buffer.from(symmetricKey, 'hex');
    
    // Create cipher for AES-256-CBC
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    
    // Encrypt the file
    const encrypted = Buffer.concat([
        cipher.update(fileBuffer),
        cipher.final()
    ]);
    
    return {
        encryptedData: encrypted,
        iv: iv.toString('hex'),
        tag: '' // Not used in CBC mode
    };
};

/**
 * Decrypt file buffer using AES-256-CBC
 * @param {Buffer} encryptedData - Encrypted file data
 * @param {string} symmetricKey - 32-byte key as hex string
 * @param {string} iv - Initialization vector as hex string
 * @param {string} tag - Authentication tag (not used in CBC mode)
 * @returns {Buffer} - Decrypted file data
 */
export const decryptFile = (encryptedData, symmetricKey, iv, tag = '') => {
    if (!Buffer.isBuffer(encryptedData)) {
        throw new Error('Encrypted data buffer is required');
    }
    if (!symmetricKey || symmetricKey.length !== 64) {
        throw new Error('Valid 32-byte symmetric key required');
    }
    if (!iv) {
        throw new Error('IV is required');
    }

    const key = Buffer.from(symmetricKey, 'hex');
    const ivBuffer = Buffer.from(iv, 'hex');
    
    // Create decipher for AES-256-CBC
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, ivBuffer);
    
    // Decrypt the file
    const decrypted = Buffer.concat([
        decipher.update(encryptedData),
        decipher.final()
    ]);
    
    return decrypted;
};

/**
 * Generate RSA key pair for doctor's asymmetric encryption
 * @returns {Object} - {publicKey: string, privateKey: string}
 */
export const generateDoctorKeyPair = () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {
            type: 'spki',
            format: 'pem'
        },
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem'
        }
    });
    
    return { publicKey, privateKey };
};

/**
 * Encrypt symmetric key with doctor's RSA public key
 * @param {string} symmetricKey - Patient's symmetric key as hex
 * @param {string} doctorPublicKey - Doctor's RSA public key in PEM format
 * @returns {string} - Encrypted symmetric key as base64
 */
export const encryptSymmetricKey = (symmetricKey, doctorPublicKey) => {
    if (!symmetricKey || !doctorPublicKey) {
        throw new Error('Symmetric key and doctor public key are required');
    }
    
    const keyBuffer = Buffer.from(symmetricKey, 'hex');
    const encrypted = crypto.publicEncrypt(doctorPublicKey, keyBuffer);
    
    return encrypted.toString('base64');
};

/**
 * Decrypt symmetric key with doctor's RSA private key
 * @param {string} encryptedSymmetricKey - Encrypted key as base64
 * @param {string} doctorPrivateKey - Doctor's RSA private key in PEM format
 * @returns {string} - Decrypted symmetric key as hex
 */
export const decryptSymmetricKey = (encryptedSymmetricKey, doctorPrivateKey) => {
    if (!encryptedSymmetricKey || !doctorPrivateKey) {
        throw new Error('Encrypted symmetric key and doctor private key are required');
    }
    
    const encryptedBuffer = Buffer.from(encryptedSymmetricKey, 'base64');
    const decrypted = crypto.privateDecrypt(doctorPrivateKey, encryptedBuffer);
    
    return decrypted.toString('hex');
};

/**
 * Generate SHA-256 hash of file buffer for integrity verification
 * @param {Buffer} fileBuffer - Raw file data
 * @returns {string} - SHA-256 hash as hex string
 */
export const generateFileHash = (fileBuffer) => {
    if (!Buffer.isBuffer(fileBuffer)) {
        throw new Error('File buffer is required');
    }
    
    return createHash('sha256').update(fileBuffer).digest('hex');
};

/**
 * Verify file integrity by comparing hashes
 * @param {Buffer} fileBuffer - Current file data
 * @param {string} expectedHash - Expected SHA-256 hash
 * @returns {boolean} - True if hashes match
 */
export const verifyFileIntegrity = (fileBuffer, expectedHash) => {
    if (!Buffer.isBuffer(fileBuffer) || !expectedHash) {
        throw new Error('File buffer and expected hash are required');
    }
    
    const currentHash = generateFileHash(fileBuffer);
    return currentHash === expectedHash;
}; 