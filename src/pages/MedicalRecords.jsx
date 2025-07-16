import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { toast } from 'react-hot-toast';
import fetchData from '../helper/authApi';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import '../styles/medicalrecords.css';
import { useNavigate } from 'react-router-dom';

const BACKEND_URL = 'http://localhost:5000';

const MedicalRecords = () => {
    const [records, setRecords] = useState([]);
    const [file, setFile] = useState(null);
    const [recordType, setRecordType] = useState('prescription');
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);
    
    const { userInfo } = useSelector(state => state.root);
    const navigate = useNavigate();

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

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!file || !name) {
            return toast.error('Please select a file and provide a name');
        }

        setLoading(true);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('recordType', recordType);
        formData.append('name', name);
        formData.append('description', description);

        try {
            const token = localStorage.getItem('token');
            await fetch(`${BACKEND_URL}/api/medical-records/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });
            
            toast.success('Record uploaded successfully');
            setFile(null);
            setName('');
            setDescription('');
            fetchRecords();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Error uploading record');
        } finally {
            setLoading(false);
        }
    };

    const viewRecord = (recordId) => {
        navigate(`/record/${recordId}`);
    };

    return (
        <>
            <Navbar />
            <div className="medical-records-container">
                <h2>Medical Records</h2>
                
                {/* Upload Form */}
                <div className="upload-section">
                    <h3>Upload New Record</h3>
                    <form onSubmit={handleUpload}>
                        <div className="form-group">
                            <label>Record Type:</label>
                            <select 
                                value={recordType} 
                                onChange={(e) => setRecordType(e.target.value)}
                            >
                                <option value="prescription">Prescription</option>
                                <option value="report">Medical Report</option>
                                <option value="bill">Medical Bill</option>
                            </select>
                        </div>

                        <div className="form-group">
                            <label>Name:</label>
                            <input 
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Record name"
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label>Description:</label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Record description (optional)"
                            />
                        </div>

                        <div className="form-group">
                            <label>File:</label>
                            <input 
                                type="file"
                                onChange={(e) => setFile(e.target.files[0])}
                                required
                            />
                        </div>

                        <button type="submit" disabled={loading}>
                            {loading ? 'Uploading...' : 'Upload Record'}
                        </button>
                    </form>
                </div>

                {/* Records List */}
                <div className="records-list">
                    <h3>Your Records</h3>
                    {records.length === 0 ? (
                        <p>No records found</p>
                    ) : (
                        <div className="records-grid">
                            {records.map((record) => (
                                <div key={record._id} className="record-card">
                                    <h4>{record.name}</h4>
                                    <p>{record.recordType}</p>
                                    <p>{record.description}</p>
                                    <button onClick={() => viewRecord(record._id)}>
                                        View Record
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            <Footer />
        </>
    );
};

export default MedicalRecords; 