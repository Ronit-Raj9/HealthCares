# HealthCare Blockchain Integration Documentation

## Overview

This document outlines the complete implementation of a healthcare system with blockchain integration for medical record integrity verification. The system combines off-chain storage (IPFS) with on-chain hash verification to ensure data integrity while maintaining privacy and efficiency.

## System Architecture

### Core Components

1. **Frontend (React)** - User interface for patients and doctors
2. **Backend (Node.js/Express)** - API server with authentication and business logic
3. **Database (MongoDB)** - Store user data and metadata
4. **IPFS** - Decentralized storage for encrypted medical files
5. **Blockchain (Ethereum/Sepolia)** - Smart contracts for hash integrity verification
6. **Encryption** - AES-256-CBC for file encryption using wallet signatures

### Data Flow

```
Patient Upload → Encrypt File → Store in IPFS → Store Hash on Blockchain → Store Metadata in Database
Doctor Request → Patient Approval → Blockchain Access Grant → Decrypt & Verify Integrity
```

## Smart Contract Structure

### HealthRecordContract.sol

The main contract stores:
- Patient information (name, age, gender, etc.)
- Medical record hashes (prescriptions, bills, reports)
- Access control (doctors requesting and getting approval)
- Expiry management for time-limited access

Key Functions:
- `addPrescription(name, dataHash)` - Store prescription hash
- `addBill(name, dataHash)` - Store bill hash  
- `addReport(name, dataHash)` - Store report hash
- `requestAccess()` - Doctor requests access
- `approveAccess(doctor, duration, recordIds)` - Patient approves access
- `getApprovedRecords()` - Get approved records for doctor

## Backend Implementation

### 1. Contract Service (`contractService.js`)

Handles all blockchain interactions:
- Deploy patient contracts via factory
- Add record hashes to blockchain
- Grant/revoke access permissions
- Retrieve approved records for doctors
- Get specific record hashes for verification

### 2. Medical Record Controller (`medicalRecord.controller.js`)

Manages the complete file lifecycle:

#### Upload Process:
1. Generate file hash (SHA-256)
2. Encrypt file with patient's wallet signature-derived key
3. Upload encrypted file to IPFS
4. Store hash on patient's blockchain contract
5. Save metadata to MongoDB

#### View Process:
1. Fetch encrypted file from IPFS
2. Decrypt using patient's key (for owners) or stored key (for doctors)
3. Verify integrity against local database hash
4. Verify integrity against blockchain hash
5. Return file if verification passes

### 3. Access Request Controller (`accessRequest.controller.js`)

Handles doctor-patient access workflow:

#### Request Process:
1. Doctor creates access request with wallet address
2. System stores request in database
3. Patient receives notification

#### Approval Process:
1. Patient selects records to share
2. Patient provides wallet signature for key generation
3. System updates database permissions
4. System calls blockchain `approveAccess()` function
5. Doctor gains access to selected records

### 4. Integrity Service (`integrityService.js`)

Provides integrity verification utilities:
- Verify file against database hash
- Verify file against blockchain hash
- Batch verification for multiple records
- Generate integrity reports

### 5. System Controller (`system.controller.js`)

Testing and monitoring endpoints:
- System health checks
- Patient workflow testing
- Doctor workflow testing
- Blockchain integration testing
- Integrity reporting

## API Endpoints

### Medical Records
```
POST /api/medical-records/upload - Upload encrypted medical record
GET /api/medical-records/view/:ipfsHash - Download and decrypt record
GET /api/medical-records/verify/:ipfsHash - Verify record integrity
GET /api/medical-records/patient-records - Get patient's records
```

### Access Requests
```
POST /api/access-requests/doctor/request - Doctor requests access
GET /api/access-requests/patient/requests - Get patient's pending requests
POST /api/access-requests/patient/respond - Patient approves/denies access
GET /api/access-requests/doctor/authorized-records - Get doctor's authorized records
GET /api/access-requests/doctor/blockchain-authorized-records - Get blockchain-verified records
```

### System Testing
```
GET /api/system/status - System health check
GET /api/system/test/patient-workflow - Test patient workflow
GET /api/system/test/doctor-workflow - Test doctor workflow
GET /api/system/test/blockchain/:contractAddress - Test contract integration
GET /api/system/integrity-report - Generate integrity report
```

## Security Features

### Encryption
- Files encrypted with AES-256-CBC
- Keys derived from wallet signatures (deterministic)
- Unique IV for each file
- Patient can always regenerate keys from signature

### Access Control
- JWT-based authentication
- Role-based permissions (patient/doctor)
- Time-limited access grants
- Blockchain-enforced permissions

