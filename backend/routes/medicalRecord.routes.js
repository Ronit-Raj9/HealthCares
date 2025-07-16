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
import { verifyPatientJWT } from '../middlewares/auth.middleware.js';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Protected routes - only authenticated patients can access these routes
router.use(verifyPatientJWT);

// Medical record routes
router.post('/upload', upload.single('file'), uploadMedicalRecord);
router.get('/patient-records', getPatientRecords);
router.post('/grant-access', grantAccess);
router.post('/revoke-access', revokeAccess);
router.get('/authorized-records', getAuthorizedRecords);

// Add this route for viewing/downloading a record from IPFS
router.get('/view/:ipfsHash', viewMedicalRecord);

// Add this route for fetching a single record by its MongoDB _id
router.get('/:id', getRecordById);

export default router; 