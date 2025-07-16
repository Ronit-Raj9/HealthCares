import mongoose from "mongoose";
import Patient from '../models/patient.model.js';
import Doctor from '../models/doctor.model.js';
import Report from '../models/report.model.js';
import Notification from '../models/notification.model.js';
import Appointment from '../models/appointment.model.js';
import {ApiError} from '../utils/apiError.js';
import {ApiResponse} from '../utils/apiResponse.js';
import {asyncHandler} from '../utils/asyncHandler.js';

const generateAccessAndRefreshTokens = async (_id) => {
    try{
       
        const patient = await Patient.findById(_id);
        if (!patient) {
            throw new ApiError(404, "Patient not found");
        }
        const accessToken = await patient.generateAccessToken();
        const refreshToken = await patient.generateRefreshToken();
        
       
        await patient.save({validateBeforeSave: false});

        return { accessToken, refreshToken };
    }catch (error) {
        console.error("Error generating tokens:");
        throw new ApiError(500, "Error generating tokens: " + error.message);
    }
};

const getPatientProfile = asyncHandler(async (req, res) => {
    console.log("Fetching patient profile for ID:",);
    const { patientId} = req.params;
    console.log("Patient ID:", patientId);
    try{
        const patient = await Patient.findById(patientId).populate('name').populate('email').populate('walletAddress');
       if (!patient) {
        throw new ApiError(404, "Patient not found");
        }
        return  res.status(200).json(new ApiResponse(200, patient, "Patient retrieved successfully"));
    }catch (error) {
        return res.status(400).json(new ApiError(500, "Error retrieving patient: " + error.message));
    }
    
});

const getPatientAppointments = asyncHandler(async (req, res) => {
  const { patientId } = req.params;
  
  try {
    // Verify that the authenticated user is requesting their own appointments
    if (req.user._id.toString() !== patientId) {
      return res.status(403).json(
        new ApiError(403, "You are not authorized to view these appointments")
      );
    }

    const patient = await Patient.findById(patientId);

    if (!patient) {
      return res.status(404).json(
        new ApiError(404, "Patient not found")
      );
    }

    const appointmentsDetails = await Appointment.find({ patientId })
      .populate("doctorId", "name email")
      .populate("patientId", "name email")
      .sort({ createdAt: -1 }); // Sort by newest first

    return res.status(200).json(
      new ApiResponse(
        200, 
        appointmentsDetails, 
        appointmentsDetails.length > 0 
          ? "Appointments retrieved successfully" 
          : "No appointments found"
      )
    );

  } catch (error) {
    console.error("Appointment fetch error:", error);
    return res.status(500).json(
      new ApiError(
        500, 
        "Error retrieving appointments: " + (error.message || "Unknown error")
      )
    );
  }
});


const getPatientReports = asyncHandler(async (req, res) => {
    console.log("Fetching reports for patient ID:", req.params);
    const {patientId} = req.params;
    
  
    try {
        console.log("Patient ID:", patientId);
        const patient = await Patient
            .findOne({_id:patientId});
        if (!patient) {
            console.log("Patient not found with ID:", patientId);
            throw new ApiError(404, "Patient not found");
        }
        console.log("Patient found:", patient);
        const reports = patient.reports;
        if (!reports || reports.length === 0) {
            console.log("No reports found for patient:", patientId);
                 return res.status(300).json(new ApiError(300,{}, "No reports found for this patient"));
                }
                
                console.log("Reports found:", reports);
        return res.status(200).json(new ApiResponse(200, reports, "Reports retrieved successfully"));
    } catch (error) {
        return res.status(400).json(new ApiError(500, "Error retrieving reports: " + error.message));
    }
});

const getPatientReportById = asyncHandler(async (req, res) => {
    const { patientId, reportId } = req.params;
    try {
        const patient = await Patient.findById(patientId)
            .populate('reports', 'reportType reportDate ipfsHash doctorId')
            .populate('doctorId', 'name email walletAddress');
        if (!patient) {
            throw new ApiError(404, "Patient not found");
        }
        const report = patient.reports.find(r => r._id.toString() === reportId);
        if (!report) {
            throw new ApiError(404, "Report not found");
        }
        return res.status(200).json(new ApiResponse(200, report, "Report retrieved successfully"));
    } catch (error) {
        return res.status(400).json(new ApiError(500, "Error retrieving report: " + error.message));
    }
}
);

