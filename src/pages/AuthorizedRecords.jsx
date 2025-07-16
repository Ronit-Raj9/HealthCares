import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { toast } from 'react-hot-toast';
import fetchData from '../helper/authApi';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import '../styles/authorizedrecords.css';

const BACKEND_URL = 'http://localhost:5000';

const AuthorizedRecords = () => {
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const { userInfo } = useSelector(state => state.root);

    useEffect(() => {
        fetchAuthorizedRecords();
    }, []);

    const fetchAuthorizedRecords = async () => {
        try {
            const response = await fetchData(`${BACKEND_URL}/api/medical-records/authorized-records`);
            setRecords(response.data);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Error fetching authorized records');
        } finally {
            setLoading(false);
        }
    };

    const viewRecord = async (ipfsHash) => {
        try {
            const response = await fetchData(`${BACKEND_URL}/api/medical-records/view/${ipfsHash}`);
            if (response.data.url) {
                window.open(response.data.url, '_blank');
            } else {
                toast.error('Error getting record URL');
            }
        } catch (error) {
            toast.error('Error viewing record');
        }
    };

    if (loading) {
        return (
            <>
                <Navbar />
                <div className="authorized-records-container">
                    <div className="loading">Loading authorized records...</div>
                </div>
                <Footer />
            </>
        );
    }

    return (
        <>
            <Navbar />
            <div className="authorized-records-container">
                <h2>Authorized Records</h2>
                {records.length === 0 ? (
                    <div className="no-records">
                        <p>No authorized records found</p>
                    </div>
                ) : (
                    <div className="records-grid">
                        {records.map(record => (
                            <div key={record._id} className="record-card">
                                <h4>{record.name}</h4>
                                <p>{record.recordType}</p>
                                <p>{record.description}</p>
                                <p>Owner: {record.ownerName}</p>
                                <p>Access Expires: {new Date(record.accessExpiresAt).toLocaleDateString()}</p>
                                <button onClick={() => viewRecord(record.ipfsHash)}>
                                    View Record
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <Footer />
        </>
    );
};

export default AuthorizedRecords; 