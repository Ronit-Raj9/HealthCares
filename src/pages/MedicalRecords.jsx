import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { toast } from 'react-hot-toast';
import fetchData from '../helper/authApi';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import '../styles/medicalrecords.css';
import { useNavigate } from 'react-router-dom';
import { useAccount, useSignMessage } from 'wagmi';

const BACKEND_URL = 'http://localhost:5000';

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
    
    const { userInfo } = useSelector(state => state.root);
    const navigate = useNavigate();
    const { address, isConnected } = useAccount();
    const { signMessageAsync } = useSignMessage();

    useEffect(() => {
        fetchRecords();
        fetchContractStatus();
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
            const message = "Login and generate my HealthRecord key";
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
                toast.warning('Record encrypted and saved, but blockchain storage unavailable (contract deployment failed)');
            } else if (!result.data.contractAddress) {
                toast.info('Record encrypted and saved. Contract deployment may still be in progress.');
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
                        <p className="status-note">Your medical records will be automatically stored on blockchain with integrity verification.</p>
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
                {getContractStatusDisplay()}
            </div>
            <Footer />
        </>
    );
};

export default MedicalRecords; 