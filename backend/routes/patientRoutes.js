import Router from "express";
import {
    registerPatient,
    loginPatient,
    getPatientProfile,
    getPatientReports,
    getPatientReportById,
    getPatientAppointments,
    askAppointment,
    deleteAppointment,
    retryContractDeployment,
    getContractStatus,
    // Blockchain profile update functions
    updatePatientName,
    updatePatientAge,
    updatePatientGender,
    updatePatientHeight,
    updatePatientWeight,
    updatePatientBloodGroup,
    getBlockchainPatientDetails,
    syncProfileFromBlockchain,
    // Blockchain utility functions
    getBlockchainPatientId,
    checkDoctorAccessExpiry,
    verifyContractIntegrity
} from "../controllers/patient.controller.js";

import {verifyPatientJWT} from "../middlewares/auth.middleware.js";

const patientRouter = Router();

patientRouter.route("/register").post(registerPatient);
patientRouter.route("/login").post(loginPatient);
patientRouter.route("/profile/:patientId").get(verifyPatientJWT, getPatientProfile);
patientRouter.route("/reports").get(verifyPatientJWT, getPatientReports);
patientRouter.route("/reports/:reportId").get(verifyPatientJWT, getPatientReportById);

patientRouter.route("/:patientId/appointments").post(verifyPatientJWT, askAppointment);
patientRouter.route("/appointments").get(verifyPatientJWT, getPatientAppointments);
patientRouter.route("/appointments/:appointmentId").delete(verifyPatientJWT, deleteAppointment);

// Contract deployment routes
patientRouter.route("/contract/status").get(verifyPatientJWT, getContractStatus);
patientRouter.route("/contract/deploy").post(verifyPatientJWT, retryContractDeployment);

// Blockchain profile update routes
patientRouter.route("/blockchain/update-name").put(verifyPatientJWT, updatePatientName);
patientRouter.route("/blockchain/update-age").put(verifyPatientJWT, updatePatientAge);
patientRouter.route("/blockchain/update-gender").put(verifyPatientJWT, updatePatientGender);
patientRouter.route("/blockchain/update-height").put(verifyPatientJWT, updatePatientHeight);
patientRouter.route("/blockchain/update-weight").put(verifyPatientJWT, updatePatientWeight);
patientRouter.route("/blockchain/update-blood-group").put(verifyPatientJWT, updatePatientBloodGroup);

// Blockchain profile verification routes
patientRouter.route("/blockchain/details").get(verifyPatientJWT, getBlockchainPatientDetails);
patientRouter.route("/blockchain/sync").post(verifyPatientJWT, syncProfileFromBlockchain);

// Blockchain utility routes
patientRouter.route("/blockchain/patient-id").get(verifyPatientJWT, getBlockchainPatientId);
patientRouter.route("/blockchain/doctor-access-status").get(verifyPatientJWT, checkDoctorAccessExpiry);
patientRouter.route("/blockchain/verify-contract").get(verifyPatientJWT, verifyContractIntegrity);

export default patientRouter;