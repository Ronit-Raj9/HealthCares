import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { toast } from 'react-hot-toast';
import fetchData from '../helper/authApi';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import '../styles/accessrequests.css';
import { useAccount, useSignMessage } from 'wagmi';

const BACKEND_URL = 'http://localhost:5000';

const AccessRequests = () => {
    const [accessRequests, setAccessRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [myRecords, setMyRecords] = useState([]);
    const [selectedRecords, setSelectedRecords] = useState([]);
    const [patientNotes, setPatientNotes] = useState('');
    const [responseLoading, setResponseLoading] = useState(false);
    const [accessDuration, setAccessDuration] = useState('30'); // Default 30 days
    
    const { userInfo } = useSelector(state => state.root);
    const { isConnected } = useAccount();
    const { signMessageAsync } = useSignMessage();

    useEffect(() => {
        fetchAccessRequests();
        fetchMyRecords();
    }, []);

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

        setResponseLoading(true);
        try {
            // Generate patient signature for encryption key derivation
            const message = `Grant access to medical records: ${requestId}`;
            const patientSignature = await signMessageAsync({ message });

            await fetchData(
                `${BACKEND_URL}/api/access-requests/patient/respond`,
                'POST',
                {
                    requestId,
                    action: 'approve',
                    selectedRecords,
                    patientNotes: patientNotes.trim() || undefined,
                    accessDuration: parseInt(accessDuration),
                    patientSignature
                }
            );
            toast.success('Access request approved successfully');
            setSelectedRequest(null);
            setSelectedRecords([]);
            setPatientNotes('');
            setAccessDuration('30');
            fetchAccessRequests();
        } catch (error) {
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

    if (loading) {
        return (
            <>
                <Navbar />
                <div className="access-requests-container">
                    <div className="loading">Loading access requests...</div>
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
                    <h1>Access Requests</h1>
                    <p>Manage doctor requests to access your medical records</p>
                    {!isConnected && (
                        <div className="wallet-warning">
                            <p>⚠️ Connect your wallet to approve access requests and enable secure record sharing</p>
                        </div>
                    )}
                </div>

                {/* Main requests list */}
                {accessRequests.length === 0 ? (
                    <div className="no-requests">
                        <div className="empty-state">
                            <h3>No Access Requests</h3>
                            <p>You don't have any pending access requests at the moment.</p>
                            <p>Doctors will appear here when they request access to your medical records.</p>
                        </div>
                    </div>
                ) : (
                    <div className="requests-list">
                        <h3>Pending Requests ({accessRequests.filter(r => r.status === 'pending').length})</h3>
                        
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