const registerPatient = asyncHandler(async (req, res) => {
    try {
        const { name, email, password, walletAddress, age, gender, address, phone, bloodgroup,image } = req.body;
        
        console.log("Registration request received:", { 
            name, email, walletAddress, 
            age, gender, address, phone, bloodgroup ,image
        });

        // Basic validation
        if (!name || !email || !password || !walletAddress) {
            throw new ApiError(400, "Name, email, password and wallet address are required");
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw new ApiError(400, "Invalid email format");
        }

        // Check for existing patient (combined query for better performance)
        const existingPatient = await Patient.findOne({ 
            $or: [{ email }, { walletAddress }] 
        });
        
        if (existingPatient) {
            const conflictField = existingPatient.email === email ? "email" : "wallet address";
            throw new ApiError(400, `Patient already exists with this ${conflictField}`);
        }

        // Create new patient (without transaction)
        const patient = await Patient.create({
            walletAddress,
            name,
            email,
            password, // Make sure your Patient model hashes this
            age,
            gender,
            address,
            phone,
            bloodgroup,image
        });

        // Remove sensitive data before sending response
        const patientResponse = patient.toObject();
        delete patientResponse.password;
        delete patientResponse.refreshToken;

        console.log("Patient registered successfully:", patientResponse._id);
        
        return res.status(201).json(
            new ApiResponse(201, patientResponse, "Patient registered successfully")
        );

    } catch (error) {
        console.error("Registration error:", error);
        
        // Handle mongoose validation errors
        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json(
                new ApiError(400, `Validation error: ${errors.join(', ')}`)
            );
        }
        
        return res.status(error.statusCode || 500).json(
            new ApiError(error.statusCode || 500, error.message || "Registration failed")
        );
    }
});
const loginPatient = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    try {
        console.log("Logging in patient with email:", req.body);
        if (!email || !password) {
            throw new ApiError(400, "Email and password are required");
        }
         console.log("Checking patient with email:", email);
         email.trim();

        const trimmedEmail = email ? email.trim() : null;
        if (!trimmedEmail) {
            throw new ApiError(400, "Invalid email provided");
        }
        const patient = await Patient.findOne({ email: trimmedEmail });
        console.log("Patient found:", patient);
        console.log("Found patient:", patient);
        if (!patient) {
            throw new ApiError(404, "Patient not found");
        }

        const isMatch = await patient.matchPassword(password);
        if (!isMatch) {
            throw new ApiError(401, "Invalid credentials");
        }
        console.log("Patient credentials matched successfully");
        const tokens  = await generateAccessAndRefreshTokens(patient._id);
        const { accessToken, refreshToken } = tokens;
          console.log("Generated accessToken and refreshToken for patient:", accessToken, refreshToken);
        const options = {
            // HttpOnly: Indicates if the cookie is accessible only through the HTTP protocol and not through client-side scripts.
            
            // Secure: Indicates if the cookie should only be transmitted over secure HTTPS connections.
            secure: false, // TODO: Change to true in production
            maxAge: 24 * 60 * 60 * 1000, //cookie will expire after 1 day
        };
        // const loggedInPatient = patient.toObject();
        // delete loggedInPatient.password; // Remove password from response
        // delete loggedInPatient.refreshToken; // Remove refreshToken from response
        
        return res
            .status(200)
            .cookie("accessToken", accessToken, options) // Set cookie in client browser
            .cookie("refreshToken", refreshToken, options) // Set cookie in client browser
            .json(
                new ApiResponse(
                  200, 
                  { 
                      patient : patient,
                      accessToken,
                      refreshToken,
                },
                 "Patient logged in successfully"
                )
            );               
        } catch (error) {
        return res.status(500).json(new ApiError(500, "Error logging in: " + error.message));
        }
});

