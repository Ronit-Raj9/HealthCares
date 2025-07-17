import { Router } from 'express';
import {
    uploadMedicalRecord,
    getPatientRecords,
    grantAccess,
    revokeAccess,
    getAuthorizedRecords,
    viewMedicalRecord,
    getRecordById
} from '../controllers/medicalRecord.controller.js';
import { verifyPatientJWT, verifyPatientOrDoctorJWT } from '../middlewares/auth.middleware.js';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Patient-only routes
router.post('/upload', verifyPatientJWT, upload.single('file'), uploadMedicalRecord);
router.get('/patient-records', verifyPatientJWT, getPatientRecords);
router.post('/grant-access', verifyPatientJWT, grantAccess);
router.post('/revoke-access', verifyPatientJWT, revokeAccess);
router.get('/authorized-records', verifyPatientJWT, getAuthorizedRecords);

// Routes accessible by both patients and doctors
router.get('/view/:ipfsHash', verifyPatientOrDoctorJWT, viewMedicalRecord);
router.get('/:id', verifyPatientOrDoctorJWT, getRecordById);

export default router; 