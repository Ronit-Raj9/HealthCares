import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import fetchData from '../helper/authApi';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import '../styles/medicalrecords.css';
import { useNavigate } from 'react-router-dom';
import { useAccount, useSignMessage } from 'wagmi';
import { ENCRYPTION_KEY_MESSAGE, BACKEND_URL } from '../utils/constants';

const MedicalRecords = () => {
    const [records, setRecords] = useState([]);
    const [file, setFile] = useState(null);
    const [recordType, setRecordType] = useState('prescription');
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);
    const [encryptionStatus, setEncryptionStatus] = useState('');
    const [contractStatus, setContractStatus] = useState(null);
    const [deployingContract, setDeployingContract] = useState(false);
    const [systemStatus, setSystemStatus] = useState(null);
    const [integrityReport, setIntegrityReport] = useState(null);
    const [showIntegrityReport, setShowIntegrityReport] = useState(false);
    const [blockchainProfile, setBlockchainProfile] = useState(null);
    const [doctorAccessStatus, setDoctorAccessStatus] = useState([]);
    const [showAccessStatus, setShowAccessStatus] = useState(false);
    
    const { userInfo } = useSelector(state => state.root);
    const navigate = useNavigate();
    const { address, isConnected } = useAccount();
    const { signMessageAsync } = useSignMessage();

    useEffect(() => {
        fetchRecords();
        fetchContractStatus();
        fetchSystemStatus();
        // Fetch blockchain profile for patients
        const patient = localStorage.getItem("patient");
        if (patient) {
            fetchBlockchainProfile();
        }
    }, []);

    const fetchRecords = async () => {
        try {
            const response = await fetchData(`${BACKEND_URL}/api/medical-records/patient-records`);
            setRecords(response.data);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Error fetching records');
        }
    };

    const fetchContractStatus = async () => {
        try {
            const response = await fetchData(`${BACKEND_URL}/api/patients/contract/status`);
            setContractStatus(response.data);
        } catch (error) {
            console.error('Error fetching contract status:', error);
        }
    };

    const fetchSystemStatus = async () => {
        try {
            const response = await fetch(`${BACKEND_URL}/api/system/status`);
            const result = await response.json();
            setSystemStatus(result.data);
        } catch (error) {
            console.error('Error fetching system status:', error);
        }
    };

    const generateIntegrityReport = async () => {
        setShowIntegrityReport(true);
        try {
            const response = await fetchData(`${BACKEND_URL}/api/system/integrity-report`);
            setIntegrityReport(response.data);
            toast.success('Integrity report generated successfully');
        } catch (error) {
            toast.error('Error generating integrity report');
            console.error('Error generating integrity report:', error);
        }
    };

    const testPatientWorkflow = async () => {
        try {
            const response = await fetchData(`${BACKEND_URL}/api/system/test/patient-workflow`);
            toast.success('Patient workflow test completed successfully');
            console.log('Patient workflow test results:', response.data);
        } catch (error) {
            toast.error('Patient workflow test failed');
            console.error('Patient workflow test error:', error);
        }
    };

    const testBlockchainIntegration = async () => {
        if (!contractStatus?.contractAddress) {
            toast.error('No contract deployed to test');
            return;
        }
        
        try {
            const response = await fetchData(`${BACKEND_URL}/api/system/test/blockchain/${contractStatus.contractAddress}`);
            toast.success('Blockchain integration test completed');
            console.log('Blockchain test results:', response.data);
        } catch (error) {
            toast.error('Blockchain integration test failed');
            console.error('Blockchain test error:', error);
        }
    };

    const verifyRecordIntegrity = async (record) => {
        if (!isConnected) {
            toast.error('Please connect your wallet to verify record integrity');
            return;
        }

        try {
            // Generate wallet signature for verification
            const message = ENCRYPTION_KEY_MESSAGE;
            const signature = await signMessageAsync({ message });
            
            const response = await fetchData(
                `${BACKEND_URL}/api/medical-records/verify/${record.ipfsHash}?walletSignature=${encodeURIComponent(signature)}`
            );
            
            const verification = response.data;
            
            if (verification.overallIntegrityValid) {
                toast.success(`✅ Record integrity verified\n🔐 Local hash: Valid\n⛓️ Blockchain: ${verification.blockchainVerification.available ? 'Verified' : 'Not available'}`);
            } else {
                toast.error(`❌ Integrity verification failed!\n🔐 Local: ${verification.localIntegrityValid ? 'Valid' : 'Invalid'}\n⛓️ Blockchain: ${verification.blockchainVerification.message}`);
            }
            
            console.log('Integrity verification results:', verification);
        } catch (error) {
            toast.error('Error verifying record integrity');
            console.error('Integrity verification error:', error);
        }
    };

    const retryContractDeployment = async () => {
        setDeployingContract(true);
        try {
            const response = await fetchData(`${BACKEND_URL}/api/patients/contract/deploy`, 'POST');
            setContractStatus(response.data);
            toast.success('Contract deployed successfully!');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to deploy contract');
        } finally {
            setDeployingContract(false);
        }
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!file || !name) {
            return toast.error('Please select a file and provide a name');
        }

        if (!isConnected) {
            return toast.error('Please connect your wallet first');
        }

        setLoading(true);
        setEncryptionStatus('Generating encryption key...');

        try {
            // Generate wallet signature for encryption key
            const message = ENCRYPTION_KEY_MESSAGE;
            const signature = await signMessageAsync({ message });
            
            setEncryptionStatus('Preparing encrypted upload...');

        const formData = new FormData();
        formData.append('file', file);
        formData.append('recordType', recordType);
        formData.append('name', name);
        formData.append('description', description);
            formData.append('walletSignature', signature);

            const token = localStorage.getItem('token');
            const response = await fetch(`${BACKEND_URL}/api/medical-records/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Upload failed');
            }

            const result = await response.json();
            
            toast.success('Record uploaded and encrypted successfully');
            setFile(null);
            setName('');
            setDescription('');
            setEncryptionStatus('');
            fetchRecords();
            fetchContractStatus(); // Refresh contract status

            // Show blockchain info if available
            if (result.data.onChainData) {
                toast.success(`Record stored on blockchain with ID: ${result.data.onChainData.recordId}`);
            } else if (result.data.contractDeploymentStatus === 'failed') {
                toast('Record encrypted and saved, but blockchain storage unavailable (contract deployment failed)', {
                    icon: '⚠️',
                    style: {
                        borderLeft: '4px solid #f59e0b',
                        backgroundColor: '#fef3c7'
                    }
                });
            } else if (!result.data.contractAddress) {
                toast('Record encrypted and saved. Contract deployment may still be in progress.', {
                    icon: 'ℹ️',
                    style: {
                        borderLeft: '4px solid #3b82f6',
                        backgroundColor: '#dbeafe'
                    }
                });
            }
        } catch (error) {
            console.error('Upload error:', error);
            toast.error(error.message || 'Error uploading file');
            setEncryptionStatus('');
        } finally {
            setLoading(false);
        }
    };

    const viewRecord = (recordId) => {
        navigate(`/record/${recordId}`);
    };

    const fetchBlockchainProfile = async () => {
        try {
            const response = await fetchData(`${BACKEND_URL}/api/patients/blockchain/details`);
            setBlockchainProfile(response.data);
        } catch (error) {
            console.error('Error fetching blockchain profile:', error);
        }
    };

    const checkDoctorAccessExpiry = async () => {
        setShowAccessStatus(true);
        try {
            const response = await fetchData(`${BACKEND_URL}/api/patients/blockchain/doctor-access-status`);
            setDoctorAccessStatus(response.data);
            toast.success('Doctor access status retrieved successfully');
        } catch (error) {
            toast.error('Error checking doctor access status');
            console.error('Doctor access status error:', error);
        }
    };

    const verifyContractIntegrity = async () => {
        if (!contractStatus?.contractAddress) {
            toast.error('No contract deployed to verify');
            return;
        }

        try {
            const response = await fetchData(`${BACKEND_URL}/api/patients/blockchain/verify-contract`);
            const verification = response.data;
            
            if (verification.isValid) {
                toast.success(`✅ Contract integrity verified\n🔗 Address: ${verification.contractAddress}\n📊 Records: ${verification.recordCount}\n⚖️ Access: ${verification.accessCount}`);
            } else {
                toast.error(`❌ Contract verification failed\n${verification.message}`);
            }
            
            console.log('Contract verification results:', verification);
        } catch (error) {
            toast.error('Error verifying contract integrity');
            console.error('Contract verification error:', error);
        }
    };

    const syncAllRecordsIntegrity = async () => {
        if (!isConnected) {
            toast.error('Please connect your wallet to sync record integrity');
            return;
        }

        setLoading(true);
        try {
            const response = await fetchData(`${BACKEND_URL}/api/medical-records/sync-all-integrity`, 'POST');
            toast.success(`Integrity sync completed\n✅ Synced: ${response.data.syncedCount}\n⚠️ Failed: ${response.data.failedCount}`);
            fetchRecords(); // Refresh records list
        } catch (error) {
            toast.error('Error syncing record integrity');
            console.error('Integrity sync error:', error);
        } finally {
            setLoading(false);
        }
    };

    const getMyBlockchainPatientId = async () => {
        try {
            const response = await fetchData(`${BACKEND_URL}/api/patients/blockchain/patient-id`);
            toast.success(`Your blockchain patient ID: ${response.data.patientId}`);
            console.log('Blockchain patient ID:', response.data);
        } catch (error) {
            toast.error('Error retrieving blockchain patient ID');
            console.error('Patient ID error:', error);
        }
    };

    // Enhanced system status with blockchain verification features
    const getSystemStatusDisplay = () => {
        if (!systemStatus) return null;

        return (
            <div className="system-status-card">
                <h4>🏥 System Health Status</h4>
                <div className="status-grid">
                    <div className="status-item">
                        <span className="status-label">Database:</span>
                        <span className={`status-value ${systemStatus.database.connected ? 'success' : 'error'}`}>
                            {systemStatus.database.connected ? '✅ Connected' : '❌ Disconnected'}
                        </span>
                    </div>
                    <div className="status-item">
                        <span className="status-label">Blockchain:</span>
                        <span className={`status-value ${systemStatus.blockchain.initialized ? 'success' : 'error'}`}>
                            {systemStatus.blockchain.initialized ? '✅ Initialized' : '❌ Failed'}
                        </span>
                    </div>
                    <div className="status-item">
                        <span className="status-label">IPFS:</span>
                        <span className={`status-value ${systemStatus.ipfs.connected ? 'success' : 'warning'}`}>
                            {systemStatus.ipfs.connected ? '✅ Connected' : '⚠️ Unknown'}
                        </span>
                    </div>
                </div>
                <div className="system-actions">
                    <button 
                        className="test-button"
                        onClick={testPatientWorkflow}
                    >
                        🧪 Test Patient Workflow
                    </button>
                    <button 
                        className="test-button"
                        onClick={generateIntegrityReport}
                    >
                        📊 Generate Integrity Report
                    </button>
                    {contractStatus?.contractAddress && (
                        <>
                            <button 
                                className="test-button"
                                onClick={verifyContractIntegrity}
                            >
                                🔍 Verify Contract Integrity
                            </button>
                            <button 
                                className="test-button"
                                onClick={syncAllRecordsIntegrity}
                                disabled={loading || !isConnected}
                            >
                                🔄 Sync All Record Integrity
                            </button>
                            <button 
                                className="test-button"
                                onClick={getMyBlockchainPatientId}
                            >
                                🆔 Get Blockchain Patient ID
                            </button>
                            <button 
                                className="test-button"
                                onClick={checkDoctorAccessExpiry}
                            >
                                👨‍⚕️ Check Doctor Access Status
                            </button>
                        </>
                    )}
                </div>
            </div>
        );
    };

    // Enhanced contract status with blockchain profile info
    const getContractStatusDisplay = () => {
        if (!contractStatus) return null;

        const { contractDeploymentStatus, contractAddress, hasContract } = contractStatus;

        return (
            <div className="contract-status-card">
                <h4>🔗 Blockchain Contract Status</h4>
                {contractDeploymentStatus === 'deployed' && hasContract ? (
                    <div className="status-success">
                        <p>✅ Contract Deployed Successfully</p>
                        <p className="contract-address">
                            <strong>Address:</strong> {contractAddress?.slice(0, 6)}...{contractAddress?.slice(-4)}
                        </p>
                        
                        {/* Show blockchain profile info if available */}
                        {blockchainProfile && (
                            <div className="blockchain-profile-summary">
                                <h5>📋 Blockchain Profile Summary</h5>
                                <div className="profile-grid">
                                    <div className="profile-item">
                                        <span>Name:</span> 
                                        <span>{blockchainProfile.profile?.name || 'Not set'}</span>
                                    </div>
                                    <div className="profile-item">
                                        <span>Age:</span> 
                                        <span>{blockchainProfile.profile?.age || 'Not set'}</span>
                                    </div>
                                    <div className="profile-item">
                                        <span>Gender:</span> 
                                        <span>{blockchainProfile.profile?.gender || 'Not set'}</span>
                                    </div>
                                    <div className="profile-item">
                                        <span>Blood Group:</span> 
                                        <span>{blockchainProfile.profile?.bloodGroup || 'Not set'}</span>
                                    </div>
                                </div>
                                <small>Last synced: {blockchainProfile.lastSyncAt ? new Date(blockchainProfile.lastSyncAt).toLocaleString() : 'Never'}</small>
                            </div>
                        )}
                        
                        <p className="status-note">Your medical records will be automatically stored on blockchain with integrity verification.</p>
                        <div className="contract-actions">
                            <button 
                                className="test-button"
                                onClick={testBlockchainIntegration}
                            >
                                🧪 Test Blockchain Integration
                            </button>
                        </div>
                    </div>
                ) : contractDeploymentStatus === 'failed' ? (
                    <div className="status-error">
                        <p>❌ Contract Deployment Failed</p>
                        <p className="status-note">Blockchain features are unavailable. Records will be encrypted and stored securely off-chain.</p>
                        <button 
                            className="retry-button"
                            onClick={retryContractDeployment}
                            disabled={deployingContract}
                        >
                            {deployingContract ? 'Deploying...' : 'Retry Deployment'}
                        </button>
                    </div>
                ) : contractDeploymentStatus === 'pending' ? (
                    <div className="status-pending">
                        <p>⏳ Contract Deployment In Progress</p>
                        <p className="status-note">Please wait for blockchain deployment to complete...</p>
                    </div>
                ) : (
                    <div className="status-unknown">
                        <p>❓ Contract Status Unknown</p>
                        <button 
                            className="retry-button"
                            onClick={retryContractDeployment}
                            disabled={deployingContract}
                        >
                            {deployingContract ? 'Deploying...' : 'Deploy Contract'}
                        </button>
                    </div>
                )}
            </div>
        );
    };

    return (
        <>
            <Navbar />
            <div className="medical-records-container">
                <h2>Medical Records</h2>
                
                {/* System Status Display */}
                {getSystemStatusDisplay()}
                
                {/* Upload Form */}
                <div className="upload-form">
                    <h3>Upload New Medical Record</h3>
                    <form onSubmit={handleUpload}>
                        <div className="form-group">
                            <label>Record Type:</label>
                            <select 
                                value={recordType} 
                                onChange={(e) => setRecordType(e.target.value)}
                            >
                                <option value="prescription">Prescription</option>
                                <option value="report">Medical Report</option>
                                <option value="bill">Bill</option>
                            </select>
                        </div>

                        <div className="form-group">
                            <label>Record Name:</label>
                            <input 
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g., Blood Test Report"
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label>Description (optional):</label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Additional details about this record"
                                rows="3"
                            />
                        </div>

                        <div className="form-group">
                            <label>Select File:</label>
                            <input 
                                type="file"
                                onChange={(e) => setFile(e.target.files[0])}
                                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                                required
                            />
                        </div>

                        <div className="wallet-status">
                            {isConnected ? (
                                <p className="connected">✅ Wallet Connected: {address?.slice(0, 6)}...{address?.slice(-4)}</p>
                            ) : (
                                <p className="disconnected">❌ Please connect your wallet to upload encrypted records</p>
                            )}
                        </div>

                        {encryptionStatus && (
                            <div className="encryption-status">
                                <p>🔐 {encryptionStatus}</p>
                            </div>
                        )}

                        <button type="submit" disabled={loading || !isConnected}>
                            {loading ? 'Processing...' : 'Upload Encrypted Record'}
                        </button>
                    </form>
                </div>

                {/* Records List */}
                <div className="records-list">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h3>Your Records</h3>
                        <button 
                            className="btn-secondary"
                            onClick={() => navigate('/transaction-history')}
                            style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                        >
                            🔗 View Transaction History
                        </button>
                    </div>
                    {records.length === 0 ? (
                        <p>No records found</p>
                    ) : (
                        <div className="records-grid">
                            {records.map((record) => (
                                <div key={record._id} className="record-card">
                                    <div className="record-header">
                                        <h4>{record.name}</h4>
                                        <div className="record-badges">
                                            {record.isEncrypted && (
                                                <span className="badge encrypted">🔐 Encrypted</span>
                                            )}
                                            {record.recordId_onchain && (
                                                <span className="badge blockchain">⛓️ On-Chain</span>
                                            )}
                                            {record.dataHash && record.blockchainHash && record.dataHash === record.blockchainHash && (
                                                <span className="badge verified">✅ Hash Verified</span>
                                            )}
                                            {record.dataHash && record.blockchainHash && record.dataHash !== record.blockchainHash && (
                                                <span className="badge warning">⚠️ Hash Mismatch</span>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <div className="record-info">
                                        <p><strong>Type:</strong> {record.recordType}</p>
                                        {record.description && (
                                            <p><strong>Description:</strong> {record.description}</p>
                                        )}
                                        <p><strong>Uploaded:</strong> {new Date(record.uploadedAt).toLocaleDateString()}</p>
                                        
                                        {record.recordId_onchain && (
                                            <p><strong>Blockchain ID:</strong> {record.recordId_onchain}</p>
                                        )}
                                        
                                        {record.blockchainTransactions?.upload && (
                                            <p><strong>Tx Hash:</strong> 
                                                <code style={{fontSize: '0.8rem'}}>
                                                    {record.blockchainTransactions.upload.transactionHash.slice(0, 8)}...{record.blockchainTransactions.upload.transactionHash.slice(-6)}
                                                </code>
                                            </p>
                                        )}
                                        
                                        <p><strong>Authorized Users:</strong> {record.authorizedUsers?.length || 0}</p>
                                        
                                        {/* Show hash comparison if both hashes exist */}
                                        {record.dataHash && record.blockchainHash && (
                                            <div className="hash-comparison">
                                                <p><strong>Local Hash:</strong> <code style={{fontSize: '0.7rem'}}>{record.dataHash.slice(0, 12)}...</code></p>
                                                <p><strong>Blockchain Hash:</strong> <code style={{fontSize: '0.7rem'}}>{record.blockchainHash.slice(0, 12)}...</code></p>
                                                <p><strong>Match:</strong> {record.dataHash === record.blockchainHash ? '✅ Yes' : '❌ No'}</p>
                                            </div>
                                        )}
                                    </div>

                                    <div className="record-actions">
                                        <button 
                                            className="btn-primary"
                                            onClick={() => viewRecord(record._id)}
                                        >
                                            View Record
                                        </button>
                                        <button 
                                            className="btn-secondary"
                                            onClick={() => navigate(`/access-control/${record._id}`)}
                                        >
                                            Manage Access
                                        </button>
                                        <button 
                                            className="btn-info"
                                            onClick={() => verifyRecordIntegrity(record)}
                                            disabled={!isConnected}
                                            title="Verify file integrity against blockchain"
                                        >
                                            🔍 Verify Integrity
                                        </button>
                                        {record.blockchainTransactions?.upload && (
                                            <button 
                                                className="btn-info"
                                                onClick={() => navigate('/transaction-history')}
                                                title="View blockchain transaction"
                                            >
                                                🔗 View Tx
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Doctor Access Status Modal */}
                {showAccessStatus && (
                    <div className="modal-overlay">
                        <div className="access-status-modal">
                            <div className="modal-header">
                                <h3>👨‍⚕️ Doctor Access Status</h3>
                                <button 
                                    onClick={() => setShowAccessStatus(false)}
                                    className="close-btn"
                                >
                                    ✕
                                </button>
                            </div>
                            <div className="modal-content">
                                <div className="access-status-summary">
                                    <h4>Current Doctor Access Status</h4>
                                    {doctorAccessStatus.length === 0 ? (
                                        <p>No doctor access found</p>
                                    ) : (
                                        <div className="access-status-list">
                                            {doctorAccessStatus.map((access, index) => (
                                                <div key={index} className="access-status-item">
                                                    <div className="doctor-info">
                                                        <h5>Dr. {access.doctorName}</h5>
                                                        <p>{access.doctorEmail}</p>
                                                    </div>
                                                    <div className="access-details">
                                                        <p><strong>Status:</strong> 
                                                            <span className={`status ${access.hasExpired ? 'expired' : 'active'}`}>
                                                                {access.hasExpired ? '❌ Expired' : '✅ Active'}
                                                            </span>
                                                        </p>
                                                        <p><strong>Expires:</strong> {new Date(access.expiresAt).toLocaleDateString()}</p>
                                                        <p><strong>Days Left:</strong> {access.daysRemaining}</p>
                                                        {access.blockchainVerified !== null && (
                                                            <p><strong>Blockchain Status:</strong> 
                                                                <span className={access.blockchainVerified ? 'verified' : 'warning'}>
                                                                    {access.blockchainVerified ? '✅ Verified' : '⚠️ Not verified'}
                                                                </span>
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Integrity Report Modal */}
                {showIntegrityReport && integrityReport && (
                    <div className="modal-overlay">
                        <div className="integrity-report-modal">
                            <div className="modal-header">
                                <h3>📊 Integrity Report</h3>
                                <button 
                                    onClick={() => setShowIntegrityReport(false)}
                                    className="close-btn"
                                >
                                    ✕
                                </button>
                            </div>
                            <div className="modal-content">
                                <div className="report-summary">
                                    <h4>Summary</h4>
                                    <div className="summary-grid">
                                        <div className="summary-item">
                                            <span>Total Records:</span>
                                            <span>{integrityReport.summary.totalRecords}</span>
                                        </div>
                                        <div className="summary-item">
                                            <span>With Database Hash:</span>
                                            <span>{integrityReport.summary.withDatabaseHash}</span>
                                        </div>
                                        <div className="summary-item">
                                            <span>With Blockchain Hash:</span>
                                            <span>{integrityReport.summary.withBlockchainHash}</span>
                                        </div>
                                        <div className="summary-item">
                                            <span>Hash Matches:</span>
                                            <span>{integrityReport.summary.hashMatches}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="report-details">
                                    <h4>Record Details</h4>
                                    <div className="records-table">
                                        {integrityReport.records.map((record, index) => (
                                            <div key={index} className="record-row">
                                                <span className="record-name">{record.recordName}</span>
                                                <span className={`record-status ${record.blockchainHashStatus?.available ? 'success' : 'warning'}`}>
                                                    {record.blockchainHashStatus?.available ? '✅ Blockchain Verified' : '⚠️ No Blockchain Hash'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {getContractStatusDisplay()}
            </div>
            <Footer />
        </>
    );
};

export default MedicalRecords; 