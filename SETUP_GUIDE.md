# Enhanced Medical Record System - Setup Guide

## 🚀 Quick Start

This system now includes **end-to-end encryption**, **blockchain integration**, and **secure access control** for medical records.

## 📋 Prerequisites

- Node.js (v16+)
- MongoDB
- IPFS node (local or hosted)
- Ethereum-compatible wallet (MetaMask)
- Git

## 🛠️ Installation Steps

### 1. Backend Setup

```bash
cd backend
npm install
```

### 2. Environment Configuration

Create `backend/.env` with the following variables:

```env
# Database
MONGODB_URI=mongodb://localhost:27017/healthcare

# JWT Secrets
ACCESSJWT_SECRET=your_super_secret_jwt_key_here
REFRESHJWT_SECRET=your_super_secret_refresh_key_here

# IPFS Configuration
IPFS_HOST=localhost
IPFS_PORT=5001
IPFS_PROTOCOL=http

# Blockchain Configuration
ETHEREUM_RPC_URL=http://localhost:8545
PRIVATE_KEY=your_ethereum_private_key_here

# Optional: Deployed contract addresses
HEALTH_RECORD_FACTORY_ADDRESS=
```

### 3. Frontend Setup

```bash
cd ../
npm install
```

### 4. Smart Contract Setup

```bash
cd contracts
# Install dependencies
forge install

# Compile contracts
forge build

# Deploy to local network (optional)
forge script script/DeployHealthRecords.s.sol --broadcast --rpc-url http://localhost:8545
```

## 🔧 Required Services

### 1. Start MongoDB
```bash
mongod
```

### 2. Start IPFS Node
```bash
ipfs daemon
```

### 3. Start Local Ethereum Node (Optional)
```bash
# Using Hardhat
npx hardhat node

# Or using Ganache
ganache-cli
```

### 4. Start Backend Server
```bash
cd backend
npm run dev
```

### 5. Start Frontend
```bash
npm run dev
```

## 🎯 Key Features Implemented

### ✅ Cryptography & Security
- **AES-256-GCM** encryption for all medical files
- **Wallet signature-based** key derivation
- **RSA key pairs** for doctor-patient key exchange
- **SHA-256 hashing** for integrity verification

### ✅ Smart Contract Integration
- **On-chain integrity hashes** storage
- **Access control** via smart contracts
- **Event-based** record ID tracking
- **Factory pattern** for patient contracts

### ✅ Access Control System
- **Request/approval workflow** for doctor access
- **Secure key exchange** between patients and doctors
- **Time-based access expiry**
- **Granular permissions** (specific records, record types, or all records)

### ✅ Data Integrity
- **File hash verification** against blockchain
- **Tamper detection** for downloaded files
- **Integrity status indicators** in UI

## 🔐 Security Features

1. **File Encryption**: All files encrypted before IPFS upload
2. **Key Management**: Symmetric keys encrypted with doctor's RSA public key
3. **Integrity Verification**: SHA-256 hashes stored on blockchain
4. **Access Control**: Smart contract-based authorization
5. **Wallet Integration**: MetaMask signatures for key generation

## 📱 User Workflows

### Patient Workflow:
1. Connect MetaMask wallet
2. Upload medical record (automatically encrypted)
3. Record hash stored on blockchain (optional)
4. Approve/deny doctor access requests
5. Manage authorized users

### Doctor Workflow:
1. Generate RSA key pair (one-time setup)
2. Request access to patient records
3. Wait for patient approval
4. Download and decrypt approved records
5. Verify file integrity

## 🧪 Testing the System

### Test Upload Flow:
1. Connect wallet in frontend
2. Upload a test file with blockchain integration enabled
3. Verify file appears encrypted in IPFS
4. Verify hash stored on blockchain (if applicable)
5. Download file and verify decryption works

### Test Access Control:
1. Create doctor account and generate key pair
2. Request access to patient records
3. Patient approves request
4. Doctor downloads and decrypts files
5. Verify integrity verification works

## 🚨 Security Considerations

- **Never store private keys** in frontend code
- **Always verify file integrity** before trusting content
- **Use testnet** for development and testing
- **Backup encryption keys** securely
- **Monitor access logs** for suspicious activity

## 📊 API Endpoints Added

### Key Management:
- `POST /api/keys/doctor/generate-keypair` - Generate doctor RSA keys
- `GET /api/keys/public-key/:doctorId` - Get doctor's public key
- `POST /api/keys/doctor/decrypt-key` - Decrypt patient symmetric key

### Access Requests:
- `POST /api/access-requests/doctor/request` - Create access request
- `GET /api/access-requests/patient/requests` - Get patient's access requests
- `POST /api/access-requests/patient/respond/:requestId` - Approve/deny access
- `GET /api/access-requests/doctor/authorized-records/:patientId` - Get authorized records

### Enhanced Medical Records:
- `POST /api/medical-records/upload` - Upload encrypted record (enhanced)
- `GET /api/medical-records/view/:ipfsHash` - Download decrypted record (enhanced)

## 🔧 Troubleshooting

### Common Issues:

1. **IPFS Connection Failed**
   - Ensure IPFS daemon is running
   - Check IPFS_HOST and IPFS_PORT in .env

2. **Wallet Connection Issues**
   - Install MetaMask extension
   - Connect to correct network
   - Check frontend is using HTTPS (for production)

3. **Encryption/Decryption Errors**
   - Verify wallet signature generation
   - Check doctor has generated key pair
   - Ensure patient has approved access

4. **Blockchain Errors**
   - Verify RPC URL is correct
   - Check private key has sufficient funds
   - Ensure contracts are deployed

## 📈 Next Steps

1. **Deploy to testnet** (Sepolia, Mumbai)
2. **Add notification system** for access requests
3. **Implement batch operations** for multiple records
4. **Add audit logging** for compliance
5. **Enhance UI/UX** with better error handling

---

## 🎉 Success Criteria

✅ Patient can upload encrypted medical records  
✅ Files are stored encrypted on IPFS  
✅ Integrity hashes stored on blockchain  
✅ Doctor can request access to records  
✅ Patient can approve/deny access requests  
✅ Doctor can download and decrypt approved files  
✅ File integrity verification works  
✅ Access control prevents unauthorized access  

Your enhanced medical record system is now ready for secure, encrypted, and blockchain-verified medical data management! 🏥🔒⛓️ 