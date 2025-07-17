import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { toast } from 'react-hot-toast';
import fetchData from '../helper/authApi';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import '../styles/authorizedrecords.css';
import { useAccount, useSignMessage } from 'wagmi';

const BACKEND_URL = 'http://localhost:5000';

const AuthorizedRecords = () => {
    // State management
    const [activeTab, setActiveTab] = useState('search'); // 'search', 'requests', 'authorized'
    const [searchTerm, setSearchTerm] = useState('');
    const [patients, setPatients] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [authorizedRecords, setAuthorizedRecords] = useState([]);
    const [requestLoading, setRequestLoading] = useState(false);
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [myRequests, setMyRequests] = useState([]);
    
    const { userInfo } = useSelector(state => state.root);
    const { isConnected, address } = useAccount();
    const { signMessageAsync } = useSignMessage();

    useEffect(() => {
        // Check if user is a doctor
        const doctorData = localStorage.getItem("doctor");
        const patientData = localStorage.getItem("patient");
        
        if (!doctorData && patientData) {
            toast.error('This page is only accessible to doctors. Please login as a doctor.');
            window.location.href = '/';
            return;
        }

        if (!doctorData) {
            toast.error('Please login as a doctor to access this page.');
            window.location.href = '/login';
            return;
        }

        if (activeTab === 'authorized') {
            fetchAuthorizedRecords();
        } else if (activeTab === 'requests') {
            fetchMyRequests();
        }
    }, [activeTab]);

    // Search patients by name or email
    const searchPatients = async () => {
        if (!searchTerm.trim()) {
            toast.error('Please enter a patient name or email');
            return;
        }

        setSearchLoading(true);
        try {
            const response = await fetchData(`${BACKEND_URL}/api/doctors/search-patients?term=${encodeURIComponent(searchTerm)}`);
            setPatients(response.data);
        } catch (error) {
            console.error('Search error:', error);
            toast.error(error.response?.data?.message || 'Error searching patients');
            setPatients([]);
        } finally {
            setSearchLoading(false);
        }
    };

    // Fetch authorized records
    const fetchAuthorizedRecords = async () => {
        try {
            const response = await fetchData(`${BACKEND_URL}/api/access-requests/doctor/authorized-records`);
            setAuthorizedRecords(response.data);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Error fetching authorized records');
        }
    };

    // Fetch my access requests
    const fetchMyRequests = async () => {
        try {
            const response = await fetchData(`${BACKEND_URL}/api/access-requests/doctor/requests`);
            setMyRequests(response.data);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Error fetching access requests');
        }
    };

    // Request access to patient records
    const requestAccess = async (patientId, patientName) => {
        // Check wallet connection first
        if (!isConnected || !address) {
            toast.error('Please connect your wallet before sending access requests');
            return;
        }

        setRequestLoading(true);
        try {
            const reason = prompt(`Please provide a reason for requesting access to ${patientName}'s records:`);
            if (!reason) {
                setRequestLoading(false);
                return;
            }

            const response = await fetchData(`${BACKEND_URL}/api/access-requests/doctor/request`, 'POST', {
                patientId,
                requestReason: reason,
                requestType: 'all_records',
                walletAddress: address
            });

            toast.success('Access request sent successfully!');
            setActiveTab('requests');
            fetchMyRequests();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Error sending access request');
        } finally {
            setRequestLoading(false);
        }
    };

    // View authorized record with integrity verification
    const viewRecord = async (record) => {
        if (!isConnected) {
            toast.error('Please connect your wallet to view encrypted records');
            return;
        }

        try {
            // Generate doctor's encrypted symmetric key for this record
            const message = `Access medical record ${record._id}`;
            const signature = await signMessageAsync({ message });
            
            const response = await fetchData(
                `${BACKEND_URL}/api/medical-records/view/${record.ipfsHash}?encryptedSymmetricKey=${encodeURIComponent(signature)}`,
                'GET',
                null,
                { responseType: 'blob' }
            );
            
            // Check comprehensive integrity verification
            const headers = response.headers || {};
            const localHashVerified = headers['x-local-hash-verified'] === 'true';
            const blockchainHashVerified = headers['x-blockchain-hash-verified'] === 'true';
            const blockchainMessage = headers['x-blockchain-message'] || '';
            const overallIntegrityVerified = headers['x-integrity-verified'] === 'true';
            
            // Display comprehensive verification results
            if (overallIntegrityVerified && localHashVerified && blockchainHashVerified) {
                toast.success('✅ Complete integrity verification passed\n🔐 Local hash verified\n⛓️ Blockchain hash verified');
            } else if (localHashVerified && !blockchainHashVerified) {
                toast.warning(`⚠️ Partial verification:\n✅ Local hash verified\n⚠️ Blockchain: ${blockchainMessage}`);
            } else if (!localHashVerified) {
                toast.error('❌ INTEGRITY FAILURE: Local hash verification failed!\nFile may be corrupted or tampered with.');
                return; // Don't download if local hash fails
            } else {
                toast.warning(`⚠️ Verification results:\n${blockchainMessage}`);
            }

            // Create download
            const blob = new Blob([response.data]);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = record.originalFilename || record.name;
            a.click();
            window.URL.revokeObjectURL(url);

            // Log verification details for debugging
            console.log('Integrity Verification:', {
                overall: overallIntegrityVerified,
                localHash: localHashVerified,
                blockchainHash: blockchainHashVerified,
                message: blockchainMessage
            });

        } catch (error) {
            console.error('Error viewing record:', error);
            toast.error('Error viewing record: ' + (error.response?.data?.message || error.message));
        }
    };

    return (
        <>
            <Navbar />
            <div className="authorized-records-container">
                <div className="page-header">
                    <h1>Patient Records</h1>
                    <p>Search patients, request access to medical records, and view authorized documents</p>
                    {isConnected ? (
                        <div className="wallet-status connected">
                            <span>✅ Wallet Connected: {address?.slice(0, 6)}...{address?.slice(-4)}</span>
                        </div>
                    ) : (
                        <div className="wallet-status disconnected">
                            <span>⚠️ Wallet Not Connected - Connect wallet to send access requests</span>
                        </div>
                    )}
                </div>

                {/* Tab Navigation */}
                <div className="tab-navigation">
                    <button 
                        className={`tab-btn ${activeTab === 'search' ? 'active' : ''}`}
                        onClick={() => setActiveTab('search')}
                    >
                        🔍 Search Patients
                    </button>
                    <button 
                        className={`tab-btn ${activeTab === 'requests' ? 'active' : ''}`}
                        onClick={() => setActiveTab('requests')}
                    >
                        📋 My Requests ({myRequests.length})
                    </button>
                    <button 
                        className={`tab-btn ${activeTab === 'authorized' ? 'active' : ''}`}
                        onClick={() => setActiveTab('authorized')}
                    >
                        ✅ Authorized Records ({authorizedRecords.length})
                    </button>
                </div>

                {/* Search Patients Tab */}
                {activeTab === 'search' && (
                    <div className="search-section">
                        {!isConnected && (
                            <div className="wallet-warning">
                                <p>⚠️ Please connect your wallet to search patients and send access requests</p>
                            </div>
                        )}
                        
                        <div className="search-form">
                            <div className="search-input-group">
                                <input
                                    type="text"
                                    placeholder="Search patients by name or email..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && searchPatients()}
                                    className="search-input"
                                    disabled={!isConnected}
                                />
                                <button 
                                    onClick={searchPatients}
                                    disabled={searchLoading || !isConnected}
                                    className="search-btn"
                                >
                                    {searchLoading ? '🔄 Searching...' : '🔍 Search'}
                                </button>
                            </div>
                        </div>

                        {/* Search Results */}
                        {patients.length > 0 && (
                            <div className="search-results">
                                <h3>Search Results ({patients.length} found)</h3>
                                {!isConnected && (
                                    <div className="info-message">
                                        <p>💡 Connect your wallet to send access requests to these patients</p>
                                    </div>
                                )}
                                <div className="patients-grid">
                                    {patients.map(patient => (
                                        <div key={patient._id} className="patient-card">
                                            <div className="patient-info">
                                                <img 
                                                    src={patient.image || '/default-avatar.png'} 
                                                    alt={patient.name}
                                                    className="patient-avatar"
                                                />
                                                <div className="patient-details">
                                                    <h4>{patient.name}</h4>
                                                    <p className="patient-email">{patient.email}</p>
                                                    <p className="patient-meta">
                                                        Age: {patient.age || 'N/A'} | 
                                                        Gender: {patient.gender || 'N/A'} |
                                                        Blood Group: {patient.bloodGroup || 'N/A'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="patient-actions">
                                                <button
                                                    onClick={() => requestAccess(patient._id, patient.name)}
                                                    disabled={requestLoading || !isConnected}
                                                    className="request-access-btn"
                                                    title={!isConnected ? 'Please connect your wallet first' : 'Send access request'}
                                                >
                                                    {!isConnected ? '🔒 Connect Wallet First' : '📨 Request Access'}
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {searchTerm && patients.length === 0 && !searchLoading && (
                            <div className="no-results">
                                <p>No patients found matching "{searchTerm}"</p>
                            </div>
                        )}
                    </div>
                )}

                {/* My Requests Tab */}
                {activeTab === 'requests' && (
                    <div className="requests-section">
                        <h3>My Access Requests</h3>
                        {myRequests.length === 0 ? (
                            <div className="no-requests">
                                <p>No access requests found</p>
                                <p>Search for patients and request access to their medical records</p>
                            </div>
                        ) : (
                            <div className="requests-grid">
                                {myRequests.map(request => (
                                    <div key={request._id} className="request-card">
                                        <div className="request-header">
                                            <h4>Request to {request.patientId?.name}</h4>
                                            <span className={`status-badge ${request.status}`}>
                                                {request.status}
                                            </span>
                                        </div>
                                        <div className="request-details">
                                            <p><strong>Patient:</strong> {request.patientId?.email}</p>
                                            <p><strong>Reason:</strong> {request.requestReason}</p>
                                            <p><strong>Requested:</strong> {new Date(request.requestedAt).toLocaleDateString()}</p>
                                            {request.respondedAt && (
                                                <p><strong>Responded:</strong> {new Date(request.respondedAt).toLocaleDateString()}</p>
                                            )}
                                            {request.patientNotes && (
                                                <p><strong>Patient Notes:</strong> {request.patientNotes}</p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Authorized Records Tab */}
                {activeTab === 'authorized' && (
                    <div className="authorized-section">
                        <h3>Authorized Medical Records</h3>
                        {!isConnected && (
                            <div className="wallet-warning">
                                <p>⚠️ Connect your wallet to view and verify encrypted medical records</p>
                            </div>
                        )}
                        {authorizedRecords.length === 0 ? (
                            <div className="no-records">
                                <p>No authorized records found</p>
                                <p>Send access requests to patients to view their medical records</p>
                            </div>
                        ) : (
                            <div className="records-grid">
                                {authorizedRecords.map(record => (
                                    <div key={record._id} className="record-card">
                                        <div className="record-header">
                                            <h4>{record.name}</h4>
                                            <div className="record-badges">
                                                <span className={`badge ${record.recordType}`}>
                                                    {record.recordType}
                                                </span>
                                                {record.isEncrypted && (
                                                    <span className="badge encrypted">🔐 Encrypted</span>
                                                )}
                                                {record.recordId_onchain && (
                                                    <span className="badge blockchain">⛓️ Blockchain</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="record-info">
                                            <p><strong>Patient:</strong> {record.patientName}</p>
                                            <p><strong>Description:</strong> {record.description || 'No description'}</p>
                                            <p><strong>Original File:</strong> {record.originalFilename}</p>
                                            <p><strong>Access Expires:</strong> {new Date(record.accessExpiresAt).toLocaleDateString()}</p>
                                        </div>
                                        <div className="record-actions">
                                            <button
                                                onClick={() => viewRecord(record)}
                                                disabled={!isConnected}
                                                className="view-record-btn"
                                            >
                                                🔍 View & Verify Record
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
            <Footer />
        </>
    );
};

export default AuthorizedRecords; 