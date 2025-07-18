import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import fetchData from '../helper/authApi';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import '../styles/authorizedrecords.css';
import { useAccount, useSignMessage } from 'wagmi';
import { ethers } from 'ethers';
import { ENCRYPTION_KEY_MESSAGE } from '../utils/constants';

const BACKEND_URL = 'http://localhost:5000';

const AuthorizedRecords = () => {
    // State management
    const [activeTab, setActiveTab] = useState('search'); // 'search', 'requests', 'authorized', 'blockchain', 'extensions'
    const [searchTerm, setSearchTerm] = useState('');
    const [patients, setPatients] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [authorizedRecords, setAuthorizedRecords] = useState([]);
    const [blockchainRecords, setBlockchainRecords] = useState([]);
    const [extensionRequests, setExtensionRequests] = useState([]);
    const [requestLoading, setRequestLoading] = useState(false);
    const [myRequests, setMyRequests] = useState([]);
    const [systemStatus, setSystemStatus] = useState(null);
    const [hashDebugInfo, setHashDebugInfo] = useState(null);
    const [showHashDebug, setShowHashDebug] = useState(false);
    
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
        } else if (activeTab === 'blockchain') {
            fetchBlockchainRecords();
        } else if (activeTab === 'extensions') {
            fetchExtensionRequests();
        }

        fetchSystemStatus();
    }, [activeTab]);

    const fetchSystemStatus = async () => {
        try {
            const response = await fetch(`${BACKEND_URL}/api/system/status`);
            const result = await response.json();
            setSystemStatus(result.data);
        } catch (error) {
            console.error('Error fetching system status:', error);
        }
    };

    const testDoctorWorkflow = async () => {
        try {
            const response = await fetchData(`${BACKEND_URL}/api/system/test/doctor-workflow`);
            toast.success('Doctor workflow test completed successfully');
            console.log('Doctor workflow test results:', response.data);
        } catch (error) {
            toast.error('Doctor workflow test failed');
            console.error('Doctor workflow test error:', error);
        }
    };

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

    // Fetch authorized records (off-chain)
    const fetchAuthorizedRecords = async () => {
        try {
            const response = await fetchData(`${BACKEND_URL}/api/access-requests/doctor/authorized-records`);
            setAuthorizedRecords(response.data);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Error fetching authorized records');
        }
    };

    // Fetch blockchain-verified authorized records
    const fetchBlockchainRecords = async () => {
        try {
            const response = await fetchData(`${BACKEND_URL}/api/access-requests/doctor/blockchain-authorized-records`);
            setBlockchainRecords(response.data);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Error fetching blockchain records');
            console.error('Blockchain records fetch error:', error);
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

    // Fetch my extension requests
    const fetchExtensionRequests = async () => {
        try {
            const response = await fetchData(`${BACKEND_URL}/api/access-requests/doctor/extension-requests`);
            setExtensionRequests(response.data);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Error fetching extension requests');
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

            // Step 1: Get patient contract info without creating database entry
            const contractInfo = await fetchData(`${BACKEND_URL}/api/access-requests/doctor/patient-contract/${patientId}`, 'GET');

            // Step 2: Blockchain transaction is MANDATORY for all access requests
            if (!contractInfo.data.hasBlockchainContract || !contractInfo.data.contractAddress) {
                toast.error('This patient does not have a deployed blockchain contract. Access requests require blockchain verification.');
                setRequestLoading(false);
                return;
            }

            // Step 3: Execute mandatory blockchain transaction
                try {
                    const provider = new ethers.BrowserProvider(window.ethereum);
                    const signer = await provider.getSigner();
                    
                    const contract = new ethers.Contract(
                    contractInfo.data.contractAddress,
                        [
                            "function requestAccess() external"
                        ],
                        signer
                    );

                toast('Please confirm the blockchain transaction in MetaMask...', {
                    icon: '🔗',
                    style: {
                        borderLeft: '4px solid #3b82f6',
                        backgroundColor: '#dbeafe'
                    }
                });

                    const tx = await contract.requestAccess();
                toast('Blockchain request submitted. Waiting for confirmation...', {
                    icon: 'ℹ️',
                    style: {
                        borderLeft: '4px solid #3b82f6',
                        backgroundColor: '#dbeafe'
                    }
                });
                    
                    await tx.wait();
                    toast.success('Blockchain access request confirmed!');
                } catch (blockchainError) {
                    console.error('Blockchain requestAccess failed:', blockchainError);
                
                // Check if user cancelled transaction
                if (blockchainError.code === 4001 || blockchainError.message.includes('denied')) {
                    toast.error('Transaction cancelled. Request not created.');
                } else {
                    toast.error('Blockchain transaction failed. Request not created.');
                }
                
                setRequestLoading(false);
                return; // Exit early - don't create database entry if blockchain fails
            }

            // Step 4: Only create database entry AFTER mandatory blockchain success
            await fetchData(`${BACKEND_URL}/api/access-requests/doctor/request`, 'POST', {
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

    // Request access extension
    const requestAccessExtension = async (patientId, patientName, currentRequestId) => {
        if (!isConnected) {
            toast.error('Please connect your wallet to request access extensions');
            return;
        }

        setRequestLoading(true);
        try {
            const extensionReason = prompt(`Request access extension for ${patientName}.\n\nPlease provide a reason for the extension:`);
            if (!extensionReason) {
                setRequestLoading(false);
                return;
            }

            const requestedDays = prompt('How many days would you like to extend access? (7-365 days):', '90');
            if (!requestedDays || isNaN(requestedDays) || requestedDays < 7 || requestedDays > 365) {
                toast.error('Please enter a valid number of days between 7-365');
                setRequestLoading(false);
                return;
            }

            await fetchData(`${BACKEND_URL}/api/access-requests/doctor/request-extension`, 'POST', {
                patientId,
                accessRequestId: currentRequestId,
                extensionReason,
                requestedExtension: parseInt(requestedDays)
            });

            toast.success('Access extension requested successfully!');
            setActiveTab('extensions');
            fetchExtensionRequests();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Error requesting access extension');
        } finally {
            setRequestLoading(false);
        }
    };

    // View authorized record with comprehensive integrity verification and debugging
    const viewRecord = async (record) => {
        if (!isConnected) {
            toast.error('Please connect your wallet to view encrypted records');
            return;
        }

        try {
            console.log('🔍 DEBUG: Starting record verification for doctor access');
            console.log('📝 Record details:', {
                id: record._id,
                name: record.name,
                ipfsHash: record.ipfsHash,
                patientId: record.patientId,
                dataHash: record.dataHash,
                blockchainHash: record.blockchainHash
            });

            // CRITICAL FIX: Use the SAME signature message as patients to generate the SAME encryption key
            // This ensures doctors can decrypt files that patients encrypted
            console.log('🔑 FIXED: Using same signature message as patients:', ENCRYPTION_KEY_MESSAGE);
            const signature = await signMessageAsync({ message: ENCRYPTION_KEY_MESSAGE });
            
            // Use the standard view endpoint WITH doctor signature (same as patient approach)
            const response = await fetch(`${BACKEND_URL}/api/medical-records/view/${record.ipfsHash}?walletSignature=${encodeURIComponent(signature)}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            
            if (!response.ok) {
                const errorData = await response.text();
                console.error('❌ HTTP Error:', response.status, errorData);
                throw new Error(errorData || 'Failed to view record');
            }

            // Check comprehensive integrity verification from headers
            const headers = response.headers || {};
            const localHashVerified = headers.get('x-local-hash-verified') === 'true';
            const blockchainHashVerified = headers.get('x-blockchain-hash-verified') === 'true';
            const blockchainMessage = headers.get('x-blockchain-message') || '';
            const overallIntegrityVerified = headers.get('x-integrity-verified') === 'true';
            const localHash = headers.get('x-local-hash') || '';
            const blockchainHash = headers.get('x-blockchain-hash') || '';
            
            // DEBUGGING: Log all hash information including signature details
            console.log('🔍 HASH DEBUGGING INFORMATION:');
            console.log('🔑 Signature Message Used:', ENCRYPTION_KEY_MESSAGE);
            console.log('🔑 Generated Signature (truncated):', signature?.substring(0, 20) + '...');
            console.log('📊 Database Hash (Expected):', record.dataHash);
            console.log('💻 Server Computed Hash:', localHash);
            console.log('⛓️ Blockchain Hash:', blockchainHash);
            console.log('✅ Local Hash Verified:', localHashVerified);
            console.log('✅ Blockchain Hash Verified:', blockchainHashVerified);
            console.log('✅ Overall Integrity:', overallIntegrityVerified);
            console.log('📝 Blockchain Message:', blockchainMessage);
            
            // Get the file data to compute hash on frontend for comparison
            const blob = await response.blob();
            const arrayBuffer = await blob.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            
            // Compute SHA-256 hash on frontend for debugging
            const hashBuffer = await crypto.subtle.digest('SHA-256', uint8Array);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const computedHashFrontend = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            
            console.log('🖥️ Frontend Computed Hash:', computedHashFrontend);
            
            // FETCH BLOCKCHAIN HASH DIRECTLY FROM SMART CONTRACT
            let blockchainHashDirect = null;
            let blockchainError = null;
            
            if (record.patientContractAddress && record.name && record.recordType) {
                try {
                    console.log('🔗 Fetching blockchain hash directly from smart contract using getApprovedRecords...');
                    const provider = new ethers.BrowserProvider(window.ethereum);
                    const signer = await provider.getSigner();
                    
                    // ABI for the getApprovedRecords function that doctors can call
                    const contractABI = [
                        "function getApprovedRecords() external view returns (tuple(string prescriptionName, string prescriptionDataHash)[] memory approvedPrescriptions, tuple(string reportName, string reportDataHash)[] memory approvedReports, tuple(string billName, string billDataHash)[] memory approvedBills)"
                    ];
                    
                    const contract = new ethers.Contract(record.patientContractAddress, contractABI, signer);
                    
                    // Get all approved records for this doctor
                    console.log('📋 Calling getApprovedRecords() for contract:', record.patientContractAddress);
                    const [approvedPrescriptions, approvedReports, approvedBills] = await contract.getApprovedRecords();
                    
                    console.log('📋 Approved records received:', {
                        prescriptions: approvedPrescriptions.length,
                        reports: approvedReports.length,
                        bills: approvedBills.length
                    });
                    
                    // Find the specific record by name and type
                    let foundRecord = null;
                    const recordName = record.name;
                    const recordType = record.recordType.toLowerCase();
                    
                    if (recordType === 'prescription') {
                        foundRecord = approvedPrescriptions.find(p => p.prescriptionName === recordName);
                        if (foundRecord) {
                            blockchainHashDirect = foundRecord.prescriptionDataHash;
                        }
                    } else if (recordType === 'report') {
                        foundRecord = approvedReports.find(r => r.reportName === recordName);
                        if (foundRecord) {
                            blockchainHashDirect = foundRecord.reportDataHash;
                        }
                    } else if (recordType === 'bill') {
                        foundRecord = approvedBills.find(b => b.billName === recordName);
                        if (foundRecord) {
                            blockchainHashDirect = foundRecord.billDataHash;
                        }
                    }
                    
                    if (foundRecord) {
                        console.log('✅ Successfully found record on blockchain:', {
                            name: recordName,
                            type: recordType,
                            hash: blockchainHashDirect
                        });
                    } else {
                        console.log('⚠️ Record not found in approved records:', {
                            searchName: recordName,
                            searchType: recordType,
                            availablePrescriptions: approvedPrescriptions.map(p => p.prescriptionName),
                            availableReports: approvedReports.map(r => r.reportName),
                            availableBills: approvedBills.map(b => b.billName)
                        });
                        blockchainError = `Record "${recordName}" not found in approved ${recordType}s`;
                    }
                    
                } catch (error) {
                    console.error('❌ Error fetching blockchain hash directly:', error);
                    blockchainError = error.message;
                    blockchainHashDirect = null;
                    
                    // More specific error handling
                    if (error.code === 'CALL_EXCEPTION') {
                        blockchainError = 'Access denied: Doctor may not have valid access to this patient contract';
                    } else if (error.message.includes('execution reverted')) {
                        blockchainError = 'Contract call reverted: Access may be expired or unauthorized';
                    }
                }
            }
            
            console.log('🔄 Hash Comparisons:');
            console.log('  📊 Database vs Server:', record.dataHash === localHash, `(${record.dataHash === localHash ? 'MATCH' : 'MISMATCH'})`);
            console.log('  📊 Database vs Frontend:', record.dataHash === computedHashFrontend, `(${record.dataHash === computedHashFrontend ? 'MATCH' : 'MISMATCH'})`);
            console.log('  💻 Server vs Frontend:', localHash === computedHashFrontend, `(${localHash === computedHashFrontend ? 'MATCH' : 'MISMATCH'})`);
            console.log('  ⛓️ Database vs Blockchain (Server):', record.dataHash === blockchainHash, `(${record.dataHash === blockchainHash ? 'MATCH' : 'MISMATCH'})`);
            console.log('  🔗 Frontend vs Blockchain (Direct):', computedHashFrontend === blockchainHashDirect, `(${computedHashFrontend === blockchainHashDirect ? 'MATCH' : 'MISMATCH'})`);
            console.log('  🎯 DATABASE vs BLOCKCHAIN (Direct):', record.dataHash === blockchainHashDirect, `(${record.dataHash === blockchainHashDirect ? 'MATCH' : 'MISMATCH'})`);
            

            
            // Display simplified verification results
            const frontendBlockchainMatch = computedHashFrontend === blockchainHashDirect;
            const blockchainDirectAvailable = blockchainHashDirect !== null;
            
            if (frontendBlockchainMatch && blockchainDirectAvailable) {
                toast.success('🎯 Perfect Integrity Verification!\n✅ Frontend and Blockchain hashes match exactly\n✅ File is completely secure and untampered');
            } else if (!blockchainDirectAvailable) {
                toast('⚠️ Blockchain verification unavailable\n📁 File downloaded successfully\n🔍 Click for detailed verification', {
                    icon: '⚠️',
                    style: {
                        borderLeft: '4px solid #f59e0b',
                        backgroundColor: '#fef3c7'
                    },
                    duration: 8000
                });
            } else {
                toast.error('❌ Integrity Mismatch Detected!\n🚨 Frontend and Blockchain hashes differ\n🔍 Check detailed verification for more info', {
                    duration: 10000
                });
            }

            // Create download
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = record.originalFilename || record.name;
            a.click();
            window.URL.revokeObjectURL(url);

            // Store debug information for UI display
            const debugData = {
                signature: {
                    message: ENCRYPTION_KEY_MESSAGE,
                    signature: signature?.substring(0, 30) + '...',
                    signatureLength: signature?.length
                },
                record: {
                    id: record._id,
                    name: record.name,
                    recordType: record.recordType,
                    contractAddress: record.patientContractAddress,
                    databaseHash: record.dataHash,
                    blockchainHashStored: record.blockchainHash
                },
                serverResponse: {
                    localHash,
                    blockchainHash,
                    localHashVerified,
                    blockchainHashVerified,
                    overallIntegrityVerified,
                    blockchainMessage
                },
                frontendComputed: {
                    hash: computedHashFrontend,
                    fileSize: uint8Array.length,
                    fileSizeKB: Math.round(uint8Array.length / 1024)
                },
                blockchainDirect: {
                    hash: blockchainHashDirect,
                    error: blockchainError,
                    available: blockchainHashDirect !== null
                },
                comparisons: {
                    databaseVsServer: record.dataHash === localHash,
                    databaseVsFrontend: record.dataHash === computedHashFrontend,
                    serverVsFrontend: localHash === computedHashFrontend,
                    databaseVsBlockchainServer: record.dataHash === blockchainHash,
                    frontendVsBlockchainDirect: computedHashFrontend === blockchainHashDirect,
                    databaseVsBlockchainDirect: record.dataHash === blockchainHashDirect
                },
                timestamp: new Date().toISOString()
            };

            // Set debug info for UI display
            setHashDebugInfo(debugData);
            setShowHashDebug(true);

            // Comprehensive debugging log with full details
            console.log('🔍 COMPLETE INTEGRITY VERIFICATION DEBUG:', debugData);

        } catch (error) {
            console.error('❌ Error viewing record:', error);
            toast.error('Error viewing record: ' + (error.response?.data?.message || error.message));
        }
    };

    // Check if access has expired or will expire soon
    const getAccessExpiryStatus = (expiresAt) => {
        const now = new Date();
        const expiry = new Date(expiresAt);
        const daysUntilExpiry = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
        
        if (daysUntilExpiry < 0) {
            return { status: 'expired', days: Math.abs(daysUntilExpiry), color: 'red' };
        } else if (daysUntilExpiry <= 7) {
            return { status: 'expiring', days: daysUntilExpiry, color: 'orange' };
        } else {
            return { status: 'active', days: daysUntilExpiry, color: 'green' };
        }
    };

    const getSystemStatusDisplay = () => {
        if (!systemStatus) return null;

        return (
            <div className="system-status-card">
                <h4>🏥 System Health Status</h4>
                <div className="status-grid">
                    <div className="status-item">
                        <span className="status-label">Database:</span>
                        <span className={`status-value ${systemStatus.database.connected ? 'success' : 'error'}`}>
                            {systemStatus.database.connected ? '✅ Connected' : '❌ Disconnected'}
                        </span>
                    </div>
                    <div className="status-item">
                        <span className="status-label">Blockchain:</span>
                        <span className={`status-value ${systemStatus.blockchain.initialized ? 'success' : 'error'}`}>
                            {systemStatus.blockchain.initialized ? '✅ Initialized' : '❌ Failed'}
                        </span>
                    </div>
                    <div className="status-item">
                        <span className="status-label">IPFS:</span>
                        <span className={`status-value ${systemStatus.ipfs.connected ? 'success' : 'warning'}`}>
                            {systemStatus.ipfs.connected ? '✅ Connected' : '⚠️ Unknown'}
                        </span>
                    </div>
                </div>
                <div className="system-actions">
                    <button 
                        className="test-button"
                        onClick={testDoctorWorkflow}
                    >
                        🧪 Test Doctor Workflow
                    </button>
                </div>
            </div>
        );
    };

    return (
        <>
            <Navbar />
            <div className="authorized-records-container">
                <div className="page-header">
                    <h1>Patient Records</h1>
                    <p>Search patients, request access to medical records, and manage access extensions</p>
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

                {/* System Status Display */}
                {getSystemStatusDisplay()}

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
                    <button 
                        className={`tab-btn ${activeTab === 'blockchain' ? 'active' : ''}`}
                        onClick={() => setActiveTab('blockchain')}
                    >
                        ⛓️ Blockchain Verified ({blockchainRecords.length})
                    </button>
                    <button 
                        className={`tab-btn ${activeTab === 'extensions' ? 'active' : ''}`}
                        onClick={() => setActiveTab('extensions')}
                    >
                        ⏰ Extension Requests ({extensionRequests.length})
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
                                            {request.patientId?.contractAddress && (
                                                <p><strong>Patient Contract:</strong> {request.patientId.contractAddress.slice(0, 6)}...{request.patientId.contractAddress.slice(-4)}</p>
                                            )}
                                            {request.blockchainTransactions?.approval && (
                                                <p><strong>Blockchain Tx:</strong> 
                                                    <a 
                                                        href={`https://sepolia.etherscan.io/tx/${request.blockchainTransactions.approval.transactionHash}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style={{ fontSize: '0.8rem', marginLeft: '0.5rem' }}
                                                    >
                                                        {request.blockchainTransactions.approval.transactionHash.slice(0, 6)}...{request.blockchainTransactions.approval.transactionHash.slice(-4)}
                                                    </a>
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Authorized Records Tab - Enhanced with extension requests */}
                {activeTab === 'authorized' && (
                    <div className="authorized-section">
                        <h3>Authorized Medical Records (Off-Chain)</h3>
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
                                {authorizedRecords.map(record => {
                                    const expiryStatus = getAccessExpiryStatus(record.accessExpiresAt);
                                    return (
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
                                                {record.hasBlockchainVerification && (
                                                    <span className="badge blockchain">⛓️ Blockchain</span>
                                                )}
                                                    <span 
                                                        className={`badge expiry ${expiryStatus.status}`}
                                                        style={{ color: expiryStatus.color }}
                                                    >
                                                        {expiryStatus.status === 'expired' 
                                                            ? `❌ Expired ${expiryStatus.days} days ago`
                                                            : expiryStatus.status === 'expiring'
                                                            ? `⚠️ Expires in ${expiryStatus.days} days`
                                                            : `✅ ${expiryStatus.days} days left`
                                                        }
                                                    </span>
                                                </div>
                                        </div>
                                        <div className="record-info">
                                            <p><strong>Patient:</strong> {record.patientName}</p>
                                            <p><strong>Description:</strong> {record.description || 'No description'}</p>
                                            <p><strong>Original File:</strong> {record.originalFilename}</p>
                                            <p><strong>Access Expires:</strong> {new Date(record.accessExpiresAt).toLocaleDateString()}</p>
                                            {record.patientContractAddress && (
                                                <p><strong>Patient Contract:</strong> {record.patientContractAddress.slice(0, 6)}...{record.patientContractAddress.slice(-4)}</p>
                                            )}
                                        </div>
                                        <div className="record-actions">
                                            <button
                                                onClick={() => viewRecord(record)}
                                                    disabled={!isConnected || expiryStatus.status === 'expired'}
                                                className="view-record-btn"
                                            >
                                                🔍 View & Verify Record
                                            </button>
                                                {(expiryStatus.status === 'expiring' || expiryStatus.status === 'active') && (
                                                    <button
                                                        onClick={() => requestAccessExtension(record.patientId, record.patientName, record.accessRequestId)}
                                                        disabled={requestLoading || !isConnected}
                                                        className="extend-access-btn"
                                                        title="Request access extension"
                                                    >
                                                        ⏰ Request Extension
                                                    </button>
                                                )}
                                                {expiryStatus.status === 'expired' && (
                                                    <span className="expired-notice">
                                                        Access expired - request new access
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                                        )}
            </div>
        )}

        {/* Hash Debug Information Modal */}
        {showHashDebug && hashDebugInfo && (
            <div className="hash-debug-modal">
                <div className="hash-debug-content">
                    <div className="hash-debug-header">
                        <h3>🔍 Hash Verification Debug Information</h3>
                        <button 
                            className="close-debug-btn"
                            onClick={() => setShowHashDebug(false)}
                        >
                            ✕
                        </button>
                    </div>
                    
                    <div className="hash-debug-body">
                        <div className="debug-section">
                            <h4>📝 Record Information</h4>
                            <div className="debug-info">
                                <p><strong>Record:</strong> {hashDebugInfo.record.name}</p>
                                <p><strong>File Size:</strong> {hashDebugInfo.frontendComputed.fileSizeKB} KB</p>
                                <p><strong>Verified:</strong> {new Date(hashDebugInfo.timestamp).toLocaleString()}</p>
                            </div>
                        </div>

                        <div className="debug-section">
                            <h4>🔍 Hash Verification</h4>
                            <div className="hash-comparison-grid">
                                <div className="hash-item">
                                    <span className="hash-label">📊 Database Hash:</span>
                                    <code className="hash-value">{hashDebugInfo.record.databaseHash}</code>
                                </div>
                                <div className="hash-item">
                                    <span className="hash-label">🖥️ Frontend Computed:</span>
                                    <code className="hash-value">{hashDebugInfo.frontendComputed.hash}</code>
                                </div>
                                <div className="hash-item">
                                    <span className="hash-label">🔗 Blockchain (Direct):</span>
                                    <code className="hash-value">{hashDebugInfo.blockchainDirect.hash || 'N/A'}</code>
                                </div>
                            </div>
                        </div>

                        <div className="debug-section">
                            <h4>✅ Verification Status</h4>
                            <div className="verification-results">
                                <div className={`verification-item ${hashDebugInfo.comparisons.databaseVsFrontend ? 'success' : 'error'}`}>
                                    <span>{hashDebugInfo.comparisons.databaseVsFrontend ? '✅' : '❌'}</span>
                                    <span>Database vs Frontend: {hashDebugInfo.comparisons.databaseVsFrontend ? 'MATCH' : 'MISMATCH'}</span>
                                </div>
                                <div className={`verification-item ${hashDebugInfo.comparisons.frontendVsBlockchainDirect ? 'success' : (hashDebugInfo.blockchainDirect.available ? 'error' : 'warning')}`}>
                                    <span>{hashDebugInfo.comparisons.frontendVsBlockchainDirect ? '✅' : (hashDebugInfo.blockchainDirect.available ? '❌' : '⚠️')}</span>
                                    <span>Frontend vs Blockchain: {hashDebugInfo.comparisons.frontendVsBlockchainDirect ? 'MATCH' : (hashDebugInfo.blockchainDirect.available ? 'MISMATCH' : 'UNAVAILABLE')}</span>
                                </div>
                            </div>
                            
                            {hashDebugInfo.comparisons.frontendVsBlockchainDirect && (
                                <div className="success-message">
                                    <h5>🎯 Perfect Integrity Verification!</h5>
                                    <p>✅ File matches exactly between frontend and blockchain</p>
                                    <p>✅ No tampering or corruption detected</p>
                                </div>
                            )}
                            
                            {hashDebugInfo.blockchainDirect.error && (
                                <div className="error-message">
                                    <p><strong>Blockchain Error:</strong> {hashDebugInfo.blockchainDirect.error}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* Extension Requests Tab */}
        {activeTab === 'extensions' && (
                    <div className="extensions-section">
                        <h3>My Access Extension Requests</h3>
                        <p className="section-description">
                            Track your requests for extending access to patient medical records.
                        </p>
                        {extensionRequests.length === 0 ? (
                            <div className="no-requests">
                                <p>No extension requests found</p>
                                <p>Request extensions from the Authorized Records tab when access is expiring</p>
                            </div>
                        ) : (
                            <div className="extension-requests-grid">
                                {extensionRequests.map(request => (
                                    <div key={request._id} className="extension-request-card">
                                        <div className="request-header">
                                            <h4>Extension for {request.patientName}</h4>
                                            <span className={`status-badge ${request.status}`}>
                                                {request.status}
                                            </span>
                                        </div>
                                        <div className="request-details">
                                            <p><strong>Patient:</strong> {request.patientEmail}</p>
                                            <p><strong>Current Duration:</strong> {request.currentDuration} days</p>
                                            <p><strong>Requested Extension:</strong> {request.requestedExtension} days</p>
                                            <p><strong>Current Expiry:</strong> {new Date(request.currentExpiryDate).toLocaleDateString()}</p>
                                            <p><strong>Reason:</strong> {request.extensionReason}</p>
                                            <p><strong>Requested:</strong> {new Date(request.requestedAt).toLocaleDateString()}</p>
                                            {request.respondedAt && (
                                                <>
                                                    <p><strong>Responded:</strong> {new Date(request.respondedAt).toLocaleDateString()}</p>
                                                    {request.newDuration && (
                                                        <p><strong>Approved Duration:</strong> {request.newDuration} days</p>
                                                    )}
                                                    {request.reason && (
                                                        <p><strong>Patient Response:</strong> {request.reason}</p>
                                                    )}
                                                </>
                                            )}
                                            {request.blockchainTransactions?.extension && (
                                                <p><strong>Blockchain Tx:</strong> 
                                                    <a 
                                                        href={`https://sepolia.etherscan.io/tx/${request.blockchainTransactions.extension.transactionHash}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style={{ fontSize: '0.8rem', marginLeft: '0.5rem' }}
                                                    >
                                                        {request.blockchainTransactions.extension.transactionHash.slice(0, 6)}...{request.blockchainTransactions.extension.transactionHash.slice(-4)}
                                                    </a>
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Blockchain Verified Records Tab */}
                {activeTab === 'blockchain' && (
                    <div className="blockchain-section">
                        <h3>Blockchain Verified Records</h3>
                        <p className="section-description">
                            These records have been verified against the blockchain and have on-chain access permissions.
                        </p>
                        {!isConnected && (
                            <div className="wallet-warning">
                                <p>⚠️ Connect your wallet to view blockchain-verified records</p>
                            </div>
                        )}
                        {blockchainRecords.length === 0 ? (
                            <div className="no-records">
                                <p>No blockchain-verified records found</p>
                                <p>Records appear here when patients approve access on the blockchain</p>
                            </div>
                        ) : (
                            <div className="records-grid">
                                {blockchainRecords.map(record => (
                                    <div key={record._id} className="record-card blockchain-verified">
                                        <div className="record-header">
                                            <h4>{record.name}</h4>
                                            <div className="record-badges">
                                                <span className={`badge ${record.recordType}`}>
                                                    {record.recordType}
                                                </span>
                                                <span className="badge encrypted">🔐 Encrypted</span>
                                                <span className="badge blockchain verified">⛓️ Blockchain Verified</span>
                                            </div>
                                        </div>
                                        <div className="record-info">
                                            <p><strong>Patient:</strong> {record.patientName}</p>
                                            <p><strong>Description:</strong> {record.description || 'No description'}</p>
                                            <p><strong>Original File:</strong> {record.originalFilename}</p>
                                            <p><strong>Access Expires:</strong> {new Date(record.accessExpiresAt).toLocaleDateString()}</p>
                                            <p><strong>Blockchain Hash:</strong> <code style={{fontSize: '0.8rem'}}>{record.blockchainHash.slice(0, 16)}...</code></p>
                                        </div>
                                        <div className="record-actions">
                                            <button
                                                onClick={() => viewRecord(record)}
                                                disabled={!isConnected}
                                                className="view-record-btn blockchain"
                                            >
                                                🔍 View Verified Record
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