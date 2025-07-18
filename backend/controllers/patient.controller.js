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

// Get contract deployment status for a patient
const getContractStatus = asyncHandler(async (req, res) => {
    const patientId = req.user._id;
    
    const patient = await Patient.findById(patientId).select('contractAddress contractDeploymentTx contractDeploymentStatus contractDeploymentBlockNumber contractDeploymentGasUsed');
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
            hasContract: !!(patient.contractAddress && patient.contractDeploymentStatus === 'deployed')
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

// ========================================
// BLOCKCHAIN PROFILE UPDATE FUNCTIONS
// ========================================

// Update patient name on blockchain
const updatePatientName = asyncHandler(async (req, res) => {
    const { name } = req.body;
    const patientId = req.user._id;

    if (!name || !name.trim()) {
        throw new ApiError(400, "Name is required");
    }

    const patient = await Patient.findById(patientId);
    if (!patient) {
        throw new ApiError(404, "Patient not found");
    }

    if (!patient.contractAddress || patient.contractDeploymentStatus !== 'deployed') {
        throw new ApiError(400, "Patient contract not deployed. Cannot update blockchain profile.");
    }

    try {
        // Update on blockchain
        const transactionResult = await contractService.updatePatientName(
            patient.contractAddress,
            name.trim()
        );

        // Update database
        patient.name = name.trim();
        patient.lastBlockchainProfileUpdate = new Date();
        patient.blockchainProfileSynced = true;
        await patient.save();

        // Track transaction
        await trackPatientTransaction(patientId, {
            transactionHash: transactionResult.transactionHash,
            contractFunction: 'updatePatientName',
            blockNumber: transactionResult.blockNumber,
            gasUsed: transactionResult.gasUsed,
            status: 'confirmed',
            relatedData: { newName: name.trim() }
        });

        return res.status(200).json(
            new ApiResponse(200, {
                transactionHash: transactionResult.transactionHash,
                blockNumber: transactionResult.blockNumber,
                gasUsed: transactionResult.gasUsed,
                newName: name.trim()
            }, "Patient name updated on blockchain successfully")
        );
    } catch (error) {
        console.error('Blockchain name update failed:', error);
        throw new ApiError(500, `Failed to update name on blockchain: ${error.message}`);
    }
});

// Update patient age on blockchain
const updatePatientAge = asyncHandler(async (req, res) => {
    const { age } = req.body;
    const patientId = req.user._id;

    if (!age || age < 0 || age > 150) {
        throw new ApiError(400, "Valid age (0-150) is required");
    }

    const patient = await Patient.findById(patientId);
    if (!patient) {
        throw new ApiError(404, "Patient not found");
    }

    if (!patient.contractAddress || patient.contractDeploymentStatus !== 'deployed') {
        throw new ApiError(400, "Patient contract not deployed. Cannot update blockchain profile.");
    }

    try {
        // Update on blockchain
        const transactionResult = await contractService.updatePatientAge(
            patient.contractAddress,
            parseInt(age)
        );

        // Update database
        patient.age = parseInt(age);
        patient.lastBlockchainProfileUpdate = new Date();
        patient.blockchainProfileSynced = true;
        await patient.save();

        // Track transaction
        await trackPatientTransaction(patientId, {
            transactionHash: transactionResult.transactionHash,
            contractFunction: 'updatePatientAge',
            blockNumber: transactionResult.blockNumber,
            gasUsed: transactionResult.gasUsed,
            status: 'confirmed',
            relatedData: { newAge: parseInt(age) }
        });

        return res.status(200).json(
            new ApiResponse(200, {
                transactionHash: transactionResult.transactionHash,
                blockNumber: transactionResult.blockNumber,
                gasUsed: transactionResult.gasUsed,
                newAge: parseInt(age)
            }, "Patient age updated on blockchain successfully")
        );
    } catch (error) {
        console.error('Blockchain age update failed:', error);
        throw new ApiError(500, `Failed to update age on blockchain: ${error.message}`);
    }
});

// Update patient gender on blockchain
const updatePatientGender = asyncHandler(async (req, res) => {
    const { gender } = req.body;
    const patientId = req.user._id;

    if (!gender || !['Male', 'Female', 'Other'].includes(gender)) {
        throw new ApiError(400, "Valid gender (Male, Female, Other) is required");
    }

    const patient = await Patient.findById(patientId);
    if (!patient) {
        throw new ApiError(404, "Patient not found");
    }

    if (!patient.contractAddress || patient.contractDeploymentStatus !== 'deployed') {
        throw new ApiError(400, "Patient contract not deployed. Cannot update blockchain profile.");
    }

    try {
        // Update on blockchain
        const transactionResult = await contractService.updatePatientGender(
            patient.contractAddress,
            gender
        );

        // Update database
        patient.gender = gender;
        patient.lastBlockchainProfileUpdate = new Date();
        patient.blockchainProfileSynced = true;
        await patient.save();

        // Track transaction
        await trackPatientTransaction(patientId, {
            transactionHash: transactionResult.transactionHash,
            contractFunction: 'updatePatientGender',
            blockNumber: transactionResult.blockNumber,
            gasUsed: transactionResult.gasUsed,
            status: 'confirmed',
            relatedData: { newGender: gender }
        });

        return res.status(200).json(
            new ApiResponse(200, {
                transactionHash: transactionResult.transactionHash,
                blockNumber: transactionResult.blockNumber,
                gasUsed: transactionResult.gasUsed,
                newGender: gender
            }, "Patient gender updated on blockchain successfully")
        );
    } catch (error) {
        console.error('Blockchain gender update failed:', error);
        throw new ApiError(500, `Failed to update gender on blockchain: ${error.message}`);
    }
});

// Update patient height on blockchain
const updatePatientHeight = asyncHandler(async (req, res) => {
    const { height } = req.body;
    const patientId = req.user._id;

    if (!height || height < 50 || height > 300) {
        throw new ApiError(400, "Valid height (50-300 cm) is required");
    }

    const patient = await Patient.findById(patientId);
    if (!patient) {
        throw new ApiError(404, "Patient not found");
    }

    if (!patient.contractAddress || patient.contractDeploymentStatus !== 'deployed') {
        throw new ApiError(400, "Patient contract not deployed. Cannot update blockchain profile.");
    }

    try {
        // Update on blockchain
        const transactionResult = await contractService.updatePatientHeight(
            patient.contractAddress,
            parseInt(height)
        );

        // Update database
        patient.height = parseInt(height);
        patient.lastBlockchainProfileUpdate = new Date();
        patient.blockchainProfileSynced = true;
        await patient.save();

        // Track transaction
        await trackPatientTransaction(patientId, {
            transactionHash: transactionResult.transactionHash,
            contractFunction: 'updatePatientHeight',
            blockNumber: transactionResult.blockNumber,
            gasUsed: transactionResult.gasUsed,
            status: 'confirmed',
            relatedData: { newHeight: parseInt(height) }
        });

        return res.status(200).json(
            new ApiResponse(200, {
                transactionHash: transactionResult.transactionHash,
                blockNumber: transactionResult.blockNumber,
                gasUsed: transactionResult.gasUsed,
                newHeight: parseInt(height)
            }, "Patient height updated on blockchain successfully")
        );
    } catch (error) {
        console.error('Blockchain height update failed:', error);
        throw new ApiError(500, `Failed to update height on blockchain: ${error.message}`);
    }
});

// Update patient weight on blockchain
const updatePatientWeight = asyncHandler(async (req, res) => {
    const { weight } = req.body;
    const patientId = req.user._id;

    if (!weight || weight < 10 || weight > 500) {
        throw new ApiError(400, "Valid weight (10-500 kg) is required");
    }

    const patient = await Patient.findById(patientId);
    if (!patient) {
        throw new ApiError(404, "Patient not found");
    }

    if (!patient.contractAddress || patient.contractDeploymentStatus !== 'deployed') {
        throw new ApiError(400, "Patient contract not deployed. Cannot update blockchain profile.");
    }

    try {
        // Update on blockchain
        const transactionResult = await contractService.updatePatientWeight(
            patient.contractAddress,
            parseInt(weight)
        );

        // Update database
        patient.weight = parseInt(weight);
        patient.lastBlockchainProfileUpdate = new Date();
        patient.blockchainProfileSynced = true;
        await patient.save();

        // Track transaction
        await trackPatientTransaction(patientId, {
            transactionHash: transactionResult.transactionHash,
            contractFunction: 'updatePatientWeight',
            blockNumber: transactionResult.blockNumber,
            gasUsed: transactionResult.gasUsed,
            status: 'confirmed',
            relatedData: { newWeight: parseInt(weight) }
        });

        return res.status(200).json(
            new ApiResponse(200, {
                transactionHash: transactionResult.transactionHash,
                blockNumber: transactionResult.blockNumber,
                gasUsed: transactionResult.gasUsed,
                newWeight: parseInt(weight)
            }, "Patient weight updated on blockchain successfully")
        );
    } catch (error) {
        console.error('Blockchain weight update failed:', error);
        throw new ApiError(500, `Failed to update weight on blockchain: ${error.message}`);
    }
});

// Update patient blood group on blockchain
const updatePatientBloodGroup = asyncHandler(async (req, res) => {
    const { bloodGroup } = req.body;
    const patientId = req.user._id;

    const validBloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
    if (!bloodGroup || !validBloodGroups.includes(bloodGroup)) {
        throw new ApiError(400, `Valid blood group (${validBloodGroups.join(', ')}) is required`);
    }

    const patient = await Patient.findById(patientId);
    if (!patient) {
        throw new ApiError(404, "Patient not found");
    }

    if (!patient.contractAddress || patient.contractDeploymentStatus !== 'deployed') {
        throw new ApiError(400, "Patient contract not deployed. Cannot update blockchain profile.");
    }

    try {
        // Update on blockchain
        const transactionResult = await contractService.updatePatientBloodGroup(
            patient.contractAddress,
            bloodGroup
        );

        // Update database
        patient.bloodGroup = bloodGroup;
        patient.lastBlockchainProfileUpdate = new Date();
        patient.blockchainProfileSynced = true;
        await patient.save();

        // Track transaction
        await trackPatientTransaction(patientId, {
            transactionHash: transactionResult.transactionHash,
            contractFunction: 'updatePatientBloodGroup',
            blockNumber: transactionResult.blockNumber,
            gasUsed: transactionResult.gasUsed,
            status: 'confirmed',
            relatedData: { newBloodGroup: bloodGroup }
        });

        return res.status(200).json(
            new ApiResponse(200, {
                transactionHash: transactionResult.transactionHash,
                blockNumber: transactionResult.blockNumber,
                gasUsed: transactionResult.gasUsed,
                newBloodGroup: bloodGroup
            }, "Patient blood group updated on blockchain successfully")
        );
    } catch (error) {
        console.error('Blockchain blood group update failed:', error);
        throw new ApiError(500, `Failed to update blood group on blockchain: ${error.message}`);
    }
});

// Get patient details from blockchain (verification)
const getBlockchainPatientDetails = asyncHandler(async (req, res) => {
    const patientId = req.user._id;

    const patient = await Patient.findById(patientId);
    if (!patient) {
        throw new ApiError(404, "Patient not found");
    }

    if (!patient.contractAddress || patient.contractDeploymentStatus !== 'deployed') {
        throw new ApiError(400, "Patient contract not deployed. Cannot fetch blockchain profile.");
    }

    try {
        // Get details from blockchain
        const blockchainDetails = await contractService.getPatientDetails(patient.contractAddress);
        
        // Compare with database
        const databaseDetails = {
            name: patient.name,
            age: patient.age,
            gender: patient.gender,
            height: patient.height,
            weight: patient.weight,
            bloodGroup: patient.bloodGroup
        };

        const isSynced = JSON.stringify(blockchainDetails) === JSON.stringify(databaseDetails);

        return res.status(200).json(
            new ApiResponse(200, {
                blockchainDetails,
                databaseDetails,
                isSynced,
                lastSync: patient.lastBlockchainProfileUpdate
            }, "Patient details fetched from blockchain successfully")
        );
    } catch (error) {
        console.error('Failed to fetch blockchain patient details:', error);
        throw new ApiError(500, `Failed to fetch blockchain details: ${error.message}`);
    }
});

// Sync database profile with blockchain (update database from blockchain)
const syncProfileFromBlockchain = asyncHandler(async (req, res) => {
    const patientId = req.user._id;

    const patient = await Patient.findById(patientId);
    if (!patient) {
        throw new ApiError(404, "Patient not found");
    }

    if (!patient.contractAddress || patient.contractDeploymentStatus !== 'deployed') {
        throw new ApiError(400, "Patient contract not deployed. Cannot sync profile.");
    }

    try {
        // Get details from blockchain
        const blockchainDetails = await contractService.getPatientDetails(patient.contractAddress);
        
        // Update database with blockchain data
        patient.name = blockchainDetails.name;
        patient.age = blockchainDetails.age;
        patient.gender = blockchainDetails.gender;
        patient.height = blockchainDetails.height;
        patient.weight = blockchainDetails.weight;
        patient.bloodGroup = blockchainDetails.bloodGroup;
        patient.lastBlockchainProfileUpdate = new Date();
        patient.blockchainProfileSynced = true;
        await patient.save();

        return res.status(200).json(
            new ApiResponse(200, {
                updatedProfile: blockchainDetails,
                syncTimestamp: patient.lastBlockchainProfileUpdate
            }, "Profile synced from blockchain successfully")
        );
    } catch (error) {
        console.error('Failed to sync profile from blockchain:', error);
        throw new ApiError(500, `Failed to sync profile: ${error.message}`);
    }
});

// ========================================
// UTILITY VIEW FUNCTIONS
// ========================================

// Get patient ID from blockchain contract
const getBlockchainPatientId = asyncHandler(async (req, res) => {
    const patientId = req.user._id;

    const patient = await Patient.findById(patientId);
    if (!patient) {
        throw new ApiError(404, "Patient not found");
    }

    if (!patient.contractAddress || patient.contractDeploymentStatus !== 'deployed') {
        throw new ApiError(400, "Patient contract not deployed. Cannot fetch blockchain patient ID.");
    }

    try {
        const blockchainPatientId = await contractService.getPatientId(patient.contractAddress);

        return res.status(200).json(
            new ApiResponse(200, {
                databasePatientId: patientId,
                blockchainPatientId,
                contractAddress: patient.contractAddress
            }, "Blockchain patient ID fetched successfully")
        );
    } catch (error) {
        console.error('Failed to fetch blockchain patient ID:', error);
        throw new ApiError(500, `Failed to fetch blockchain patient ID: ${error.message}`);
    }
});

// Check if a doctor's access has expired for this patient
const checkDoctorAccessExpiry = asyncHandler(async (req, res) => {
    const { doctorId } = req.params;
    const patientId = req.user._id;

    if (!doctorId) {
        throw new ApiError(400, "Doctor ID is required");
    }

    const patient = await Patient.findById(patientId);
    if (!patient) {
        throw new ApiError(404, "Patient not found");
    }

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
        throw new ApiError(404, "Doctor not found");
    }

    // Check database access expiry
    const now = new Date();
    const accessRequest = await AccessRequest.findOne({
        patientId,
        doctorId,
        status: 'approved'
    });

    let databaseExpiry = {
        hasAccess: false,
        isExpired: true,
        expiryTime: null
    };

    if (accessRequest) {
        const isExpired = accessRequest.accessExpiresAt && accessRequest.accessExpiresAt < now;
        databaseExpiry = {
            hasAccess: !isExpired,
            isExpired: isExpired || false,
            expiryTime: accessRequest.accessExpiresAt
        };
    }

    // Check blockchain access expiry (if contract deployed)
    let blockchainExpiry = {
        hasAccess: false,
        isExpired: true,
        error: null
    };

    if (patient.contractAddress && patient.contractDeploymentStatus === 'deployed' && doctor.walletAddress) {
        try {
            const isExpired = await contractService.hasAccessExpired(
                patient.contractAddress,
                doctor.walletAddress
            );
            blockchainExpiry = {
                hasAccess: !isExpired,
                isExpired: isExpired,
                error: null
            };
        } catch (error) {
            blockchainExpiry.error = error.message;
        }
    }

    return res.status(200).json(
        new ApiResponse(200, {
            doctor: {
                id: doctor._id,
                name: doctor.name,
                walletAddress: doctor.walletAddress
            },
            databaseExpiry,
            blockchainExpiry,
            contractAddress: patient.contractAddress
        }, "Doctor access expiry status fetched successfully")
    );
});

// Verify contract integrity (compare database vs blockchain data)
const verifyContractIntegrity = asyncHandler(async (req, res) => {
    const patientId = req.user._id;

    const patient = await Patient.findById(patientId);
    if (!patient) {
        throw new ApiError(404, "Patient not found");
    }

    if (!patient.contractAddress || patient.contractDeploymentStatus !== 'deployed') {
        throw new ApiError(400, "Patient contract not deployed. Cannot verify integrity.");
    }

    try {
        // Get patient details from blockchain
        const blockchainDetails = await contractService.getPatientDetails(patient.contractAddress);
        const blockchainPatientId = await contractService.getPatientId(patient.contractAddress);

        // Compare with database
        const databaseDetails = {
            name: patient.name,
            age: patient.age,
            gender: patient.gender,
            height: patient.height,
            weight: patient.weight,
            bloodGroup: patient.bloodGroup
        };

        // Check integrity
        const isDataSynced = JSON.stringify(blockchainDetails) === JSON.stringify(databaseDetails);
        
        // Check access requests consistency
        const approvedRequests = await AccessRequest.find({
            patientId,
            status: 'approved',
            accessExpiresAt: { $gt: new Date() }
        }).populate('doctorId', 'name walletAddress');

        // Verify each doctor's blockchain access
        const accessConsistencyChecks = await Promise.all(
            approvedRequests.map(async (request) => {
                if (!request.doctorId.walletAddress) {
                    return {
                        doctorId: request.doctorId._id,
                        doctorName: request.doctorId.name,
                        consistent: false,
                        error: 'Doctor wallet address not available'
                    };
                }

                try {
                    const hasBlockchainAccess = !(await contractService.hasAccessExpired(
                        patient.contractAddress,
                        request.doctorId.walletAddress
                    ));

                    return {
                        doctorId: request.doctorId._id,
                        doctorName: request.doctorId.name,
                        databaseAccess: true,
                        blockchainAccess: hasBlockchainAccess,
                        consistent: hasBlockchainAccess,
                        expiryTime: request.accessExpiresAt
                    };
                } catch (error) {
                    return {
                        doctorId: request.doctorId._id,
                        doctorName: request.doctorId.name,
                        consistent: false,
                        error: error.message
                    };
                }
            })
        );

        const allAccessConsistent = accessConsistencyChecks.every(check => check.consistent);

        return res.status(200).json(
            new ApiResponse(200, {
                contractAddress: patient.contractAddress,
                blockchainPatientId,
                profileIntegrity: {
                    isDataSynced,
                    databaseDetails,
                    blockchainDetails,
                    lastSync: patient.lastBlockchainProfileUpdate
                },
                accessIntegrity: {
                    allAccessConsistent,
                    totalApprovedRequests: approvedRequests.length,
                    accessChecks: accessConsistencyChecks
                },
                overallIntegrity: isDataSynced && allAccessConsistent
            }, "Contract integrity verification completed")
        );
    } catch (error) {
        console.error('Contract integrity verification failed:', error);
        throw new ApiError(500, `Failed to verify contract integrity: ${error.message}`);
    }
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
    // Blockchain profile update functions
    updatePatientName,
    updatePatientAge,
    updatePatientGender,
    updatePatientHeight,
    updatePatientWeight,
    updatePatientBloodGroup,
    getBlockchainPatientDetails,
    syncProfileFromBlockchain,
    // Utility view functions
    getBlockchainPatientId,
    checkDoctorAccessExpiry,
    verifyContractIntegrity
};

