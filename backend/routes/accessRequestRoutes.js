import Router from 'express';
import {
    createAccessRequest,
    getDoctorRequests,
    getPatientRequests,
    respondToAccessRequest,
    getAuthorizedRecords,
    revokeAccess,
    cleanupExpiredAccess
} from '../controllers/accessRequest.controller.js';
import { verifyDoctorJWT, verifyPatientJWT } from '../middlewares/auth.middleware.js';

const accessRequestRouter = Router();

// Doctor routes
accessRequestRouter.route('/doctor/request').post(verifyDoctorJWT, createAccessRequest);
accessRequestRouter.route('/doctor/requests').get(verifyDoctorJWT, getDoctorRequests);
accessRequestRouter.route('/doctor/authorized-records').get(verifyDoctorJWT, getAuthorizedRecords);

// Patient routes
accessRequestRouter.route('/patient/requests').get(verifyPatientJWT, getPatientRequests);
accessRequestRouter.route('/patient/respond').post(verifyPatientJWT, respondToAccessRequest);
accessRequestRouter.route('/patient/revoke').post(verifyPatientJWT, revokeAccess);

// Admin/system routes
accessRequestRouter.route('/cleanup-expired').post(cleanupExpiredAccess);

export default accessRequestRouter; 