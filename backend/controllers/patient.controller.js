import Patient from '../models/patient.model.js';
import Doctor from '../models/doctor.model.js';
import Report from '../models/report.model.js';
import Notification from '../models/notification.model.js';
import Appointment from '../models/appointment.model.js';
import {ApiError} from '../utils/apiError.js';
import {ApiResponse} from '../utils/apiResponse.js';
import {asyncHandler} from '../utils/asyncHandler.js';
import contractService from "../services/contractService.js";
import { trackPatientTransaction } from '../utils/transactionTracker.js';

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
  try {
    // Get patient ID from authenticated user (req.user is set by JWT middleware)
    const patientId = req.user._id;
    
    console.log("Fetching appointments for patient ID:", patientId);

    const patient = await Patient.findById(patientId);

    if (!patient) {
      return res.status(404).json(
        new ApiError(404, "Patient not found")
      );
    }

    const appointmentsDetails = await Appointment.find({ patientId })
      .populate("doctorId", "name email specialization")
      .populate("patientId", "name email")
      .sort({ createdAt: -1 }); // Sort by newest first

    console.log("Found appointments:", appointmentsDetails.length);

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
    const { name, email, password, age, gender, address, phone, bloodgroup, walletAddress, image } = req.body;

    if (!name || !email || !password || !walletAddress) {
        throw new ApiError(400, "Name, email, password, and wallet address are required");
    }

    // Check if user already exists
    const existedPatient = await Patient.findOne({
        $or: [{ email }, { walletAddress }]
    });

    if (existedPatient) {
        throw new ApiError(409, "Patient already exists with this email or wallet address");
    }

    // Create patient
    const patient = await Patient.create({
        name,
        email,
        password,
        age,
        gender,
        address,
        phone,
        bloodGroup: bloodgroup,
        walletAddress,
        image,
        contractDeploymentStatus: 'pending'
    });

    const createdPatient = await Patient.findById(patient._id).select("-password -refreshToken");

    if (!createdPatient) {
        throw new ApiError(500, "Something went wrong while registering the patient");
    }

    // Contract will be deployed on first login
        return res.status(201).json(
            new ApiResponse(201, {
            patient: createdPatient
        }, "Patient registered successfully. Contract will be deployed on first login.")
        );
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

        // Deploy contract on first login if not already deployed
        if (!patient.contractAddress && patient.contractDeploymentStatus !== 'deployed') {
            try {
                console.log('First login detected, deploying contract for patient:', patient._id);
                
                // Update status to pending
                await Patient.findByIdAndUpdate(patient._id, {
                    contractDeploymentStatus: 'pending'
                });

                const deploymentResult = await contractService.deployPatientContract(patient);
                
                // Update patient with contract details
                await Patient.findByIdAndUpdate(patient._id, {
                    contractAddress: deploymentResult.contractAddress,
                    contractDeploymentTx: deploymentResult.transactionHash,
                    contractDeploymentBlockNumber: deploymentResult.blockNumber,
                    contractDeploymentGasUsed: deploymentResult.gasUsed,
                    contractDeploymentStatus: 'deployed'
                });

                console.log('Contract deployed on first login:', deploymentResult.contractAddress);
            } catch (contractError) {
                console.error('Contract deployment failed on first login:', contractError);
                await Patient.findByIdAndUpdate(patient._id, {
                    contractDeploymentStatus: 'failed'
                });
            }
        }
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
    patientMobile: patientMobile, 
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

// Retry contract deployment for patients
const retryContractDeployment = asyncHandler(async (req, res) => {
    const patientId = req.user._id;
    
    const patient = await Patient.findById(patientId);
    if (!patient) {
        throw new ApiError(404, "Patient not found");
    }

    // Check if contract is already deployed
    if (patient.contractDeploymentStatus === 'deployed' && patient.contractAddress) {
        return res.status(200).json(
            new ApiResponse(200, {
                contractAddress: patient.contractAddress,
                transactionHash: patient.contractDeploymentTx
            }, "Contract already deployed for this patient")
        );
    }

    // Check if deployment is already in progress
    if (patient.contractDeploymentStatus === 'pending') {
        return res.status(400).json(
            new ApiError(400, "Contract deployment is already in progress")
        );
    }

    try {
        // Update status to pending
        await Patient.findByIdAndUpdate(patientId, {
            contractDeploymentStatus: 'pending'
        });

        console.log('Retrying contract deployment for patient:', patientId);
        
        const deploymentResult = await contractService.deployPatientContract(patient);
        
        // Update patient with contract details
        await Patient.findByIdAndUpdate(patientId, {
            contractAddress: deploymentResult.contractAddress,
            contractDeploymentTx: deploymentResult.transactionHash,
            contractDeploymentStatus: 'deployed'
        });

        console.log('Contract deployment retry successful for patient:', {
            patientId: patientId,
            contractAddress: deploymentResult.contractAddress,
            transactionHash: deploymentResult.transactionHash
        });

        return res.status(200).json(
            new ApiResponse(200, {
                contractAddress: deploymentResult.contractAddress,
                transactionHash: deploymentResult.transactionHash
            }, "Contract deployed successfully")
        );

    } catch (contractError) {
        console.error('Contract deployment retry failed for patient:', patientId, contractError);
        
        // Update patient status to failed
        await Patient.findByIdAndUpdate(patientId, {
            contractDeploymentStatus: 'failed'
        });

        throw new ApiError(500, `Contract deployment failed: ${contractError.message}`);
    }
});

// ========================================
// UNIFIED PROFILE UPDATE FUNCTION
// ========================================

const updatePatientProfile = asyncHandler(async (req, res) => {
    const patientId = req.user._id;
    const { 
        name, 
        email, 
        phone, 
        gender, 
        address, 
        age, 
        height, 
        weight, 
        bloodGroup,
        image,
        password 
    } = req.body;

    const patient = await Patient.findById(patientId);
    if (!patient) {
        throw new ApiError(404, "Patient not found");
    }

    // Validate blockchain-specific fields if they are provided
    if (age && (isNaN(age) || age < 0 || age > 150)) {
        throw new ApiError(400, "Age must be between 0 and 150");
    }
    if (height && (isNaN(height) || height < 50 || height > 300)) {
        throw new ApiError(400, "Height must be between 50-300 cm");
    }
    if (weight && (isNaN(weight) || weight < 10 || weight > 500)) {
        throw new ApiError(400, "Weight must be between 10-500 kg");
    }
    if (gender && !['Male', 'Female', 'Other', 'male', 'female', 'other', 'neither'].includes(gender)) {
        throw new ApiError(400, "Invalid gender value");
    }
    if (bloodGroup && !['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].includes(bloodGroup)) {
        throw new ApiError(400, "Invalid blood group");
    }

    try {
        // Compare with existing values to identify what actually changed
        const changedFields = {};
        
        console.log('Current patient data from database:', {
            name: patient.name,
            age: patient.age,
            gender: patient.gender,
            height: patient.height,
            weight: patient.weight,
            bloodGroup: patient.bloodGroup
        });
        
        console.log('Incoming update data:', {
            name: name,
            age: age,
            gender: gender,
            height: height,
            weight: weight,
            bloodGroup: bloodGroup
        });
        
        // Check blockchain-relevant fields for changes
        if (name && name.trim() !== patient.name) {
            changedFields.name = name.trim();
        }
        if (age && parseInt(age) !== patient.age) {
            changedFields.age = parseInt(age);
        }
        if (gender) {
            // Normalize both values for comparison
            const normalizedIncomingGender = gender.toLowerCase() === 'male' ? 'Male' : 
                                           gender.toLowerCase() === 'female' ? 'Female' : 
                                           gender.toLowerCase() === 'neither' ? 'Other' : 'Other';
            const normalizedCurrentGender = patient.gender ? 
                                          (patient.gender.toLowerCase() === 'male' ? 'Male' : 
                                           patient.gender.toLowerCase() === 'female' ? 'Female' : 'Other') : 'Other';
            
            console.log('Gender comparison:', {
                incoming: gender,
                normalizedIncoming: normalizedIncomingGender,
                current: patient.gender,
                normalizedCurrent: normalizedCurrentGender,
                areEqual: normalizedIncomingGender === normalizedCurrentGender
            });
            
            if (normalizedIncomingGender !== normalizedCurrentGender) {
                changedFields.gender = normalizedIncomingGender;
            }
        }
        if (height && parseInt(height) !== patient.height) {
            changedFields.height = parseInt(height);
        }
        if (weight && parseInt(weight) !== patient.weight) {
            console.log('Weight comparison:', {
                incoming: weight,
                incomingParsed: parseInt(weight),
                current: patient.weight,
                areEqual: parseInt(weight) === patient.weight
            });
            changedFields.weight = parseInt(weight);
        }
        if (bloodGroup && bloodGroup !== patient.bloodGroup) {
            changedFields.bloodGroup = bloodGroup;
        }

        console.log('Fields that changed for blockchain update:', Object.keys(changedFields));

        // Update database first
        const updateData = {};
        if (name) updateData.name = name.trim();
        if (email) updateData.email = email.trim();
        if (phone) updateData.phone = phone;
        if (gender) updateData.gender = gender;
        if (address) updateData.address = address;
        if (age) updateData.age = parseInt(age);
        if (height) updateData.height = parseInt(height);
        if (weight) updateData.weight = parseInt(weight);
        if (bloodGroup) updateData.bloodGroup = bloodGroup;
        if (image) updateData.image = image;
        if (password) updateData.password = password; // This will be hashed by the model pre-save hook

        // Update database
        const updatedPatient = await Patient.findByIdAndUpdate(
            patientId,
            updateData,
            { new: true, runValidators: true }
        ).select('-password -refreshToken');

        let blockchainResult = null;
        let blockchainError = null;

        // Update blockchain ONLY for fields that actually changed
        const hasBlockchainChanges = Object.keys(changedFields).length > 0;

        if (hasBlockchainChanges && patient.contractAddress && patient.contractDeploymentStatus === 'deployed') {
            try {
                console.log('Updating only changed fields on blockchain:', Object.keys(changedFields));
                
                // Update blockchain with only the changed fields
                blockchainResult = await contractService.updatePatientProfile(
                    patient.contractAddress,
                    changedFields // Only pass the fields that actually changed
                );

                // Update blockchain sync status
                await Patient.findByIdAndUpdate(patientId, {
                    lastBlockchainProfileUpdate: new Date(),
                    blockchainProfileSynced: true
                });

                // Track blockchain transaction
                if (blockchainResult.transactionHash) {
                    await trackPatientTransaction(patientId, {
                        transactionHash: blockchainResult.transactionHash,
                        contractFunction: 'updatePatientProfile',
                        blockNumber: blockchainResult.blockNumber,
                        gasUsed: blockchainResult.gasUsed,
                        status: 'confirmed',
                        relatedData: changedFields
                    });
                }

                console.log('Blockchain profile updated successfully:', blockchainResult.transactionHash);
            } catch (error) {
                console.error('Blockchain update failed:', error);
                blockchainError = error.message;
                
                // Mark blockchain as out of sync
                await Patient.findByIdAndUpdate(patientId, {
                    blockchainProfileSynced: false
                });
            }
        }

        // Prepare response
        const response = {
            patient: updatedPatient,
            databaseUpdated: true,
            blockchainUpdated: blockchainResult ? true : false,
            blockchainFieldsUpdated: hasBlockchainChanges ? Object.keys(changedFields) : [],
            blockchainTransaction: blockchainResult ? {
                transactionHash: blockchainResult.transactionHash,
                blockNumber: blockchainResult.blockNumber,
                gasUsed: blockchainResult.gasUsed,
                fieldsUpdated: blockchainResult.fieldsUpdated
            } : null,
            blockchainError: blockchainError
        };

        let message = "Profile updated successfully";
        if (blockchainResult) {
            message += ` (including blockchain: ${Object.keys(changedFields).join(', ')})`;
        } else if (blockchainError) {
            message += " (database only - blockchain update failed)";
        } else if (!hasBlockchainChanges) {
            message += " (database only - no blockchain fields changed)";
        } else if (!patient.contractAddress) {
            message += " (database only - contract not deployed)";
        }

        return res.status(200).json(
            new ApiResponse(200, response, message)
        );

    } catch (error) {
        console.error('Profile update error:', error);
        throw new ApiError(500, `Failed to update profile: ${error.message}`);
    }
});

// ========================================
// SIMPLIFIED CONTRACT STATUS FUNCTION
// ========================================

const getContractStatus = asyncHandler(async (req, res) => {
    const patientId = req.user._id;
    
    const patient = await Patient.findById(patientId).select('contractAddress contractDeploymentTx contractDeploymentStatus contractDeploymentBlockNumber contractDeploymentGasUsed blockchainProfileSynced lastBlockchainProfileUpdate');
    if (!patient) {
        throw new ApiError(404, "Patient not found");
    }

    return res.status(200).json(
        new ApiResponse(200, {
            contractAddress: patient.contractAddress,
            contractDeploymentTx: patient.contractDeploymentTx,
            contractDeploymentStatus: patient.contractDeploymentStatus,
            contractDeploymentBlockNumber: patient.contractDeploymentBlockNumber,
            contractDeploymentGasUsed: patient.contractDeploymentGasUsed,
            hasContract: !!(patient.contractAddress && patient.contractDeploymentStatus === 'deployed'),
            blockchainProfileSynced: patient.blockchainProfileSynced,
            lastBlockchainProfileUpdate: patient.lastBlockchainProfileUpdate
        }, "Contract status retrieved successfully")
    );
});

// Verify patient account (can be called after email verification, etc.)
const verifyPatientAccount = asyncHandler(async (req, res) => {
    const patientId = req.user._id;
    
    const patient = await Patient.findByIdAndUpdate(
        patientId, 
        { isVerified: true },
        { new: true }
    ).select('-password -refreshToken');
    
    if (!patient) {
        throw new ApiError(404, "Patient not found");
    }

    return res.status(200).json(
        new ApiResponse(200, patient, "Patient account verified successfully")
    );
});

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
    retryContractDeployment,
    getContractStatus,
    verifyPatientAccount,
    // Unified profile update function
    updatePatientProfile
};

