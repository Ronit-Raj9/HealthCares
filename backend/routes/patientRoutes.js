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
    getContractStatus
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

export default patientRouter;