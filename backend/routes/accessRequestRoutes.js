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
accessRequestRouter.route('/patient/authorized-access').get(verifyPatientJWT, getAuthorizedRecords);
accessRequestRouter.route('/revoke/:accessRequestId').delete(verifyPatientJWT, revokeAccess);
accessRequestRouter.route('/revoke-complete/:doctorId').delete(verifyPatientJWT, revokeCompleteAccess);
accessRequestRouter.route('/patient/revoked-requests').get(verifyPatientJWT, getRevokedAccessRequests);

// Shared routes (doctor or patient can access)
accessRequestRouter.route('/details/:requestId').get(verifyJWT, getAccessRequestDetails);

// Admin/system routes
accessRequestRouter.route('/cleanup-expired').post(cleanupExpiredAccess);

// Access extension routes - Doctor routes
accessRequestRouter.route('/doctor/request-extension').post(verifyDoctorJWT, requestAccessExtension);
accessRequestRouter.route('/doctor/extension-requests').get(verifyDoctorJWT, getDoctorExtensionRequests);

// Access extension routes - Patient routes  
accessRequestRouter.route('/patient/approve-extension').post(verifyPatientJWT, approveAccessExtension);
accessRequestRouter.route('/patient/deny-extension').post(verifyPatientJWT, denyAccessExtension);
accessRequestRouter.route('/patient/extension-requests').get(verifyPatientJWT, getPatientExtensionRequests);

// Blockchain extension status
accessRequestRouter.route('/blockchain/extension-status/:contractAddress/:doctorAddress').get(verifyJWT, checkBlockchainExtensionStatus);

export default accessRequestRouter; 