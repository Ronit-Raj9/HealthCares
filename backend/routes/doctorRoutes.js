import Router from 'express';
import {
    registerDoctor,
    loginDoctor,
    getDoctorProfile,
    addReportToPatient,
    getAppointments,
    updateAppointmentStatus,
    getAllDoctors,
    getAllNotificationsForPatient,
    searchPatients
} from '../controllers/doctor.controller.js';
import  Doctor  from '../models/doctor.model.js';
import { verifyDoctorJWT } from '../middlewares/auth.middleware.js';
const doctorRouter = Router();

doctorRouter.route('/register').post(registerDoctor);
doctorRouter.route('/view').get(getAllDoctors);
doctorRouter.route('/login').post(loginDoctor);
doctorRouter.route('/:doctorId/addReport').post(verifyDoctorJWT, addReportToPatient); 
doctorRouter.route('/profile/:doctorId').get( getDoctorProfile);
// doctorRouter.route('/:doctorId/appointments').get(verifyDoctorJWT, getAppointments);
doctorRouter.route('/:doctorId/appointments').get( getAppointments);
doctorRouter.route('/:doctorId/appointments/:appointmentId').put( updateAppointmentStatus);
doctorRouter.route('/:doctorId/notifications').get( verifyDoctorJWT,getAllNotificationsForPatient);

// Patient search route for doctors
doctorRouter.route('/search-patients').get(verifyDoctorJWT, searchPatients);

export default doctorRouter;