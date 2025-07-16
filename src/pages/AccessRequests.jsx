import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { toast } from 'react-hot-toast';
import fetchData from '../helper/authApi';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import '../styles/accessrequests.css';

const BACKEND_URL = 'http://localhost:5000';

const AccessRequests = () => {
    const [records, setRecords] = useState([]);
    const [selectedRecord, setSelectedRecord] = useState('');
    const [requestedUserId, setRequestedUserId] = useState('');
    const [userType, setUserType] = useState('Doctor');
    const [expiryDate, setExpiryDate] = useState('');
    const [loading, setLoading] = useState(false);
    
    const { userInfo } = useSelector(state => state.root);

    useEffect(() => {
        fetchRecords();
    }, []);

    const fetchRecords = async () => {
        try {
            const response = await fetchData(`${BACKEND_URL}/api/medical-records/patient-records`);
            setRecords(response.data);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Error fetching records');
        }
    };

    const handleGrantAccess = async (e) => {
        e.preventDefault();
        if (!selectedRecord || !requestedUserId || !expiryDate) {
            return toast.error('Please fill all required fields');
        }

        setLoading(true);
        try {
            await fetchData(
                `${BACKEND_URL}/api/medical-records/grant-access`,
                'POST',
                {
                    recordId: selectedRecord,
                    userId: requestedUserId,
                    userType,
                    expiryDate: new Date(expiryDate).toISOString()
                }
            );
            toast.success('Access granted successfully');
            setSelectedRecord('');
            setRequestedUserId('');
            setExpiryDate('');
            fetchRecords();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Error granting access');
        } finally {
            setLoading(false);
        }
    };

    const handleRevokeAccess = async (recordId, userId) => {
        try {
            await fetchData(
                `${BACKEND_URL}/api/medical-records/revoke-access`,
                'POST',
                {
                    recordId,
                    userId
                }
            );
            toast.success('Access revoked successfully');
            fetchRecords();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Error revoking access');
        }
    };

    return (
        <>
            <Navbar />
            <div className="access-requests-container">
                <h2>Grant Access to Records</h2>
                
                <form onSubmit={handleGrantAccess} className="grant-access-form">
                    <div className="form-group">
                        <label>Select Record:</label>
                        <select 
                            value={selectedRecord}
                            onChange={(e) => setSelectedRecord(e.target.value)}
                            required
                        >
                            <option value="">Choose a record</option>
                            {records.map(record => (
                                <option key={record._id} value={record._id}>
                                    {record.name} ({record.recordType})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label>User Type:</label>
                        <select
                            value={userType}
                            onChange={(e) => setUserType(e.target.value)}
                            required
                        >
                            <option value="Doctor">Doctor</option>
                            <option value="Hospital">Hospital</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label>User ID:</label>
                        <input
                            type="text"
                            value={requestedUserId}
                            onChange={(e) => setRequestedUserId(e.target.value)}
                            placeholder="Enter user ID"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>Access Expiry Date:</label>
                        <input
                            type="date"
                            value={expiryDate}
                            onChange={(e) => setExpiryDate(e.target.value)}
                            min={new Date().toISOString().split('T')[0]}
                            required
                        />
                    </div>

                    <button type="submit" disabled={loading}>
                        {loading ? 'Granting Access...' : 'Grant Access'}
                    </button>
                </form>
            </div>
            <Footer />
        </>
    );
};

export default AccessRequests; 