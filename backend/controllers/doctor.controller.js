import mongoose from "mongoose";
import Doctor from '../models/doctor.model.js';
import Patient from '../models/patient.model.js';
import Report from '../models/report.model.js';
import Appointment from '../models/appointment.model.js';
import Notification from '../models/notification.model.js';
import {ApiError} from '../utils/apiError.js';
import {ApiResponse} from '../utils/apiResponse.js';
import {asyncHandler} from '../utils/asyncHandler.js';
import NotificationService from '../services/notificationService.js';



export const registerDoctor = asyncHandler(async (req, res) => {
    // const session = await mongoose.startSession();
    // session.startTransaction();
    try {
    const {
  name, email, specialization, experience,
  phone, qualification, address, fees,
  gender, hospitalName,walletAddress, password,image
} = req.body;

    if (!name || !email || !specialization || !experience || !phone || !qualification || !address || !fees || !gender || !hospitalName|| !walletAddress || !password) {
    throw new ApiError(400, "All fields are required");
}

    const existingDoctor = await Doctor.findOne({email});
    if (existingDoctor) {
        throw new ApiError(400, "Doctor already exists");
    }
    const existingWalletAddress = await Doctor.findOne({walletAddress});
    if (existingWalletAddress) {
        throw new ApiError(400, "Wallet address already registered");
    }
    const doctor = await Doctor.create([{
  walletAddress,
  name,
  email,
  password,
  specialization,
  experience,
  phone,
  qualification,
  address,
  fees,
  gender,
  hospitalName,image
}]);

    if (!doctor) {
        throw new ApiError(500, "Failed to create doctor");
    }
    // await session.commitTransaction();
    // session.endSession();
    const createdDoctor = await Doctor.findById(doctor[0]._id).select("-password -refreshToken");
     console.log("Created Doctor:", createdDoctor);
    res.status(201).json(new ApiResponse(200, createdDoctor,"Doctor registered successfully"));
   
} catch (error) {
        // await session.abortTransaction();
        // session.endSession();
        throw new ApiError(500, "Error registering doctor: " + error.message);
    }
});
export const getAllDoctors = asyncHandler(async (req, res) => {
    try {
        const doctors = await Doctor.find().select("-password -refreshToken");
        
        if (!doctors || doctors.length === 0) {
            return res.status(404).json(
                new ApiResponse(404, [], "No doctors found")
            );
        }

        return res.status(200).json(
            new ApiResponse(200, doctors, "Doctors retrieved successfully")
        );
    } catch (error) {
        console.error("Error in getAllDoctors:", error);
        return res.status(500).json(
            new ApiResponse(500, null, "Error fetching doctors: " + error.message)
        );
    }
});

// export const loginDoctor = asyncHandler(async (req, res) => {
//     try{
//         const {email, password} = req.body;
//         console.log("Login request received for email:", email);
//     if (!email || !password) {
//         throw new ApiError(400, "Email and password are required");
//     }

//     const doctor = await Doctor.findOne({email});
//     console.log("Doctor found:", doctor);
//     if (!doctor || !(await doctor.comparePassword(password))) {
//         throw new ApiError(401, "Invalid email or password");
//     }
//     // console.log("Doctor authenticated successfully:", doctor._id);
//     const {accessToken, refreshToken} = await generateAccessAndRefreshToken(doctor._id);
//     // console.log("Access Token:", accessToken);
//     if(!accessToken || !refreshToken) {
//         throw new ApiError(500, "Failed to generate tokens");
//     }
    
//     doctor.refreshToken = refreshToken;
//     await doctor.save();
//     const doctorData = await Doctor.findById(doctor._id).select("-password");
//     res.status(200).json(new ApiResponse(200, {doctorData, accessToken, refreshToken},"Login successful"));
//     }catch (error) {
//         return new ApiError(500, "Error logging in doctor: " + error.message);
//     }
    
// });
export const loginDoctor = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError(400, "Email and password are required");
  }

  const doctor = await Doctor.findOne({ email }).select("+password");

  if (!doctor) {
    // 404 Not Found
    throw new ApiError(404, "User not found");
  }

  const isMatch = await doctor.comparePassword(password);

  if (!isMatch) {
    // 401 Unauthorized
    throw new ApiError(401, "Invalid email or password");
  }

  const accessToken = await doctor.generateAccessToken();
  const refreshToken = await doctor.generateRefreshToken();

  doctor.refreshToken = refreshToken;
  await doctor.save();

  const doctorData = await Doctor.findById(doctor._id).select("-password");

  res.status(200).json(
    new ApiResponse(
      200,
      { doctorData, accessToken, refreshToken },
      "Login successful"
    )
  );
});