const askAppointment = asyncHandler(async (req, res) => {
    const {patientId} = req.params;
    const {  doctorId, appointmentDate, patientMobile } = req.body;
    try {
        console.log("Request body:", req.body);
        // if (!patientId || !doctorId || !appointmentDate || !patientMobile) {
        //     throw new ApiError(400, "All fields are required");
        // }
        // if (!mongoose.Types.ObjectId.isValid(patientId) || !mongoose.Types.ObjectId.isValid(doctorId)) {
        //     throw new ApiError(400, "Invalid patient or doctor ID");
        // }
        console.log("Creating appointment for patient ID:", patientId, "and doctor ID:", doctorId, "on date:", appointmentDate,patientMobile);
        // Ensure doctorId refers to a Doctor, not a Patient
        // const appointment = await Appointment.create({
        //     patientId: patientId,
        //     doctorId: doctorId, // doctorId should be a valid Doctor _id
        //     appointmentDate: new Date(appointmentDate),
        //     patientMobile: patientMobile,
        //     status: 'Pending'
        // });
        // console.log("Appointment created:", appointment);
        

        let appointment;
try {
  appointment = await Appointment.create({
     patientId,
     doctorId,
    appointmentDate: new Date(appointmentDate),
    pateintMobile: patientMobile, 
    status: 'pending'
  });
  console.log("Step 2: Appointment created:", appointment);
} catch (err) {
  console.error("Error during Appointment.create:", err);
  throw new ApiError(500, "Failed to create appointment");
}

        const doctor = await Doctor.findById(doctorId);
        console.log("Doctor ID:", doctor);
        if (!doctor) {
            throw new ApiError(404, "Doctor not found");
        }
        console.log("Doctor found:", doctor);
        doctor.appointments.push(appointment._id);
        await doctor.save();
        const patient = await Patient.findById(patientId);
        
        patient.appointments.push(appointment._id);

        const notification =await Notification.create({
            userId: doctor._id,
            message:`${patientMobile} have asked for appointment on ${appointmentDate}`,
            type:'appointment'
            
        });
        
        doctor.notifications.push({_id:notification._id, message: notification.message});
        await notification.save();

        await doctor.save();
        await patient.save();
        console.log("Patient ID:", patient);
        console.log("Appointment created:", appointment);
        return res.status(201).json(new ApiResponse(201, appointment, "Appointment requested successfully"));
    } catch (error) {
        return res.status(500).json(new ApiError(500, "Error requesting appointment: " + error.message));
    }
}
);

const deleteAppointment = asyncHandler(async (req, res) => {
    const { appointmentId, patientId } = req.params;
    try {
        console.log("Deleting appointment with ID:", appointmentId);
        if (!appointmentId) {
            throw new ApiError(400, "Appointment ID is required");
        }
        const appointment = await Appointment.findById(appointmentId);
        if (!appointment) {
            throw new ApiError(404, "Appointment not found");
        }
        const patient = await Patient.findById(patientId);
        if (!patient) {
            throw new ApiError(404, "Patient not found");
        }
        if(patient._id.toString() !== appointment.patientId.toString()) {
            throw new ApiError(403, "You are not authorized to delete this appointment");
        }
        const doctor =await doctor.findById(appointment.doctorId);
        if (!doctor) {
            throw new ApiError(404, "Doctor not found");
        }
        doctor.appointments = doctor.appointments.filter(app => app.toString() !== appointmentId);
        await doctor.save();
        patient.appointments = patient.appointments.filter(app => app.toString() !== appointmentId);
        await patient.save();
         const notification = await Notification.create({
            userId: patient._id,
            message: `Your appointment with ${patient.name} on ${appointment.appointmentDate} has been cancelled.`,
            type: 'appointment'
        });
        doctor.notifications.push({ _id: notification._id, message: notification.message });
        await notification.save();
        await doctor.save();
        await Appointment.findByIdAndDelete(appointmentId);
        console.log("Appointment deleted:", appointment);
        console.log("Appointment deleted successfully:", appointment);
        return res.status(200).json(new ApiResponse(200, {}, "Appointment deleted successfully"));
    } catch (error) {
        return res.status(500).json(new ApiError(500, "Error deleting appointment: " + error.message));
    }
}
);
 const getAllNotificationsForPatient = async (req, res) => {
  try {
    const { patientId } = req.params;

    if (!patientId) {
      throw new ApiError(400, "Patient ID is required");
    }

    const notifications = await Notification.find({ patientId }).sort({
      updatedAt: -1,
    });

    return res
      .status(200)
      .json(new ApiResponse(200, notifications, "Notifications retrieved"));
  } catch (error) {
    return res.status(error.statusCode || 500).json(
      new ApiError(
        error.statusCode || 500,
        error.message || "Error fetching notifications"
      )
    );
  }
};

export {
    registerPatient,
    loginPatient,
    getPatientProfile,
    getPatientReports,
    getPatientReportById,
    getPatientAppointments,
    askAppointment,
    deleteAppointment,
    getAllNotificationsForPatient,
};

