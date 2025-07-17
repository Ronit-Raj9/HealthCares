import { Router } from 'express';
import {
    generateKeyPair,
    getPublicKey,
    decryptPatientKey,
    encryptPatientKey,
    regenerateKeyPair
} from '../controllers/keyManagement.controller.js';
import { verifyDoctorJWT, verifyPatientJWT } from '../middlewares/auth.middleware.js';

const router = Router();

// Doctor-specific routes (require doctor authentication)
router.post('/doctor/generate-keypair', verifyDoctorJWT, generateKeyPair);
router.post('/doctor/decrypt-key', verifyDoctorJWT, decryptPatientKey);
router.post('/doctor/regenerate-keypair', verifyDoctorJWT, regenerateKeyPair);

// Patient-specific routes (require patient authentication)
router.post('/patient/encrypt-key', verifyPatientJWT, encryptPatientKey);

// Public routes (accessible by both patients and doctors)
router.get('/public-key/:doctorId', getPublicKey);

export default router; 