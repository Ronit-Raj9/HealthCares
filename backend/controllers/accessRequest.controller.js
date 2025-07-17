import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { ApiResponse } from '../utils/apiResponse.js';
import AccessRequest from '../models/accessRequest.model.js';
import Doctor from '../models/doctor.model.js';
import Patient from '../models/patient.model.js';
import MedicalRecord from '../models/medicalRecord.model.js';
import crypto from 'crypto';
import { generateKeyFromSignature } from '../utils/encryption.js';

// Doctor creates an access request
export const createAccessRequest = asyncHandler(async (req, res) => {
    const { patientId, requestReason, requestType = 'all_records', walletAddress } = req.body;
    const doctorId = req.user._id;

    if (!patientId || !requestReason) {
        throw new ApiError(400, "Patient ID and request reason are required");
    }

    if (!walletAddress) {
        throw new ApiError(400, "Wallet connection required to send access requests");
    }

    // Verify the doctor has this wallet address registered
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
        throw new ApiError(404, "Doctor not found");
    }

    if (!doctor.walletAddress || doctor.walletAddress.toLowerCase() !== walletAddress.toLowerCase()) {
        throw new ApiError(403, "Wallet address does not match registered doctor wallet");
    }

    // Check if patient exists
    const patient = await Patient.findById(patientId);
    if (!patient) {
        throw new ApiError(404, "Patient not found");
    }

    // Check if there's already a pending request from this doctor to this patient
    const existingRequest = await AccessRequest.findOne({
        doctorId,
        patientId,
        status: 'pending'
    });

    if (existingRequest) {
        throw new ApiError(400, "You already have a pending request for this patient");
    }

    const accessRequest = await AccessRequest.create({
        doctorId,
        patientId,
        requestReason,
        requestType
    });

    // Populate doctor info for response
    await accessRequest.populate('doctorId', 'name email specialization');

    return res.status(201).json(
        new ApiResponse(201, accessRequest, "Access request sent successfully")
    );
});

// Get all requests made by a doctor
export const getDoctorRequests = asyncHandler(async (req, res) => {
    const doctorId = req.user._id;

    const requests = await AccessRequest.find({ doctorId })
        .populate('patientId', 'name email age gender')
        .populate('selectedRecords', 'name recordType dateCreated')
        .sort({ requestedAt: -1 });

    return res.status(200).json(
        new ApiResponse(200, requests, "Doctor requests retrieved successfully")
    );
});

// Get all requests for a patient
export const getPatientRequests = asyncHandler(async (req, res) => {
    const patientId = req.user._id;

    const requests = await AccessRequest.find({ patientId })
        .populate('doctorId', 'name email specialization image')
        .sort({ requestedAt: -1 });

    return res.status(200).json(
        new ApiResponse(200, requests, "Patient requests retrieved successfully")
    );
});

// Patient responds to an access request
export const respondToAccessRequest = asyncHandler(async (req, res) => {
    const { requestId, action, selectedRecords, patientNotes, accessDuration = 30, patientSignature } = req.body;
    const patientId = req.user._id;

    if (!requestId || !action) {
        throw new ApiError(400, "Request ID and action are required");
    }

    if (!['approve', 'deny'].includes(action)) {
        throw new ApiError(400, "Action must be 'approve' or 'deny'");
    }

    const accessRequest = await AccessRequest.findOne({
        _id: requestId,
        patientId,
        status: 'pending'
    });

    if (!accessRequest) {
        throw new ApiError(404, "Access request not found or already processed");
    }

    accessRequest.status = action === 'approve' ? 'approved' : 'denied';
    accessRequest.respondedAt = new Date();
    accessRequest.patientNotes = patientNotes;

    if (action === 'approve') {
        if (!selectedRecords || selectedRecords.length === 0) {
            throw new ApiError(400, "At least one record must be selected for approval");
        }

        // Validate that all selected records belong to the patient
        const records = await MedicalRecord.find({
            _id: { $in: selectedRecords },
            patientId
        });

        if (records.length !== selectedRecords.length) {
            throw new ApiError(400, "Some selected records don't belong to you");
        }

        accessRequest.selectedRecords = selectedRecords;

        // Calculate access expiry date based on provided duration
        const accessExpiresAt = new Date();
        accessExpiresAt.setDate(accessExpiresAt.getDate() + accessDuration);
        accessRequest.accessExpiresAt = accessExpiresAt;

        // Generate patient's encryption key from their signature (if provided)
        let patientEncryptionKey = null;
        if (patientSignature) {
            patientEncryptionKey = generateKeyFromSignature(patientSignature);
        }

        // Create access granted records with unique access keys for the doctor
        accessRequest.accessGrantedRecords = records.map(record => ({
            recordId: record._id,
            accessKey: crypto.randomBytes(32).toString('hex'), // Unique key for this doctor-record pair
            patientEncryptionKey: patientEncryptionKey // Store patient's original encryption key
        }));

        // Update medical records to include authorized access
        await MedicalRecord.updateMany(
            { _id: { $in: selectedRecords } },
            {
                $push: {
                    authorizedUsers: {
                        userId: accessRequest.doctorId,
                        userType: 'Doctor',
                        accessExpiresAt: accessExpiresAt,
                        grantedAt: new Date()
                    }
                }
            }
        );
    }

    await accessRequest.save();

    // Populate for response
    await accessRequest.populate([
        { path: 'doctorId', select: 'name email specialization' },
        { path: 'selectedRecords', select: 'name recordType dateCreated' }
    ]);

    return res.status(200).json(
        new ApiResponse(200, accessRequest, `Access request ${action}d successfully`)
    );
});

