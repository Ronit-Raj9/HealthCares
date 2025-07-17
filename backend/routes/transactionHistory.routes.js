import { Router } from 'express';
import {
    getPatientTransactionHistory,
    getRecordTransactionHistory,
    getPatientContractStats,
    getTransactionsByFunction
} from '../controllers/transactionHistory.controller.js';
import { verifyPatientJWT, verifyDoctorJWT } from '../middlewares/auth.middleware.js';

const router = Router();

// Patient routes - for viewing their own transaction history
router.get('/patient/history', verifyPatientJWT, getPatientTransactionHistory);
router.get('/patient/stats', verifyPatientJWT, getPatientContractStats);
router.get('/patient/function/:contractFunction', verifyPatientJWT, getTransactionsByFunction);

// Record-specific transaction history (accessible by patient owner or authorized doctors)
router.get('/record/:recordId/history', verifyPatientJWT, getRecordTransactionHistory);
router.get('/doctor/record/:recordId/history', verifyDoctorJWT, getRecordTransactionHistory);

export default router; 