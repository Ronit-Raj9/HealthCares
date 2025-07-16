import MedicalRecord from '../models/medicalRecord.model.js';
import { create } from 'ipfs-http-client';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { ApiResponse } from '../utils/apiResponse.js';
import crypto from 'crypto';

// Initialize IPFS client
const ipfs = create({
    host: process.env.IPFS_HOST,
    port: process.env.IPFS_PORT,
    protocol: process.env.IPFS_PROTOCOL
});

// Upload medical record to IPFS and save metadata to MongoDB
const uploadMedicalRecord = asyncHandler(async (req, res) => {
    const { recordType, name, description } = req.body;
    const file = req.file;

    if (!file) {
        throw new ApiError(400, "File is required");
    }
    if (!recordType || !['prescription', 'report', 'bill'].includes(recordType)) {
        throw new ApiError(400, "Invalid or missing recordType");
    }
    if (!name) {
        throw new ApiError(400, "Record name is required");
    }

    // Format the record name to include current date and time for uniqueness
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    const uniqueName = `${name}-${dateStr}`;

    // Get file buffer
    const fileBuffer = file.buffer;

    // Compute sha256 hash for integrity
    const dataHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // Upload to IPFS
    const result = await ipfs.add(fileBuffer);
    const ipfsHash = result.path;

    // Create medical record in database
    const medicalRecord = await MedicalRecord.create({
        patientId: req.user._id,
        recordType,
        name: uniqueName,
        description,
        ipfsHash,
        dataHash,
        authorizedUsers: [{
            userId: req.user._id,
            userType: 'Patient'
        }]
    });

    return res.status(201).json(
        new ApiResponse(201, medicalRecord, "Medical record uploaded successfully")
    );
});

// Get all medical records for a patient (owner or authorized)
const getPatientRecords = asyncHandler(async (req, res) => {
    const records = await MedicalRecord.find({
        $or: [
            { patientId: req.user._id },
            { 'authorizedUsers.userId': req.user._id }
        ]
    }).sort({ uploadedAt: -1 });

    return res.status(200).json(
        new ApiResponse(200, records, "Records fetched successfully")
    );
});

// Grant access to a user (doctor or another patient)
const grantAccess = asyncHandler(async (req, res) => {
    const { recordId, userId, userType, expiryDate } = req.body;
    if (!recordId || !userId || !userType) {
        throw new ApiError(400, "Missing required fields");
    }
    if (!['Patient', 'Doctor'].includes(userType)) {
        throw new ApiError(400, "Invalid userType");
    }
    const record = await MedicalRecord.findById(recordId);
    if (!record) {
        throw new ApiError(404, "Record not found");
    }
    if (record.patientId.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "Not authorized to grant access");
    }
    // Prevent duplicate access grants
    const alreadyGranted = record.authorizedUsers.some(
        user => user.userId.toString() === userId.toString() && user.userType === userType
    );
    if (alreadyGranted) {
        throw new ApiError(409, "Access already granted to this user");
    }
    record.authorizedUsers.push({
        userId,
        userType,
        accessExpiresAt: expiryDate
    });
    await record.save();
    return res.status(200).json(
        new ApiResponse(200, record, "Access granted successfully")
    );
});

// Revoke access from a user
const revokeAccess = asyncHandler(async (req, res) => {
    const { recordId, userId } = req.body;
    if (!recordId || !userId) {
        throw new ApiError(400, "Missing required fields");
    }
    const record = await MedicalRecord.findById(recordId);
    if (!record) {
        throw new ApiError(404, "Record not found");
    }
    if (record.patientId.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "Not authorized to revoke access");
    }
    record.authorizedUsers = record.authorizedUsers.filter(
        user => user.userId.toString() !== userId.toString()
    );
    await record.save();
    return res.status(200).json(
        new ApiResponse(200, record, "Access revoked successfully")
    );
});

// Get all records a user is authorized to access (doctor or patient)
const getAuthorizedRecords = asyncHandler(async (req, res) => {
    const now = new Date();
    const records = await MedicalRecord.find({
        'authorizedUsers.userId': req.user._id,
        $or: [
            { 'authorizedUsers.accessExpiresAt': { $exists: false } },
            { 'authorizedUsers.accessExpiresAt': { $gt: now } }
        ]
    }).sort({ uploadedAt: -1 });
    return res.status(200).json(
        new ApiResponse(200, records, "Authorized records fetched successfully")
    );
});

// View/download a medical record from IPFS by its hash
const viewMedicalRecord = asyncHandler(async (req, res) => {
    const { ipfsHash } = req.params;
    if (!ipfsHash) {
        throw new ApiError(400, "IPFS hash is required");
    }
    try {
        // Fetch file from IPFS
        const stream = ipfs.cat(ipfsHash);
        res.setHeader('Content-Disposition', `attachment; filename="${ipfsHash}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        stream.on('error', (err) => {
            throw new ApiError(404, "File not found on IPFS");
        });
        stream.pipe(res);
    } catch (err) {
        throw new ApiError(500, "Error fetching file from IPFS");
    }
});

// Get a single medical record by ID (with authorization)
const getRecordById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) {
        throw new ApiError(400, "Record ID is required");
    }
    const record = await MedicalRecord.findById(id);
    if (!record) {
        throw new ApiError(404, "Record not found");
    }
    // Only allow owner or authorized user
    const isOwner = record.patientId.toString() === req.user._id.toString();
    const isAuthorized = record.authorizedUsers.some(
        user => user.userId.toString() === req.user._id.toString()
    );
    if (!isOwner && !isAuthorized) {
        throw new ApiError(403, "Not authorized to view this record");
    }
    return res.status(200).json(
        new ApiResponse(200, record, "Record fetched successfully")
    );
});

export {
    uploadMedicalRecord,
    getPatientRecords,
    grantAccess,
    revokeAccess,
    getAuthorizedRecords,
    viewMedicalRecord,
    getRecordById
}; 