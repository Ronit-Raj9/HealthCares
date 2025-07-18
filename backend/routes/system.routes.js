import { Router } from 'express';
import {
    getSystemStatus,
    testPatientWorkflow,
    testDoctorWorkflow,
    testBlockchainIntegration,
    getIntegrityReport
} from '../controllers/system.controller.js';
import { verifyPatientJWT, verifyDoctorJWT, verifyJWT } from '../middlewares/auth.middleware.js';

const router = Router();

// Public system status (no auth required)
router.get('/status', getSystemStatus);

// Patient-specific tests
router.get('/test/patient-workflow', verifyPatientJWT, testPatientWorkflow);
router.get('/test/blockchain/:contractAddress', verifyPatientJWT, testBlockchainIntegration);
router.get('/integrity-report', verifyPatientJWT, getIntegrityReport);

// Doctor-specific tests
router.get('/test/doctor-workflow', verifyDoctorJWT, testDoctorWorkflow);

export default router; 