export const getDoctorProfile = asyncHandler(async (req, res) => {
    try{
    const {doctorId} = req.params;
    console.log(doctorId);
    console.log("Fetching doctor profile for ID:", doctorId);
    if (!mongoose.Types.ObjectId.isValid(doctorId)) {
        throw new ApiError(400, "Invalid doctor ID");
    }

    const doctor = await Doctor.findById(doctorId).select("-password -refreshToken");
    if (!doctor) {
        throw new ApiError(404, "Doctor not found");
    }
    res.status(200).json(new ApiResponse("Doctor profile retrieved successfully", doctor));
}catch (error) {
        return res.status(500).json(new ApiError(500, "Error fetching doctor profile: " + error.message));
    }
}
);

export const addReportToPatient = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const {doctorId} = req.params;
        const {patientId, ipfsHash, reportName, reportType} = req.body;
        console.log("Adding report for Doctor ID:", doctorId, "Patient ID:", patientId);
        if (!doctorId || !patientId || !ipfsHash || !reportName || !reportType) {
            throw new ApiError(400, "All fields are required");
        }
        console.log(ipfsHash, reportName, reportType);
        if (!mongoose.Types.ObjectId.isValid(doctorId) || !mongoose.Types.ObjectId.isValid(patientId)) {
            throw new ApiError(400, "Invalid doctor or patient ID");
        }

        const doctor = await Doctor.findById(doctorId);
        if (!doctor) {
            throw new ApiError(404, "Doctor not found");
        }

        const patient = await Patient.findById(patientId);
        if (!patient) {
            throw new ApiError(404, "Patient not found");
        }

        const report = await Report.create([{doctorId: doctor._id, patientId: patient._id, ipfsHash:ipfsHash, reportName: reportName, reportType: reportType }], {session});
        if (!report) {
            throw new ApiError(500, "Failed to create report");
        }

        patient.reports.push(report._id);
         const notification=await Notification.create({
            userId: patient._id,
            message:`you have report from ${doctor.name} for ${reportType}`,
            type:'report',
            
        });
        patient.notifications.push({_id:notification._id, message: notification.message});
        await notification.save({session});
        await patient.save({session});

        await session.commitTransaction();
        session.endSession();

        res.status(201).json(new ApiResponse(201, report,"Report added successfully"));
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        throw new ApiError(500, "Error adding report to patient: " + error.message);
    }
});

// export const getAppointments = asyncHandler(async (req, res) => {
//     try {
//         const {doctorId} = req.params;
//         console.log("Fetching appointments for Doctor ID:", doctorId);
//         if (!mongoose.Types.ObjectId.isValid(doctorId)) {
//             throw new ApiError(400, "Invalid doctor ID");
//         }
//         const doctor = await Doctor.findById(doctorId);
//         if (!doctor) {
//             throw new ApiError(404, "Doctor not found");
//         }
//         const appointments = await doctor.appointments;
//         console.log("Appointments found:", appointments);
//         if (!appointments ) {
//             return res.status(404).json(new ApiError(404, "Error"));
//         }
//         if ( appointments.length === 0) {
//             return res.status(200).json(new ApiError(200, "No appointments found for this doctor"));
//         }
//        const sortedAppointments = appointments.sort((a, b) => new Date(a.appointmentDate) - new Date(b.appointmentDate)); 