// Get authorized records for a doctor
export const getAuthorizedRecords = asyncHandler(async (req, res) => {
    const doctorId = req.user._id;

    try {
        // Find all approved access requests for this doctor
        const approvedRequests = await AccessRequest.find({
            doctorId,
            status: 'approved',
            accessExpiresAt: { $gt: new Date() } // Not expired
        }).populate('selectedRecords').populate('patientId', 'name');

        // Flatten all authorized records
        const authorizedRecords = [];
        for (const request of approvedRequests) {
            for (const record of request.selectedRecords || []) {
                // Add patient name and access info
                const recordWithAccess = {
                    ...record.toObject(),
                    patientName: request.patientId?.name || 'Unknown Patient',
                    accessExpiresAt: request.accessExpiresAt,
                    grantedAt: request.respondedAt
                };
                authorizedRecords.push(recordWithAccess);
            }
        }

        return res.status(200).json(
            new ApiResponse(200, authorizedRecords, "Authorized records retrieved successfully")
        );
    } catch (error) {
        console.error('Error getting authorized records:', error);
        throw new ApiError(500, "Error retrieving authorized records");
    }
});

// Revoke access to a specific record (patient only)
export const revokeAccess = asyncHandler(async (req, res) => {
    const { recordId, doctorId } = req.body;
    const patientId = req.user._id;

    if (!recordId || !doctorId) {
        throw new ApiError(400, "Record ID and Doctor ID are required");
    }

    // Remove doctor from record's authorized users
    const result = await MedicalRecord.updateOne(
        { 
            _id: recordId, 
            patientId,
            'authorizedUsers.userId': doctorId 
        },
        {
            $pull: {
                authorizedUsers: { userId: doctorId }
            }
        }
    );

    if (result.modifiedCount === 0) {
        throw new ApiError(404, "Record not found or doctor doesn't have access");
    }

    // Update access request status if it exists
    await AccessRequest.updateMany(
        {
            doctorId,
            patientId,
            selectedRecords: recordId,
            status: 'approved'
        },
        {
            $pull: { selectedRecords: recordId }
        }
    );

    return res.status(200).json(
        new ApiResponse(200, null, "Access revoked successfully")
    );
});

// Clean up expired access requests and authorizations (admin/system function)
export const cleanupExpiredAccess = asyncHandler(async (req, res) => {
    const now = new Date();

    // Update expired access requests
    await AccessRequest.updateMany(
        {
            status: 'approved',
            accessExpiresAt: { $lt: now }
        },
        { status: 'expired' }
    );

    // Remove expired authorizations from medical records
    await MedicalRecord.updateMany(
        {},
        {
            $pull: {
                authorizedUsers: {
                    accessExpiresAt: { $lt: now }
                }
            }
        }
    );

    return res.status(200).json(
        new ApiResponse(200, null, "Expired access cleaned up successfully")
    );
}); 