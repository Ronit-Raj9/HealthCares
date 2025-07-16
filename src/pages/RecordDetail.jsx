import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import fetchData from '../helper/authApi';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { toast } from 'react-hot-toast';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

const RecordDetail = () => {
  const { id } = useParams();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    fetchRecord();
    // eslint-disable-next-line
  }, [id]);

  const fetchRecord = async () => {
    try {
      const response = await fetchData(`${BACKEND_URL}/api/medical-records/patient-records`);
      const found = response.data.find(r => r._id === id);
      if (!found) {
        toast.error('Record not found');
      }
      setRecord(found);
    } catch (error) {
      toast.error('Error fetching record details');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!record?.ipfsHash) return;
    setDownloading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${BACKEND_URL}/api/medical-records/view/${record.ipfsHash}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = record.name || 'record';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error('Error downloading file');
    } finally {
      setDownloading(false);
    }
  };

  // Optionally preview image/pdf
  const renderPreview = () => {
    if (!record?.ipfsHash) return null;
    const ext = record.name?.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext)) {
      return (
        <img
          src={`${BACKEND_URL}/api/medical-records/view/${record.ipfsHash}`}
          alt={record.name}
          style={{ maxWidth: '100%', maxHeight: 400, margin: '1rem 0' }}
        />
      );
    }
    if (ext === 'pdf') {
      return (
        <iframe
          src={`${BACKEND_URL}/api/medical-records/view/${record.ipfsHash}`}
          title="PDF Preview"
          width="100%"
          height="500px"
          style={{ margin: '1rem 0' }}
        />
      );
    }
    return null;
  };

  if (loading) return <div>Loading...</div>;
  if (!record) return <div>Record not found.</div>;

  return (
    <>
      <Navbar />
      <div className="record-detail-container" style={{ maxWidth: 600, margin: '2rem auto', background: '#fff', padding: '2rem', borderRadius: 8 }}>
        <h2>Record Details</h2>
        <p><strong>Name:</strong> {record.name}</p>
        <p><strong>Type:</strong> {record.recordType}</p>
        <p><strong>Description:</strong> {record.description}</p>
        <p><strong>Uploaded At:</strong> {new Date(record.uploadedAt).toLocaleString()}</p>
        <p><strong>IPFS Hash:</strong> {record.ipfsHash}</p>
        {renderPreview()}
        <button onClick={handleDownload} disabled={downloading} style={{ marginTop: 16 }}>
          {downloading ? 'Downloading...' : 'Download File'}
        </button>
      </div>
      <Footer />
    </>
  );
};

export default RecordDetail; 