### Integrity Verification
- SHA-256 hashes stored on blockchain
- Double verification (database + blockchain)
- Tamper detection through hash comparison
- Immutable audit trail

## Usage Examples

### 1. Patient Uploads Medical Record

```javascript
// Frontend: Patient signs message with wallet
const signature = await signer.signMessage("Healthcare Record Upload");

// API call with file and signature
const formData = new FormData();
formData.append('file', file);
formData.append('recordType', 'prescription');
formData.append('name', 'Blood Test Results');
formData.append('walletSignature', signature);

const response = await fetch('/api/medical-records/upload', {
  method: 'POST',
  body: formData,
  headers: { Authorization: `Bearer ${token}` }
});
```

### 2. Doctor Requests Access

```javascript
const response = await fetch('/api/access-requests/doctor/request', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${doctorToken}`
  },
  body: JSON.stringify({
    patientId: 'patient_id',
    requestReason: 'Treatment planning',
    walletAddress: doctorWalletAddress
  })
});
```

### 3. Patient Approves Access

```javascript
// Patient signs approval message
const signature = await signer.signMessage("Approve Medical Record Access");

const response = await fetch('/api/access-requests/patient/respond', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${patientToken}`
  },
  body: JSON.stringify({
    requestId: 'request_id',
    action: 'approve',
    selectedRecords: ['record1_id', 'record2_id'],
    accessDuration: 30, // days
    patientSignature: signature
  })
});
```

### 4. Doctor Views Approved Record

```javascript
// Doctor can now access the record
const response = await fetch(`/api/medical-records/view/${ipfsHash}`, {
  headers: { Authorization: `Bearer ${doctorToken}` }
});

// Check integrity headers
const integrityVerified = response.headers.get('X-Integrity-Verified');
const blockchainVerified = response.headers.get('X-Blockchain-Hash-Verified');
```

## Environment Variables

```env
# Database
MONGODB_URI=mongodb://localhost:27017/healthcare

# JWT Secrets
ACCESSJWT_SECRET=your_jwt_secret
REFRESHJWT_SECRET=your_refresh_secret

# IPFS Configuration
IPFS_HOST=localhost
IPFS_PORT=5001
IPFS_PROTOCOL=http

# Blockchain Configuration
ETHEREUM_RPC_URL=https://sepolia.infura.io/v3/YOUR_PROJECT_ID
PRIVATE_KEY=your_private_key
HEALTH_RECORD_FACTORY_ADDRESS=0x...factory_contract_address
```

## Deployment Steps

1. **Deploy Smart Contracts**
   ```bash
   cd contracts
   forge build
   forge script script/DeployHealthRecordFactory.s.sol --broadcast --rpc-url $SEPOLIA_RPC_URL
   ```

2. **Setup Backend**
   ```bash
   cd backend
   npm install
   npm start
   ```

3. **Configure Environment**
   - Set contract addresses
   - Configure IPFS node
   - Set up MongoDB
   - Configure blockchain RPC

4. **Test Integration**
   ```bash
   # Test system health
   curl http://localhost:5000/api/system/status
   
   # Test with authenticated users
   curl -H "Authorization: Bearer $TOKEN" \
        http://localhost:5000/api/system/test/patient-workflow
   ```

## Error Handling

The system includes comprehensive error handling for:
- Network failures (IPFS, blockchain)
- Invalid signatures or keys
- Expired access permissions
- Hash mismatches (tampered data)
- Contract interaction failures

## Performance Considerations

- IPFS files are cached locally when possible
- Blockchain calls are minimized through caching
- Database queries are optimized with indexes
- File encryption/decryption is streamed for large files

## Future Enhancements

1. **IPFS Clustering** - Multiple IPFS nodes for redundancy
2. **Layer 2 Integration** - Use Polygon or Arbitrum for lower costs
3. **Advanced Encryption** - Proxy re-encryption for better key management
4. **Audit Logging** - Comprehensive access logging
5. **Mobile App** - React Native mobile application

## Troubleshooting

### Common Issues

1. **Contract Deployment Failed**
   - Check RPC URL and private key
   - Ensure sufficient ETH for gas

2. **IPFS Upload Failed**
   - Verify IPFS node is running
   - Check network connectivity

3. **Integrity Verification Failed**
   - File may be corrupted
   - Check signature generation
   - Verify contract address

4. **Access Denied**
   - Check JWT token validity
   - Verify wallet address registration
   - Ensure access hasn't expired

## Contact

For technical support or questions about the implementation, please refer to the system logs and use the testing endpoints to diagnose issues. 