import { Router } from 'express';
import {
    getAllPatientIds,
    getPatientCount,
    getContractByPatientId,
    getPatientIdByAddress,
    getSystemStatistics,
    getRecentActivity,
    getConsistencyReport
} from '../controllers/admin.controller.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';

const router = Router();

// All admin routes require authentication
router.use(verifyJWT);

// Factory contract utility routes
router.get('/factory/all-patient-ids', getAllPatientIds);
router.get('/factory/patient-count', getPatientCount);
router.get('/factory/contract/:patientId', getContractByPatientId);
router.get('/factory/patient-by-address/:walletAddress', getPatientIdByAddress);

// System statistics and monitoring routes
router.get('/statistics', getSystemStatistics);
router.get('/recent-activity', getRecentActivity);
router.get('/consistency-report', getConsistencyReport);

export default router; 