import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import connectDB from './database/index.js';
import patientRouter from './routes/patientRoutes.js';
import doctorRouter from './routes/doctorRoutes.js';
import contactRouter from './routes/contact.js';
import cookieParser from 'cookie-parser';
import chatRouter from './routes/chat.js';
import dotenv from 'dotenv';
import imageUploadRoutes from './routes/upload.js';
import forgotPassRouter from "./routes/forget-pass.js";
import notificationRouter from "./routes/notifRouters.js";
import medicalRecordRouter from "./routes/medicalRecord.routes.js";
import keyManagementRouter from "./routes/keyManagement.routes.js";
import accessRequestRouter from "./routes/accessRequestRoutes.js";
import transactionHistoryRouter from "./routes/transactionHistory.routes.js";
import path from 'path';
import { fileURLToPath } from 'url';

// Configure dotenv for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try to load .env file, set defaults if not found
try {
    dotenv.config({ path: path.join(__dirname, '.env') });
} catch (error) {
    console.log('No .env file found, using default values');
}

// Set default environment variables if not provided
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/healthcare';
process.env.ACCESSJWT_SECRET = process.env.ACCESSJWT_SECRET || 'hello123';
process.env.REFRESHJWT_SECRET = process.env.REFRESHJWT_SECRET || 'hello123';
process.env.IPFS_HOST = process.env.IPFS_HOST || 'localhost';
process.env.IPFS_PORT = process.env.IPFS_PORT || '5001';
process.env.IPFS_PROTOCOL = process.env.IPFS_PROTOCOL || 'http';
process.env.PORT = process.env.PORT || '5000';
const app= express();
app.use(cors({
    origin:'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

connectDB()
  .then(() => {
    console.log("Database connected successfully");
  })
  .catch((error) => {
    console.error("Database connection failed:", error);
  });
app.get('/', (req, res) => {
  res.send('Welcome to the Healthcare API');
});
app.use('/api/patients', patientRouter);
app.use('/api/doctors', doctorRouter);
app.use('/api',contactRouter);
app.use('/api/chat', chatRouter);
app.use('/api/upload', imageUploadRoutes);
app.use('/api/auth', forgotPassRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/medical-records', medicalRecordRouter);
app.use('/api/keys', keyManagementRouter);
app.use('/api/access-requests', accessRequestRouter);
app.use('/api/transactions', transactionHistoryRouter);

// Start the server
app.listen(5000, () => {
    console.log("Server is running on port 5000");
    }
);