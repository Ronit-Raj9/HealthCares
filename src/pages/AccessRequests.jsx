import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import fetchData from '../helper/authApi';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import '../styles/accessrequests.css';
import { useAccount, useSignMessage } from 'wagmi';
import { ENCRYPTION_KEY_MESSAGE, BACKEND_URL } from '../utils/constants';

const AccessRequests = () => {
    const [accessRequests, setAccessRequests] = useState([]);
    const [extensionRequests, setExtensionRequests] = useState([]);
    const [authorizedAccess, setAuthorizedAccess] = useState([]);
    const [accessMonitoring, setAccessMonitoring] = useState(null);
    const [activeTab, setActiveTab] = useState('requests'); // 'requests', 'extensions', 'authorized', 'monitoring'
    const [loading, setLoading] = useState(true);
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [myRecords, setMyRecords] = useState([]);
    const [selectedRecords, setSelectedRecords] = useState([]);
    const [patientNotes, setPatientNotes] = useState('');
    const [responseLoading, setResponseLoading] = useState(false);
    const [accessDuration, setAccessDuration] = useState('30'); // Default 30 days
    
    const { isConnected } = useAccount();
    const { signMessageAsync } = useSignMessage();

    useEffect(() => {
        if (activeTab === 'requests') {
            fetchAccessRequests();
        } else if (activeTab === 'extensions') {
            fetchExtensionRequests();
        } else if (activeTab === 'authorized') {
            fetchAuthorizedAccess();
        } else if (activeTab === 'monitoring') {
            fetchAccessMonitoring();
        }
        fetchMyRecords();
    }, [activeTab]);

    // Fetch pending access requests for this patient
    const fetchAccessRequests = async () => {
        setLoading(true);
        try {
            const response = await fetchData(`${BACKEND_URL}/api/access-requests/patient/requests`);
            setAccessRequests(response.data);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Error fetching access requests');
        } finally {
            setLoading(false);
        }
    };

    // Fetch extension requests for this patient
    const fetchExtensionRequests = async () => {
        setLoading(true);
        try {
            const response = await fetchData(`${BACKEND_URL}/api/access-requests/patient/extension-requests`);
            setExtensionRequests(response.data);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Error fetching extension requests');
        } finally {
            setLoading(false);
        }
    };

    // Fetch authorized access for this patient
    const fetchAuthorizedAccess = async () => {
        setLoading(true);
        try {
            const response = await fetchData(`${BACKEND_URL}/api/access-requests/patient/authorized-access`);
            setAuthorizedAccess(response.data);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Error fetching authorized access');
        } finally {
            setLoading(false);
        }
    };

    // Fetch access monitoring data for this patient
    const fetchAccessMonitoring = async () => {
        setLoading(true);
        try {
            const response = await fetchData(`${BACKEND_URL}/api/access-requests/patient/access-monitoring`);
            setAccessMonitoring(response.data);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Error fetching access monitoring data');
        } finally {
            setLoading(false);
        }
    };

    // Fetch patient's medical records for selection
    const fetchMyRecords = async () => {
        try {
            const response = await fetchData(`${BACKEND_URL}/api/medical-records/patient-records`);
            setMyRecords(response.data);
        } catch (error) {
            console.error('Error fetching records:', error);
        }
    };

    // Handle record selection for access request approval
    const handleRecordToggle = (recordId) => {
        setSelectedRecords(prev => {
            if (prev.includes(recordId)) {
                return prev.filter(id => id !== recordId);
            } else {
                return [...prev, recordId];
            }
        });
    };

    // Approve access request with selected records
    const handleApproveRequest = async (requestId) => {
        if (selectedRecords.length === 0) {
            return toast.error('Please select at least one record to grant access');
        }

        if (!isConnected) {
            return toast.error('Please connect your wallet to approve access requests');
        }

        // Validate access duration
        const durationValue = parseInt(accessDuration);
        if (!durationValue || durationValue < 1 || durationValue > 365) {
            return toast.error('Please select a valid access duration');
        }

        setResponseLoading(true);
        try {
            // Generate patient signature for encryption key derivation
            // IMPORTANT: Use the SAME message as file encryption to ensure same key
            const message = ENCRYPTION_KEY_MESSAGE;
            const patientSignature = await signMessageAsync({ message });

            console.log('Approving access request:', {
                requestId,
                selectedRecords: selectedRecords.length,
                accessDuration: durationValue,
                accessDurationDays: `${durationValue} days`
            });

            await fetchData(
                `${BACKEND_URL}/api/access-requests/patient/respond`,
                'POST',
                {
                    requestId,
                    action: 'approve',
                    selectedRecords,
                    patientNotes: patientNotes.trim() || undefined,
                    accessDuration: durationValue,
                    patientSignature
                }
            );
            toast.success(`Access approved successfully for ${durationValue} days!`);
            setSelectedRequest(null);
            setSelectedRecords([]);
            setPatientNotes('');
            setAccessDuration('30');
            fetchAccessRequests();
            if (activeTab === 'authorized') {
                fetchAuthorizedAccess();
            }
        } catch (error) {
            console.error('Access approval error:', error);
            toast.error(error.response?.data?.message || 'Error approving request');
        } finally {
            setResponseLoading(false);
        }
    };

    // Deny access request
    const handleDenyRequest = async (requestId) => {
        const reason = prompt('Please provide a reason for denying this request (optional):');
        
        setResponseLoading(true);
        try {
            await fetchData(
                `${BACKEND_URL}/api/access-requests/patient/respond`,
                'POST',
                {
                    requestId,
                    action: 'deny',
                    patientNotes: reason || 'Request denied by patient'
                }
            );
            toast.success('Access request denied');
            fetchAccessRequests();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Error denying request');
        } finally {
            setResponseLoading(false);
        }
    };

    // Handle extension request approval
    const handleApproveExtension = async (requestId, currentDuration) => {
        if (!isConnected) {
            return toast.error('Please connect your wallet to approve extensions');
        }

        const newDuration = prompt(`Current access duration: ${currentDuration} days\nEnter new duration in days (7-365):`, '90');
        if (!newDuration || isNaN(newDuration) || newDuration < 7 || newDuration > 365) {
            return toast.error('Please enter a valid duration between 7-365 days');
        }

        setResponseLoading(true);
        try {
            await fetchData(
                `${BACKEND_URL}/api/access-requests/patient/approve-extension`,
                'POST',
                {
                    requestId,
                    newDuration: parseInt(newDuration)
                }
            );
            toast.success('Access extension approved successfully');
            fetchExtensionRequests();
            if (activeTab === 'authorized') {
                fetchAuthorizedAccess();
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Error approving extension');
        } finally {
            setResponseLoading(false);
        }
    };

    // Handle extension request denial
    const handleDenyExtension = async (requestId) => {
        const reason = prompt('Please provide a reason for denying this extension request (optional):');
        
        setResponseLoading(true);
        try {
            await fetchData(
                `${BACKEND_URL}/api/access-requests/patient/deny-extension`,
                'POST',
                {
                    requestId,
                    reason: reason || 'Extension denied by patient'
                }
            );
            toast.success('Access extension denied');
            fetchExtensionRequests();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Error denying extension');
        } finally {
            setResponseLoading(false);
        }
    };

    // Revoke access for a specific doctor
    const handleRevokeAccess = async (accessRequestId, doctorName) => {
        if (!confirm(`Are you sure you want to revoke access for Dr. ${doctorName}? This action cannot be undone.`)) {
            return;
        }

        setResponseLoading(true);
        try {
            await fetchData(
                `${BACKEND_URL}/api/access-requests/revoke/${accessRequestId}`,
                'DELETE'
            );
            toast.success(`Access revoked for Dr. ${doctorName}`);
            fetchAuthorizedAccess();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Error revoking access');
        } finally {
            setResponseLoading(false);
        }
    };

    // Revoke all access for a doctor
    const handleRevokeCompleteAccess = async (doctorId, doctorName) => {
        if (!confirm(`Are you sure you want to revoke ALL access for Dr. ${doctorName}? This will revoke access to all your records for this doctor and cannot be undone.`)) {
            return;
        }

        setResponseLoading(true);
        try {
            await fetchData(
                `${BACKEND_URL}/api/access-requests/revoke-complete/${doctorId}`,
                'DELETE'
            );
            toast.success(`All access revoked for Dr. ${doctorName}`);
            fetchAuthorizedAccess();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Error revoking complete access');
        } finally {
            setResponseLoading(false);
        }
    };

    if (loading) {
        return (
            <>
                <Navbar />
                <div className="access-requests-container">
                    <div className="loading">Loading...</div>
                </div>
                <Footer />
            </>
        );
    }

    return (
        <>
            <Navbar />
            <div className="access-requests-container">
                <div className="page-header">
                    <h1>Access Management</h1>
                    <p>Manage doctor requests, extensions, and revoke access to your medical records</p>
                    {!isConnected && (
                        <div className="wallet-warning">
                            <p>⚠️ Connect your wallet to manage access requests and enable secure record sharing</p>
                        </div>
                    )}
                </div>

                {/* Tab Navigation */}
                <div className="tab-navigation">
                    <button 
                        className={`tab-btn ${activeTab === 'requests' ? 'active' : ''}`}
                        onClick={() => setActiveTab('requests')}
                    >
                        📥 Pending Requests ({accessRequests.filter(r => r.status === 'pending').length})
                    </button>
                    <button 
                        className={`tab-btn ${activeTab === 'extensions' ? 'active' : ''}`}
                        onClick={() => setActiveTab('extensions')}
                    >
                        ⏰ Extension Requests ({extensionRequests.length})
                    </button>
                    <button 
                        className={`tab-btn ${activeTab === 'authorized' ? 'active' : ''}`}
                        onClick={() => setActiveTab('authorized')}
                    >
                        ✅ Authorized Access ({authorizedAccess.length})
                    </button>
                    <button 
                        className={`tab-btn ${activeTab === 'monitoring' ? 'active' : ''}`}
                        onClick={() => setActiveTab('monitoring')}
                    >
                        👁️ Access Monitoring
                    </button>
                </div>

                {/* Pending Access Requests Tab */}
                {activeTab === 'requests' && (
                    <div className="requests-section">
                        {accessRequests.length === 0 ? (
                            <div className="no-requests">
                                <div className="empty-state">
                                    <h3>No Pending Access Requests</h3>
                                    <p>You don't have any pending access requests at the moment.</p>
                                    <p>Doctors will appear here when they request access to your medical records.</p>
                                </div>
                            </div>
                        ) : (
                            <div className="requests-list">
                                {accessRequests.map(request => (
                                    <div key={request._id} className="request-item">
                                        <div className="request-header">
                                            <div className="doctor-info">
                                                <img 
                                                    src={request.doctorId?.image || '/default-doctor.png'} 
                                                    alt={request.doctorId?.name}
                                                    className="doctor-avatar"
                                                />
                                                <div className="doctor-details">
                                                    <h4>Dr. {request.doctorId?.name}</h4>
                                                    <p className="doctor-email">{request.doctorId?.email}</p>
                                                    <p className="specialization">{request.doctorId?.specialization}</p>
                                                </div>
                                            </div>
                                            <div className="request-meta">
                                                <span className={`status-badge ${request.status}`}>
                                                    {request.status}
                                                </span>
                                                <p className="request-date">
                                                    {new Date(request.requestedAt).toLocaleDateString()}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="request-content">
                                            <div className="request-reason">
                                                <h5>Reason for Request:</h5>
                                                <p>{request.requestReason}</p>
                                            </div>

                                            {request.status === 'pending' && (
                                                <div className="request-actions">
                                                    <button
                                                        onClick={() => setSelectedRequest(request._id)}
                                                        className="review-btn"
                                                    >
                                                        📋 Review & Respond
                                                    </button>
                                                    <button
                                                        onClick={() => handleDenyRequest(request._id)}
                                                        disabled={responseLoading}
                                                        className="deny-btn quick-deny"
                                                    >
                                                        ❌ Quick Deny
                                                    </button>
                                                </div>
                                            )}

                                            {request.status !== 'pending' && (
                                                <div className="request-response">
                                                    <p><strong>Response:</strong> {request.status}</p>
                                                    <p><strong>Responded on:</strong> {new Date(request.respondedAt).toLocaleDateString()}</p>
                                                    {request.patientNotes && (
                                                        <p><strong>Your notes:</strong> {request.patientNotes}</p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Extension Requests Tab */}
                {activeTab === 'extensions' && (
                    <div className="extensions-section">
                        <h3>Access Extension Requests</h3>
                        <p className="section-description">
                            Doctors can request to extend their access duration to your medical records.
                        </p>
                        {extensionRequests.length === 0 ? (
                            <div className="no-requests">
                                <div className="empty-state">
                                    <h3>No Extension Requests</h3>
                                    <p>No doctors have requested access extensions at this time.</p>
                                </div>
                            </div>
                        ) : (
                            <div className="extension-requests-list">
                                {extensionRequests.map(request => (
                                    <div key={request._id} className="extension-request-item">
                                        <div className="request-header">
                                            <div className="doctor-info">
                                                <img 
                                                    src={request.doctorId?.image || '/default-doctor.png'} 
                                                    alt={request.doctorId?.name}
                                                    className="doctor-avatar"
                                                />
                                                <div className="doctor-details">
                                                    <h4>Dr. {request.doctorId?.name}</h4>
                                                    <p className="doctor-email">{request.doctorId?.email}</p>
                                                    <p className="specialization">{request.doctorId?.specialization}</p>
                                                </div>
                                            </div>
                                            <div className="request-meta">
                                                <span className={`status-badge ${request.status}`}>
                                                    {request.status}
                                                </span>
                                                <p className="request-date">
                                                    Requested: {new Date(request.requestedAt).toLocaleDateString()}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="extension-content">
                                            <div className="extension-details">
                                                <p><strong>Current Access Duration:</strong> {request.currentDuration} days</p>
                                                <p><strong>Requested Extension:</strong> {request.requestedExtension} days</p>
                                                <p><strong>Current Expiry:</strong> {new Date(request.currentExpiryDate).toLocaleDateString()}</p>
                                                <p><strong>Reason:</strong> {request.extensionReason}</p>
                                            </div>

                                            {request.status === 'pending' && (
                                                <div className="extension-actions">
                                                    <button
                                                        onClick={() => handleApproveExtension(request._id, request.currentDuration)}
                                                        disabled={responseLoading || !isConnected}
                                                        className="approve-btn"
                                                    >
                                                        ✅ Approve Extension
                                                    </button>
                                                    <button
                                                        onClick={() => handleDenyExtension(request._id)}
                                                        disabled={responseLoading}
                                                        className="deny-btn"
                                                    >
                                                        ❌ Deny Extension
                                                    </button>
                                                </div>
                                            )}

                                            {request.status !== 'pending' && (
                                                <div className="extension-response">
                                                    <p><strong>Status:</strong> {request.status}</p>
                                                    {request.respondedAt && (
                                                        <p><strong>Responded:</strong> {new Date(request.respondedAt).toLocaleDateString()}</p>
                                                    )}
                                                    {request.newDuration && (
                                                        <p><strong>New Duration:</strong> {request.newDuration} days</p>
                                                    )}
                                                    {request.reason && (
                                                        <p><strong>Your reason:</strong> {request.reason}</p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Authorized Access Tab */}
                {activeTab === 'authorized' && (
                    <div className="authorized-section">
                        <h3>Current Authorized Access</h3>
                        <p className="section-description">
                            Doctors who currently have access to your medical records. You can revoke access at any time.
                        </p>
                        {authorizedAccess.length === 0 ? (
                            <div className="no-requests">
                                <div className="empty-state">
                                    <h3>No Authorized Access</h3>
                                    <p>No doctors currently have access to your medical records.</p>
                                </div>
                            </div>
                        ) : (
                            <div className="authorized-access-list">
                                {authorizedAccess.map(access => (
                                    <div key={access._id} className="authorized-access-item">
                                        <div className="access-header">
                                            <div className="doctor-info">
                                                <img 
                                                    src={access.doctorId?.image || '/default-doctor.png'} 
                                                    alt={access.doctorId?.name}
                                                    className="doctor-avatar"
                                                />
                                                <div className="doctor-details">
                                                    <h4>Dr. {access.doctorId?.name}</h4>
                                                    <p className="doctor-email">{access.doctorId?.email}</p>
                                                    <p className="specialization">{access.doctorId?.specialization}</p>
                                                </div>
                                            </div>
                                            <div className="access-meta">
                                                <span className={`status-badge ${access.status}`}>
                                                    {access.status}
                                                </span>
                                                <p className="access-date">
                                                    Granted: {new Date(access.approvedAt).toLocaleDateString()}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="access-content">
                                            <div className="access-details">
                                                <p><strong>Access Duration:</strong> {access.accessDuration ? `${access.accessDuration} days` : 'Not specified'}</p>
                                                <p><strong>Expires:</strong> {
                                                    access.accessExpiresAt ? 
                                                        new Date(access.accessExpiresAt).toLocaleDateString() : 
                                                        'Never'
                                                }</p>
                                                <p><strong>Status:</strong> 
                                                    <span className={`access-status ${access.isExpired ? 'expired' : 'active'}`}>
                                                        {access.isExpired ? '❌ Expired' : '✅ Active'}
                                                    </span>
                                                </p>
                                                <p><strong>Records Access:</strong> {access.recordsCount || 0} records</p>
                                                <p><strong>Original Reason:</strong> {access.requestReason}</p>
                                                {access.patientNotes && (
                                                    <p><strong>Your Notes:</strong> {access.patientNotes}</p>
                                                )}
                                                {access.extensionRequestsCount > 0 && (
                                                    <p><strong>Pending Extensions:</strong> {access.extensionRequestsCount}</p>
                                                )}
                                            </div>

                                            <div className="access-actions">
                                                <button
                                                    onClick={() => handleRevokeAccess(access._id, access.doctorId?.name)}
                                                    disabled={responseLoading}
                                                    className="revoke-btn"
                                                >
                                                    🚫 Revoke This Access
                                                </button>
                                                <button
                                                    onClick={() => handleRevokeCompleteAccess(access.doctorId?._id, access.doctorId?.name)}
                                                    disabled={responseLoading}
                                                    className="revoke-all-btn"
                                                >
                                                    🛑 Revoke All Access
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Access Monitoring Tab */}
                {activeTab === 'monitoring' && (
                    <div className="monitoring-section">
                        <h3>Access Monitoring Dashboard</h3>
                        <p className="section-description">
                            Real-time monitoring of doctor access to your medical records with blockchain verification.
                        </p>
                        
                        {loading ? (
                            <div className="loading-state">
                                <p>⏳ Loading access monitoring data...</p>
                            </div>
                        ) : !accessMonitoring ? (
                            <div className="no-data">
                                <div className="empty-state">
                                    <h3>No Monitoring Data</h3>
                                    <p>Unable to fetch access monitoring data. Please try again later.</p>
                                </div>
                            </div>
                        ) : (
                            <div className="monitoring-dashboard">
                                {/* Contract Status */}
                                <div className="contract-status-card">
                                    <h4>📋 Contract Status</h4>
                                    <div className="status-grid">
                                        <div className="status-item">
                                            <span className="status-label">Contract Deployed:</span>
                                            <span className={`status-value ${accessMonitoring.contractDeployed ? 'success' : 'warning'}`}>
                                                {accessMonitoring.contractDeployed ? '✅ Yes' : '⚠️ No'}
                                            </span>
                                        </div>
                                        {accessMonitoring.contractAddress && (
                                            <div className="status-item">
                                                <span className="status-label">Contract Address:</span>
                                                <span className="status-value">
                                                    {accessMonitoring.contractAddress.slice(0, 6)}...{accessMonitoring.contractAddress.slice(-4)}
                                                </span>
                                            </div>
                                        )}
                                        <div className="status-item">
                                            <span className="status-label">Last Updated:</span>
                                            <span className="status-value">
                                                {new Date(accessMonitoring.lastChecked).toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                </div>



                                {/* Individual Access Monitoring */}
                                <div className="access-list-card">
                                    <h4>🔍 Individual Access Status</h4>
                                    {(!accessMonitoring.accessMonitoring || accessMonitoring.accessMonitoring.length === 0) ? (
                                        <div className="no-monitoring">
                                            <p>No active access grants to monitor</p>
                                        </div>
                                    ) : (
                                        <div className="monitoring-list">
                                            {accessMonitoring.accessMonitoring.map(access => (
                                                <div key={access.id} className="monitoring-item">
                                                    <div className="monitoring-header">
                                                        <div className="doctor-info">
                                                            <h5>Dr. {access.doctor.name}</h5>
                                                            <p className="doctor-email">{access.doctor.email}</p>
                                                            <p className="specialization">{access.doctor.specialization}</p>
                                                        </div>
                                                        <div className="monitoring-status">
                                                            <span className={`consistency-badge ${
                                                                access.isConsistent === null ? 'unknown' :
                                                                access.isConsistent === 'limitation' ? 'info' : // New status for blockchain limitations
                                                                access.isConsistent ? 'consistent' : 'inconsistent'
                                                            }`}>
                                                                {access.isConsistent === null ? '🔄 No Blockchain' :
                                                                 access.isConsistent === 'limitation' ? '🔄 Blockchain Limitation' :
                                                                 access.isConsistent ? '✅ Consistent' : '⚠️ Inconsistent'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="monitoring-details">
                                                        <div className="database-status">
                                                            <h6>📊 Database Status</h6>
                                                            <p><strong>Expires:</strong> {new Date(access.databaseStatus.expiresAt).toLocaleDateString()}</p>
                                                            <p><strong>Status:</strong> 
                                                                <span className={`status ${access.databaseStatus.isExpired ? 'expired' : 'active'}`}>
                                                                    {access.databaseStatus.isExpired ? '❌ Expired' : '✅ Active'}
                                                                </span>
                                                            </p>
                                                            <p><strong>Records:</strong> {access.databaseStatus.recordsCount}</p>
                                                            {access.databaseStatus.pendingExtensions > 0 && (
                                                                <p><strong>Pending Extensions:</strong> {access.databaseStatus.pendingExtensions}</p>
                                                            )}
                                                        </div>
                                                        
                                                        {access.blockchainStatus && (
                                                            <div className="blockchain-status">
                                                                <h6>⛓️ Blockchain Status</h6>
                                                                {access.blockchainStatus.error ? (
                                                                    <p className="error">Error: {access.blockchainStatus.error}</p>
                                                                ) : access.blockchainStatus.blockchainLimitation ? (
                                                                    <div className="blockchain-limitation">
                                                                        <p><strong>Status:</strong> 
                                                                            <span className="status info">🔄 Cannot Monitor from Backend</span>
                                                                        </p>
                                                                        <p className="limitation-note">
                                                                            Smart contract requires doctor's wallet to check access status.
                                                                            Doctor must verify access directly using their wallet.
                                                                        </p>
                                                                        {access.blockchainStatus.extensionRequest && (
                                                                            <p><strong>Extension Request:</strong> 
                                                                                {access.blockchainStatus.extensionRequest.additionalTime / (24 * 60 * 60)} days pending
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <>
                                                                        <p><strong>Has Expired:</strong> 
                                                                            <span className={`status ${access.blockchainStatus.hasExpired ? 'expired' : 'active'}`}>
                                                                                {access.blockchainStatus.hasExpired ? '❌ Yes' : '✅ No'}
                                                                            </span>
                                                                        </p>
                                                                        <p><strong>Active Access:</strong> 
                                                                            <span className={`status ${access.blockchainStatus.hasActiveAccess ? 'active' : 'expired'}`}>
                                                                                {access.blockchainStatus.hasActiveAccess ? '✅ Yes' : '❌ No'}
                                                                            </span>
                                                                        </p>
                                                                        {access.blockchainStatus.extensionRequest && (
                                                                            <p><strong>Extension Request:</strong> 
                                                                                {access.blockchainStatus.extensionRequest.additionalTime / (24 * 60 * 60)} days pending
                                                                            </p>
                                                                        )}
                                                                    </>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Record selection modal */}
                {selectedRequest && (
                    <div className="modal-overlay">
                        <div className="record-selection-modal">
                            <div className="modal-header">
                                <h3>Select Records to Share</h3>
                                <button 
                                    onClick={() => {
                                        setSelectedRequest(null);
                                        setSelectedRecords([]);
                                        setPatientNotes('');
                                        setAccessDuration('30');
                                    }}
                                    className="close-btn"
                                >
                                    ✕
                                </button>
                            </div>

                            <div className="modal-content">
                                <p>Choose which medical records you want to grant access to:</p>
                                
                                <div className="records-selection">
                                    {myRecords.length === 0 ? (
                                        <p>You don't have any medical records yet.</p>
                                    ) : (
                                        myRecords.map(record => (
                                            <div key={record._id} className="record-checkbox">
                                                <label>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedRecords.includes(record._id)}
                                                        onChange={() => handleRecordToggle(record._id)}
                                                    />
                                                    <div className="record-info">
                                                        <h5>{record.name}</h5>
                                                        <p>Type: {record.recordType}</p>
                                                        <p>Date: {new Date(record.dateCreated).toLocaleDateString()}</p>
                                                        <p>Description: {record.description}</p>
                                                    </div>
                                                </label>
                                            </div>
                                        ))
                                    )}
                                </div>

                                <div className="access-duration">
                                    <label>Access Duration:</label>
                                    <select
                                        value={accessDuration}
                                        onChange={(e) => setAccessDuration(e.target.value)}
                                        className="duration-select"
                                    >
                                        <option value="7">7 Days</option>
                                        <option value="14">14 Days</option>
                                        <option value="30">30 Days (Default)</option>
                                        <option value="60">60 Days</option>
                                        <option value="90">90 Days</option>
                                        <option value="365">1 Year</option>
                                    </select>
                                </div>

                                <div className="patient-notes">
                                    <label>Additional Notes (Optional):</label>
                                    <textarea
                                        value={patientNotes}
                                        onChange={(e) => setPatientNotes(e.target.value)}
                                        placeholder="Add any notes or instructions for the doctor..."
                                        rows="3"
                                    />
                                </div>

                                <div className="modal-actions">
                                    <button
                                        onClick={() => handleApproveRequest(selectedRequest)}
                                        disabled={responseLoading || selectedRecords.length === 0}
                                        className="approve-btn"
                                    >
                                        {responseLoading ? '⏳ Approving...' : `✅ Approve Access (${selectedRecords.length} records)`}
                                    </button>
                                    <button
                                        onClick={() => handleDenyRequest(selectedRequest)}
                                        disabled={responseLoading}
                                        className="deny-btn"
                                    >
                                        {responseLoading ? '⏳ Processing...' : '❌ Deny Request'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            <Footer />
        </>
    );
};

export default AccessRequests; 