//         res.status(200).json(new ApiResponse(200, sortedAppointments,"Appointments retrieved successfully"));
//     } catch (error) {
//         return res.status(500).json(new ApiError(500, "Error fetching appointments: " + error.message));
//     }
// });
export const getAppointments = asyncHandler(async (req, res) => {
  try {
    const { doctorId } = req.params;
    console.log("Fetching appointments for Doctor ID:", doctorId);

    if (!mongoose.Types.ObjectId.isValid(doctorId)) {
      throw new ApiError(400, "Invalid doctor ID");
    }

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      throw new ApiError(404, "Doctor not found");
    }

    // ✅ Fetch actual appointment documents and populate references
    const appointments = await Appointment.find({ doctorId })
      .populate("doctorId", "name")
      .populate("patientId", "name");

    if (!appointments || appointments.length === 0) {
      return res
        .status(200)
        .json(new ApiResponse(200, [], "No appointments found for this doctor"));
    }

    const sortedAppointments = appointments.sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );

    res
      .status(200)
      .json(new ApiResponse(200, sortedAppointments, "Appointments retrieved successfully"));
  } catch (error) {
    return res
      .status(500)
      .json(new ApiError(500, "Error fetching appointments: " + error.message));
  }
});
export const updateAppointmentStatus = asyncHandler(async (req, res) => {
    const {doctorId, appointmentId} = req.params;
    const {status} = req.body;
    
    console.log("Updating appointment status:", { doctorId, appointmentId, status });

    if (!doctorId || !appointmentId || !status) {
        throw new ApiError(400, "Doctor ID, Appointment ID and status are required");
    }

    if (!mongoose.Types.ObjectId.isValid(doctorId) || !mongoose.Types.ObjectId.isValid(appointmentId)) {
        throw new ApiError(400, "Invalid doctor or appointment ID");
    }

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
        throw new ApiError(404, "Doctor not found");
    }

    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
        throw new ApiError(404, "Appointment not found");
    }

    // Convert status to lowercase to match the model's enum values
    const normalizedStatus = status.toLowerCase();
    if (!['pending', 'confirmed', 'cancelled'].includes(normalizedStatus)) {
        throw new ApiError(400, "Invalid status value. Must be one of: pending, confirmed, cancelled");
    }

    appointment.status = normalizedStatus;
    
    const patient = await Patient.findById(appointment.patientId);
    if (!patient) {
        throw new ApiError(404, "Patient not found");
    }

    // Determine notification type based on status
    let notificationType;
    switch (normalizedStatus) {
        case 'confirmed':
            notificationType = 'appointment_confirmation';
            break;
        case 'cancelled':
            notificationType = 'appointment_cancellation';
            break;
        default:
            notificationType = 'appointment';
    }

    // Create appointment notification using the service
    await NotificationService.createAppointmentNotification(
        appointment.patientId,
        doctorId,
        appointment._id,
        appointment.appointmentDate,
        notificationType
    );

    await appointment.save();

    return res.status(200).json(
        new ApiResponse(200, appointment, "Appointment status updated successfully")
    );
});
export const getAllNotificationsForPatient = async (req, res) => {
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

// Search patients by name or email
export const searchPatients = asyncHandler(async (req, res) => {
    const { term } = req.query;
    
    if (!term || term.trim().length < 2) {
        throw new ApiError(400, "Search term must be at least 2 characters");
    }

    try {
        const searchRegex = new RegExp(term.trim(), 'i'); // Case-insensitive search
        
        const patients = await Patient.find({
            $or: [
                { name: { $regex: searchRegex } },
                { email: { $regex: searchRegex } }
            ]
        }).select('name email age gender bloodGroup image').limit(20); // Limit results and exclude sensitive data

        return res.status(200).json(
            new ApiResponse(200, patients, `Found ${patients.length} patients`)
        );
    } catch (error) {
        console.error('Error searching patients:', error);
        throw new ApiError(500, "Error searching patients: " + error.message);
    }
});

// Doctor profile update function
export const updateDoctorProfile = asyncHandler(async (req, res) => {
    const doctorId = req.user._id;
    const { 
        name, 
        email, 
        phone, 
        gender, 
        address, 
        specialization,
        experience,
        qualification,
        fees,
        hospitalName,
        image,
        password 
    } = req.body;

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
        throw new ApiError(404, "Doctor not found");
    }

    // Validate fields
    if (fees && (isNaN(fees) || fees < 0)) {
        throw new ApiError(400, "Fees must be a positive number");
    }
    if (experience && (isNaN(experience) || experience < 0)) {
        throw new ApiError(400, "Experience must be a positive number");
    }

    try {
        // Prepare update data
        const updateData = {};
        if (name) updateData.name = name.trim();
        if (email) updateData.email = email.trim();
        if (phone) updateData.phone = phone;
        if (gender) updateData.gender = gender;
        if (address) updateData.address = address;
        if (specialization) updateData.specialization = specialization;
        if (experience) updateData.experience = experience;
        if (qualification) updateData.qualification = qualification;
        if (fees) updateData.fees = parseInt(fees);
        if (hospitalName) updateData.hospitalName = hospitalName;
        if (image) updateData.image = image;
        if (password) updateData.password = password; // This will be hashed by the model pre-save hook

        // Update database
        const updatedDoctor = await Doctor.findByIdAndUpdate(
            doctorId,
            updateData,
            { new: true, runValidators: true }
        ).select('-password -refreshToken');

        // Create notifications for profile updates
        const updatedFields = Object.keys(updateData).filter(field => 
            field !== 'password' && updateData[field] !== undefined
        );
        
        if (updatedFields.length > 0) {
            // Create notification for profile update
            await NotificationService.createProfileUpdateNotification(
                doctorId,
                'doctor',
                updatedFields.join(', ')
            );
        }
        
        // Create notification for password change if password was updated
        if (password) {
            await NotificationService.createPasswordChangeNotification(
                doctorId,
                'doctor'
            );
        }

        return res.status(200).json(
            new ApiResponse(200, updatedDoctor, "Doctor profile updated successfully")
        );
    } catch (error) {
        console.error('Doctor profile update error:', error);
        throw new ApiError(500, `Failed to update doctor profile: ${error.message}`);
    }
});
