import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import fetchData from '../helper/authApi';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { toast } from 'react-hot-toast';
import { useAccount, useSignMessage } from 'wagmi';
import '../styles/recorddetail.css';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

const RecordDetail = () => {
  const { id } = useParams();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [integrityStatus, setIntegrityStatus] = useState(null);
  
  const { isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

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
    } catch {
      toast.error('Error fetching record details');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!record?.ipfsHash) return;
    
    if (record.isEncrypted && !isConnected) {
      return toast.error('Please connect your wallet to download encrypted records');
    }
    
    setDownloading(true);
    setIntegrityStatus('Preparing download...');
    
    try {
      let url = `${BACKEND_URL}/api/medical-records/view/${record.ipfsHash}`;
      const token = localStorage.getItem('token');
      
      // For encrypted records, generate wallet signature
      if (record.isEncrypted) {
        setIntegrityStatus('🔑 Generating decryption key from your wallet...');
        const message = "Login and generate my HealthRecord key";
        const signature = await signMessageAsync({ message });
        url += `?walletSignature=${encodeURIComponent(signature)}`;
      }
      
      setIntegrityStatus('📥 Downloading and auto-decrypting file...');
      
      const response = await fetch(url, {
        headers: { 
          'Authorization': `Bearer ${token}`,
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Download failed');
      }
      
      // Check if integrity was verified
      const integrityVerified = response.headers.get('X-Integrity-Verified');
      if (integrityVerified === 'true') {
        setIntegrityStatus('✅ File integrity verified');
        toast.success('File integrity verified successfully');
      }
      
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      // Use original filename to preserve extension, fallback to record name
      a.download = record.originalFilename || record.name || 'record';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
      
      setTimeout(() => setIntegrityStatus(null), 3000);
    } catch (error) {
      console.error('Download error:', error);
      toast.error(error.message || 'Error downloading file');
      setIntegrityStatus('❌ Download failed');
      setTimeout(() => setIntegrityStatus(null), 3000);
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

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="record-detail-container">
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Loading record details...</p>
          </div>
        </div>
        <Footer />
      </>
    );
  }
  
  if (!record) {
    return (
      <>
        <Navbar />
        <div className="record-detail-container">
          <div className="error-container">
            <h2>Record not found</h2>
            <p>The requested record could not be found.</p>
            <button className="btn btn-secondary" onClick={() => window.history.back()}>
              Go Back
            </button>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="record-detail-container">
        <div className="record-detail-content">
          <div className="record-detail-card">
            <div className="record-header">
              <h1 className="record-title">{record.name}</h1>
              <div className="record-badges">
                <span className="badge type">{record.recordType}</span>
                {record.isEncrypted && (
                  <span className="badge encrypted">🔐 Encrypted</span>
                )}
                {record.recordId_onchain && (
                  <span className="badge blockchain">⛓️ On-Chain</span>
                )}
              </div>
            </div>

            <div className="record-info">
              <div className="info-group">
                <span className="info-label">Description</span>
                <span className="info-value">{record.description || 'No description provided'}</span>
              </div>
              
              <div className="info-group">
                <span className="info-label">Original Filename</span>
                <span className="info-value">{record.originalFilename || 'Not available'}</span>
              </div>
              
              <div className="info-group">
                <span className="info-label">Uploaded At</span>
                <span className="info-value">{new Date(record.uploadedAt).toLocaleString()}</span>
              </div>
              
              <div className="info-group">
                <span className="info-label">IPFS Hash</span>
                <span className="info-value"><code>{record.ipfsHash}</code></span>
              </div>
              
              {record.recordId_onchain && (
                <div className="info-group">
                  <span className="info-label">Blockchain ID</span>
                  <span className="info-value">{record.recordId_onchain}</span>
                </div>
              )}
              
              {record.patientContractAddress && (
                <div className="info-group">
                  <span className="info-label">Contract Address</span>
                  <span className="info-value"><code>{record.patientContractAddress}</code></span>
                </div>
              )}
              
              <div className="info-group">
                <span className="info-label">Authorized Users</span>
                <span className="info-value">{record.authorizedUsers?.length || 0}</span>
              </div>
            </div>

            {/* Wallet Connection Status for Encrypted Records */}
            {record.isEncrypted && (
              <>
                <div className={`status-indicator ${isConnected ? 'success' : 'warning'}`}>
                  {isConnected ? (
                    <>✅ Wallet connected. Click download to automatically decrypt this file.</>
                  ) : (
                    <>⚠️ This file is encrypted. Connect your wallet to automatically decrypt on download.</>
                  )}
                </div>
                <div className="info-group" style={{ fontSize: '0.9rem', color: '#6b7280', fontStyle: 'italic' }}>
                  <p>🔒 <strong>How it works:</strong> Your wallet signature generates a decryption key. The file is automatically decrypted in your browser - no manual steps required!</p>
                </div>
              </>
            )}

            {/* Integrity Status */}
            {integrityStatus && (
              <div className="status-indicator success">
                {integrityStatus}
              </div>
            )}

            {/* Blockchain Info */}
            {record.blockchainTransactions?.upload && (
              <div className="blockchain-info">
                <h4>Blockchain Transaction</h4>
                <div className="info-group">
                  <span className="info-label">Transaction Hash</span>
                  <span className="info-value">
                    <a 
                      href={`https://sepolia.etherscan.io/tx/${record.blockchainTransactions.upload.transactionHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="transaction-link"
                    >
                      {record.blockchainTransactions.upload.transactionHash}
                    </a>
                  </span>
                </div>
                {record.blockchainTransactions.upload.blockNumber && (
                  <div className="info-group">
                    <span className="info-label">Block Number</span>
                    <span className="info-value">{record.blockchainTransactions.upload.blockNumber}</span>
                  </div>
                )}
              </div>
            )}

            {/* Preview (only for non-encrypted files for now) */}
            {!record.isEncrypted && renderPreview()}

            <div className="record-actions">
              <button 
                className={`btn ${downloading || (record.isEncrypted && !isConnected) ? 'btn-secondary' : 'btn-primary'}`}
                onClick={handleDownload} 
                disabled={downloading || (record.isEncrypted && !isConnected)}
              >
                {downloading ? 'Processing...' : (record.isEncrypted ? '🔓 Download (Auto-Decrypt)' : '📥 Download File')}
              </button>
              
              <button 
                className="btn btn-secondary"
                onClick={() => window.history.back()}
              >
                ← Back to Records
        </button>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
};

export default RecordDetail; 