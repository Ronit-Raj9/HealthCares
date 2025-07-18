import Router from 'express';
import {
    createAccessRequest,
    getDoctorRequests,
    getPatientRequests,
    respondToAccessRequest,
    getAuthorizedRecords,
    getBlockchainAuthorizedRecords,
    revokeAccess,
    cleanupExpiredAccess,
    getAccessRequestDetails,
    getPatientContractInfo,
    // Access extension functions
    requestAccessExtension,
    approveAccessExtension,
    denyAccessExtension,
    getPatientExtensionRequests,
    getDoctorExtensionRequests,
    checkBlockchainExtensionStatus,
    // Access monitoring functions
    checkAccessExpiry,
    getDoctorAccessStatus,
    getPatientAccessMonitoring,
    refreshAccessStatus,
    // Patient authorized access
    getPatientAuthorizedAccess,
    // Access revocation functions
    revokeCompleteAccess,
    getRevokedAccessRequests
} from '../controllers/accessRequest.controller.js';
import { verifyDoctorJWT, verifyPatientJWT, verifyJWT } from '../middlewares/auth.middleware.js';

const accessRequestRouter = Router();

// Doctor routes
accessRequestRouter.route('/doctor/patient-contract/:patientId').get(verifyDoctorJWT, getPatientContractInfo);
accessRequestRouter.route('/doctor/request').post(verifyDoctorJWT, createAccessRequest);
accessRequestRouter.route('/doctor/requests').get(verifyDoctorJWT, getDoctorRequests);
accessRequestRouter.route('/doctor/authorized-records').get(verifyDoctorJWT, getAuthorizedRecords);
accessRequestRouter.route('/doctor/blockchain-authorized-records').get(verifyDoctorJWT, getBlockchainAuthorizedRecords);

// Patient routes
accessRequestRouter.route('/patient/requests').get(verifyPatientJWT, getPatientRequests);
accessRequestRouter.route('/patient/respond').post(verifyPatientJWT, respondToAccessRequest);
accessRequestRouter.route('/patient/authorized-access').get(verifyPatientJWT, getPatientAuthorizedAccess);

// Common routes
accessRequestRouter.route('/details/:requestId').get(verifyJWT, getAccessRequestDetails);
accessRequestRouter.route('/revoke').post(verifyPatientJWT, revokeAccess);

// Access extension routes - Doctor routes
accessRequestRouter.route('/doctor/request-extension').post(verifyDoctorJWT, requestAccessExtension);
accessRequestRouter.route('/doctor/extension-requests').get(verifyDoctorJWT, getDoctorExtensionRequests);

// Access extension routes - Patient routes
accessRequestRouter.route('/patient/extension-requests').get(verifyPatientJWT, getPatientExtensionRequests);
accessRequestRouter.route('/patient/approve-extension').post(verifyPatientJWT, approveAccessExtension);
accessRequestRouter.route('/patient/deny-extension').post(verifyPatientJWT, denyAccessExtension);

// Blockchain extension status
accessRequestRouter.route('/blockchain/extension-status/:contractAddress/:doctorAddress').get(verifyJWT, checkBlockchainExtensionStatus);

// Access monitoring routes - Doctor routes
accessRequestRouter.route('/doctor/check-access-expiry/:contractAddress').get(verifyDoctorJWT, checkAccessExpiry);
accessRequestRouter.route('/doctor/access-status/:contractAddress').get(verifyDoctorJWT, getDoctorAccessStatus);

// Access monitoring routes - Patient routes
accessRequestRouter.route('/patient/access-monitoring').get(verifyPatientJWT, getPatientAccessMonitoring);

// Access monitoring routes - Common
accessRequestRouter.route('/refresh-access-status').post(verifyJWT, refreshAccessStatus);

// Admin/System routes
accessRequestRouter.route('/cleanup-expired').post(cleanupExpiredAccess);

// Access revocation routes
accessRequestRouter.route('/revoke-complete').post(verifyPatientJWT, revokeCompleteAccess);
accessRequestRouter.route('/revoked-requests').get(verifyJWT, getRevokedAccessRequests);

export default accessRequestRouter; 