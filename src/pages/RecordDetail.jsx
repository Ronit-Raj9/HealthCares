import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import fetchData from '../helper/authApi';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import toast from 'react-hot-toast';
import { useAccount, useSignMessage } from 'wagmi';
import '../styles/recorddetail.css';
import { ENCRYPTION_KEY_MESSAGE, BACKEND_URL } from '../utils/constants';

const RecordDetail = () => {
  const { id } = useParams();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [integrityStatus, setIntegrityStatus] = useState(null);
  const [verifyingIntegrity, setVerifyingIntegrity] = useState(false);
  const [integrityResult, setIntegrityResult] = useState(null);
  const [blockchainVerificationResult, setBlockchainVerificationResult] = useState(null);
  const [showAdvancedVerification, setShowAdvancedVerification] = useState(false);
  
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

  const verifyIntegrity = async () => {
    if (!record?.ipfsHash) return;
    
    if (record.isEncrypted && !isConnected) {
      return toast.error('Please connect your wallet to verify encrypted records');
    }
    
    setVerifyingIntegrity(true);
    setIntegrityStatus('🔍 Verifying record integrity...');
    
    try {
      let url = `${BACKEND_URL}/api/medical-records/verify/${record.ipfsHash}`;
      const token = localStorage.getItem('token');
      
      // For encrypted records, generate wallet signature
      if (record.isEncrypted) {
        setIntegrityStatus('🔑 Generating verification key from your wallet...');
        const message = ENCRYPTION_KEY_MESSAGE;
        const signature = await signMessageAsync({ message });
        url += `?walletSignature=${encodeURIComponent(signature)}`;
      }
      
      setIntegrityStatus('🔍 Performing integrity verification...');
      
      const response = await fetch(url, {
        headers: { 
          'Authorization': `Bearer ${token}`,
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Verification failed');
      }
      
      const result = await response.json();
      setIntegrityResult(result.data);
      
      if (result.data.overallIntegrityValid) {
        setIntegrityStatus('✅ Integrity verification completed successfully');
        toast.success('✅ Record integrity verified successfully');
      } else {
        setIntegrityStatus('❌ Integrity verification failed');
        toast.error('❌ Record integrity verification failed');
      }
      
    } catch (error) {
      console.error('Verification error:', error);
      toast.error(error.message || 'Error verifying record integrity');
      setIntegrityStatus('❌ Verification failed');
    } finally {
      setVerifyingIntegrity(false);
      setTimeout(() => setIntegrityStatus(null), 5000);
    }
  };

  const performAdvancedBlockchainVerification = async () => {
    if (!record?.recordId_onchain) {
      toast.error('This record is not stored on blockchain');
      return;
    }

    if (!isConnected) {
      toast.error('Please connect your wallet for blockchain verification');
      return;
    }

    setVerifyingIntegrity(true);
    setIntegrityStatus('🔗 Performing advanced blockchain verification...');

    try {
      const response = await fetchData(`${BACKEND_URL}/api/medical-records/verify-blockchain/${record._id}`);
      setBlockchainVerificationResult(response.data);
      
      if (response.data.isValid) {
        setIntegrityStatus('✅ Advanced blockchain verification completed successfully');
        toast.success('✅ Advanced blockchain verification passed');
      } else {
        setIntegrityStatus('❌ Advanced blockchain verification failed');
        toast.error('❌ Advanced blockchain verification failed');
      }
      
      setShowAdvancedVerification(true);
    } catch (error) {
      console.error('Advanced verification error:', error);
      toast.error('Error performing advanced blockchain verification');
      setIntegrityStatus('❌ Advanced verification failed');
    } finally {
      setVerifyingIntegrity(false);
      setTimeout(() => setIntegrityStatus(null), 5000);
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
        const message = ENCRYPTION_KEY_MESSAGE;
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
      
      // Check if integrity was verified during download
      const integrityVerified = response.headers.get('X-Integrity-Verified');
      const localHashVerified = response.headers.get('X-Local-Hash-Verified');
      const blockchainHashVerified = response.headers.get('X-Blockchain-Hash-Verified');
      const blockchainMessage = response.headers.get('X-Blockchain-Message');
      
      if (integrityVerified === 'true') {
        setIntegrityStatus('✅ File integrity verified during download');
        toast.success(`✅ File integrity verified\n🔐 Local hash: ${localHashVerified === 'true' ? 'Valid' : 'Invalid'}\n⛓️ Blockchain: ${blockchainMessage || 'Not available'}`);
      } else {
        setIntegrityStatus('⚠️ Integrity verification partial or failed');
        toast(`⚠️ Integrity check results:\n🔐 Local hash: ${localHashVerified === 'true' ? 'Valid' : 'Invalid'}\n⛓️ Blockchain: ${blockchainMessage || 'Not available'}`, {
          icon: '⚠️',
          style: {
            borderLeft: '4px solid #f59e0b',
            backgroundColor: '#fef3c7'
          }
        });
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

  const renderIntegrityResults = () => {
    if (!integrityResult) return null;

    return (
      <div className="integrity-results">
        <h4>🔍 Integrity Verification Results</h4>
        <div className="verification-summary">
          <div className={`verification-status ${integrityResult.overallIntegrityValid ? 'success' : 'error'}`}>
            <h5>{integrityResult.overallIntegrityValid ? '✅ Verification Passed' : '❌ Verification Failed'}</h5>
            <p>{integrityResult.overallIntegrityValid ? 'Record integrity is valid' : 'Record integrity check failed'}</p>
          </div>
        </div>
        
        <div className="verification-grid">
          <div className="verification-item">
            <span className="verification-label">Local Hash:</span>
            <span className={`verification-value ${integrityResult.localIntegrityValid ? 'success' : 'error'}`}>
              {integrityResult.localIntegrityValid ? '✅ Valid' : '❌ Invalid'}
            </span>
          </div>
          <div className="verification-item">
            <span className="verification-label">Blockchain Hash:</span>
            <span className={`verification-value ${integrityResult.blockchainVerification.verified ? 'success' : 'warning'}`}>
              {integrityResult.blockchainVerification.available ? 
                (integrityResult.blockchainVerification.verified ? '✅ Verified' : '❌ Mismatch') : 
                '⚠️ Not Available'
              }
            </span>
          </div>
        </div>
        
        <div className="hash-details">
          <div className="hash-section">
            <h6>Hash Comparison</h6>
            <div className="hash-item">
              <span className="hash-label">Current Hash:</span>
              <code className="hash-value">{integrityResult.currentHash}</code>
            </div>
            <div className="hash-item">
              <span className="hash-label">Database Hash:</span>
              <code className="hash-value">{integrityResult.databaseHash}</code>
            </div>
            {integrityResult.blockchainVerification.hash && (
              <div className="hash-item">
                <span className="hash-label">Blockchain Hash:</span>
                <code className="hash-value">{integrityResult.blockchainVerification.hash}</code>
              </div>
            )}
          </div>
        </div>
        
        {integrityResult.blockchainVerification.message && (
          <div className="blockchain-message">
            <h6>Blockchain Status</h6>
            <p>{integrityResult.blockchainVerification.message}</p>
          </div>
        )}
        
        <p className="verification-timestamp">
          <small>Verified at: {integrityResult.verifiedAt}</small>
        </p>
      </div>
    );
  };

  const renderAdvancedBlockchainVerification = () => {
    if (!blockchainVerificationResult) return null;

    return (
      <div className="advanced-blockchain-verification">
        <h4>🔗 Advanced Blockchain Verification Results</h4>
        <div className="verification-summary">
          <div className={`verification-status ${blockchainVerificationResult.isValid ? 'success' : 'error'}`}>
            <h5>{blockchainVerificationResult.isValid ? '✅ Blockchain Verification Passed' : '❌ Blockchain Verification Failed'}</h5>
            <p>{blockchainVerificationResult.message}</p>
          </div>
        </div>

        <div className="blockchain-details">
          <div className="detail-section">
            <h6>Contract Information</h6>
            <div className="detail-item">
              <span>Contract Address:</span>
              <code>{blockchainVerificationResult.contractAddress}</code>
            </div>
            <div className="detail-item">
              <span>Record ID on Chain:</span>
              <span>{blockchainVerificationResult.recordIdOnChain}</span>
            </div>
            <div className="detail-item">
              <span>Block Number:</span>
              <span>{blockchainVerificationResult.blockNumber}</span>
            </div>
          </div>

          <div className="detail-section">
            <h6>Verification Details</h6>
            <div className="detail-item">
              <span>Hash Match:</span>
              <span className={blockchainVerificationResult.hashMatch ? 'success' : 'error'}>
                {blockchainVerificationResult.hashMatch ? '✅ Matches' : '❌ Mismatch'}
              </span>
            </div>
            <div className="detail-item">
              <span>Record Exists on Chain:</span>
              <span className={blockchainVerificationResult.recordExists ? 'success' : 'error'}>
                {blockchainVerificationResult.recordExists ? '✅ Yes' : '❌ No'}
              </span>
            </div>
            <div className="detail-item">
              <span>Timestamp Match:</span>
              <span className={blockchainVerificationResult.timestampMatch ? 'success' : 'warning'}>
                {blockchainVerificationResult.timestampMatch ? '✅ Matches' : '⚠️ Different'}
              </span>
            </div>
          </div>

          {blockchainVerificationResult.transactionHash && (
            <div className="detail-section">
              <h6>Transaction Information</h6>
              <div className="detail-item">
                <span>Transaction Hash:</span>
                <a 
                  href={`https://sepolia.etherscan.io/tx/${blockchainVerificationResult.transactionHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transaction-link"
                >
                  {blockchainVerificationResult.transactionHash}
                </a>
              </div>
            </div>
          )}
        </div>

        <p className="verification-timestamp">
          <small>Advanced verification performed at: {new Date().toLocaleString()}</small>
        </p>
      </div>
    );
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
                {record.dataHash && record.blockchainHash && (
                  <span className={`badge hash-status ${record.dataHash === record.blockchainHash ? 'verified' : 'mismatch'}`}>
                    {record.dataHash === record.blockchainHash ? '✅ Hash Verified' : '⚠️ Hash Mismatch'}
                  </span>
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
              
              {record.dataHash && (
                <div className="info-group">
                  <span className="info-label">Data Hash (SHA-256)</span>
                  <span className="info-value"><code style={{fontSize: '0.8rem', wordBreak: 'break-all'}}>{record.dataHash}</code></span>
                </div>
              )}
              
              {record.blockchainHash && (
                <div className="info-group">
                  <span className="info-label">Blockchain Hash</span>
                  <span className="info-value"><code style={{fontSize: '0.8rem', wordBreak: 'break-all'}}>{record.blockchainHash}</code></span>
                </div>
              )}
              
              <div className="info-group">
                <span className="info-label">Authorized Users</span>
                <span className="info-value">{record.authorizedUsers?.length || 0}</span>
              </div>
            </div>

            {/* Hash Comparison Section */}
            {record.dataHash && record.blockchainHash && (
              <div className="hash-comparison-section">
                <h4>🔍 Hash Verification</h4>
                <div className="hash-comparison">
                  <div className="hash-item">
                    <span className="hash-label">Local Hash:</span>
                    <code className="hash-value">{record.dataHash}</code>
                  </div>
                  <div className="hash-item">
                    <span className="hash-label">Blockchain Hash:</span>
                    <code className="hash-value">{record.blockchainHash}</code>
                  </div>
                  <div className="hash-match">
                    <span className="hash-label">Verification:</span>
                    <span className={`hash-match-status ${record.dataHash === record.blockchainHash ? 'success' : 'error'}`}>
                      {record.dataHash === record.blockchainHash ? '✅ Hashes Match - File Integrity Verified' : '❌ Hash Mismatch - File May Be Corrupted'}
                    </span>
                  </div>
                </div>
              </div>
            )}

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

            {/* Integrity Verification Results */}
            {renderIntegrityResults()}

            {/* Advanced Blockchain Verification Results */}
            {showAdvancedVerification && renderAdvancedBlockchainVerification()}

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
                {record.blockchainTransactions.upload.gasUsed && (
                  <div className="info-group">
                    <span className="info-label">Gas Used</span>
                    <span className="info-value">{record.blockchainTransactions.upload.gasUsed}</span>
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
                className={`btn ${verifyingIntegrity || (record.isEncrypted && !isConnected) ? 'btn-secondary' : 'btn-info'}`}
                onClick={verifyIntegrity} 
                disabled={verifyingIntegrity || (record.isEncrypted && !isConnected)}
              >
                {verifyingIntegrity ? '🔍 Verifying...' : '🔍 Verify Integrity'}
              </button>
{/* 
              {record.recordId_onchain && (
                <button 
                  className={`btn ${verifyingIntegrity || !isConnected ? 'btn-secondary' : 'btn-info'}`}
                  onClick={performAdvancedBlockchainVerification} 
                  disabled={verifyingIntegrity || !isConnected}
                >
                  {verifyingIntegrity ? '🔗 Verifying...' : '🔗 Advanced Blockchain Verification'}
                </button>
              )} */}
              
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