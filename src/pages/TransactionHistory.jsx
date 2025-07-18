import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import fetchData from '../helper/authApi';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import '../styles/transactionhistory.css';

const BACKEND_URL = 'http://localhost:5000';

const TransactionHistory = () => {
    const [transactions, setTransactions] = useState([]);
    const [stats, setStats] = useState(null);
    const [contractInfo, setContractInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedFunction, setSelectedFunction] = useState('all');
    const [filteredTransactions, setFilteredTransactions] = useState([]);
    
    const { userInfo } = useSelector(state => state.root);

    useEffect(() => {
        fetchTransactionHistory();
        fetchContractStats();
    }, []);

    useEffect(() => {
        filterTransactions();
    }, [transactions, selectedFunction]);

    const fetchTransactionHistory = async () => {
        try {
            const response = await fetchData(`${BACKEND_URL}/api/transactions/patient/history`);
            setTransactions(response.data.transactions || []);
            setStats(response.data.stats);
        } catch (error) {
            toast.error('Error fetching transaction history');
            console.error('Transaction history error:', error);
        }
    };

    const fetchContractStats = async () => {
        try {
            const response = await fetchData(`${BACKEND_URL}/api/transactions/patient/stats`);
            setContractInfo(response.data.contractInfo);
        } catch (error) {
            console.error('Contract stats error:', error);
        } finally {
            setLoading(false);
        }
    };

    const filterTransactions = () => {
        if (selectedFunction === 'all') {
            setFilteredTransactions(transactions);
        } else {
            setFilteredTransactions(transactions.filter(tx => tx.contractFunction === selectedFunction));
        }
    };

    const formatTimestamp = (timestamp) => {
        return new Date(timestamp).toLocaleString();
    };

    const getTransactionStatusBadge = (status) => {
        const statusStyles = {
            confirmed: { background: '#e8f5e8', color: '#2e7d32' },
            pending: { background: '#fff3e0', color: '#f57c00' },
            failed: { background: '#ffebee', color: '#c62828' }
        };
        
        return (
            <span 
                className="status-badge" 
                style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    ...statusStyles[status]
                }}
            >
                {status.toUpperCase()}
            </span>
        );
    };

    const getFunctionBadge = (contractFunction) => {
        const functionCategories = {
            'addBill': { bg: '#e3f2fd', color: '#1976d2', label: 'Record Upload' },
            'addPrescription': { bg: '#e3f2fd', color: '#1976d2', label: 'Record Upload' },
            'addReport': { bg: '#e3f2fd', color: '#1976d2', label: 'Record Upload' },
            'approveAccess': { bg: '#f3e5f5', color: '#7b1fa2', label: 'Access Control' },
            'requestAccess': { bg: '#f3e5f5', color: '#7b1fa2', label: 'Access Control' },
            'revokeAccess': { bg: '#f3e5f5', color: '#7b1fa2', label: 'Access Control' },
            'createHealthRecord': { bg: '#e8f5e8', color: '#2e7d32', label: 'Contract' },
            'updatePatientName': { bg: '#fff3e0', color: '#f57c00', label: 'Profile Update' },
            'updatePatientAge': { bg: '#fff3e0', color: '#f57c00', label: 'Profile Update' }
        };

        const category = functionCategories[contractFunction] || { bg: '#f5f5f5', color: '#666', label: 'Other' };
        
        return (
            <span 
                className="function-badge"
                style={{
                    background: category.bg,
                    color: category.color,
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    marginRight: '8px'
                }}
            >
                {category.label}
            </span>
        );
    };

    const getUniqueContractFunctions = () => {
        const functions = [...new Set(transactions.map(tx => tx.contractFunction))];
        return functions.sort();
    };

    if (loading) {
        return (
            <>
                <Navbar />
                <div className="transaction-history-container">
                    <div className="loading">Loading transaction history...</div>
                </div>
                <Footer />
            </>
        );
    }

    return (
        <>
            <Navbar />
            <div className="transaction-history-container">
                <h2>🔗 Blockchain Transaction History</h2>

                {/* Contract Information */}
                {contractInfo && (
                    <div className="contract-info-card">
                        <h3>📄 Smart Contract Information</h3>
                        <div className="contract-details">
                            <p><strong>Contract Address:</strong> 
                                <code>{contractInfo.address ? `${contractInfo.address.slice(0, 8)}...${contractInfo.address.slice(-6)}` : 'Not deployed'}</code>
                            </p>
                            <p><strong>Deployment Status:</strong> 
                                {getTransactionStatusBadge(contractInfo.deploymentStatus || 'pending')}
                            </p>
                            {contractInfo.deploymentTx && (
                                <p><strong>Deployment Tx:</strong> 
                                    <code>{contractInfo.deploymentTx.slice(0, 8)}...{contractInfo.deploymentTx.slice(-6)}</code>
                                </p>
                            )}
                            {contractInfo.deploymentBlock && (
                                <p><strong>Deployment Block:</strong> {contractInfo.deploymentBlock}</p>
                            )}
                        </div>
                    </div>
                )}

                {/* Transaction Statistics */}
                {stats && (
                    <div className="stats-grid">
                        <div className="stat-card">
                            <h4>📊 Total Transactions</h4>
                            <div className="stat-number">{stats.total}</div>
                        </div>
                        <div className="stat-card">
                            <h4>⛽ Total Gas Used</h4>
                            <div className="stat-number">{stats.totalGasUsed?.toLocaleString() || 0}</div>
                        </div>
                        <div className="stat-card">
                            <h4>📁 Record Uploads</h4>
                            <div className="stat-number">{stats.contractStats?.recordUploads || 0}</div>
                        </div>
                        <div className="stat-card">
                            <h4>🔐 Access Management</h4>
                            <div className="stat-number">{stats.contractStats?.accessManagement || 0}</div>
                        </div>
                    </div>
                )}

                {/* Function Filter */}
                <div className="filter-section">
                    <label htmlFor="function-filter">Filter by Contract Function:</label>
                    <select 
                        id="function-filter"
                        value={selectedFunction} 
                        onChange={(e) => setSelectedFunction(e.target.value)}
                    >
                        <option value="all">All Functions</option>
                        {getUniqueContractFunctions().map(func => (
                            <option key={func} value={func}>{func}</option>
                        ))}
                    </select>
                </div>

                {/* Transactions List */}
                <div className="transactions-section">
                    <h3>📝 Transaction Details ({filteredTransactions.length})</h3>
                    
                    {filteredTransactions.length === 0 ? (
                        <div className="no-transactions">
                            <p>No transactions found for the selected filter.</p>
                        </div>
                    ) : (
                        <div className="transactions-list">
                            {filteredTransactions.map((tx, index) => (
                                <div key={index} className="transaction-card">
                                    <div className="transaction-header">
                                        <div className="transaction-function">
                                            {getFunctionBadge(tx.contractFunction)}
                                            <strong>{tx.contractFunction}</strong>
                                        </div>
                                        <div className="transaction-status">
                                            {getTransactionStatusBadge(tx.status)}
                                        </div>
                                    </div>
                                    
                                    <div className="transaction-details">
                                        <div className="detail-row">
                                            <span className="label">Transaction Hash:</span>
                                            <code className="hash">{tx.transactionHash.slice(0, 10)}...{tx.transactionHash.slice(-8)}</code>
                                        </div>
                                        
                                        {tx.blockNumber && (
                                            <div className="detail-row">
                                                <span className="label">Block Number:</span>
                                                <span>{tx.blockNumber}</span>
                                            </div>
                                        )}
                                        
                                        {tx.gasUsed && (
                                            <div className="detail-row">
                                                <span className="label">Gas Used:</span>
                                                <span>{tx.gasUsed.toLocaleString()}</span>
                                            </div>
                                        )}
                                        
                                        <div className="detail-row">
                                            <span className="label">Timestamp:</span>
                                            <span>{formatTimestamp(tx.timestamp)}</span>
                                        </div>
                                        
                                        {tx.relatedData && Object.keys(tx.relatedData).length > 0 && (
                                            <div className="related-data">
                                                <strong>Related Data:</strong>
                                                {tx.relatedData.recordType && (
                                                    <span className="related-item">Type: {tx.relatedData.recordType}</span>
                                                )}
                                                {tx.relatedData.recordName && (
                                                    <span className="related-item">Name: {tx.relatedData.recordName}</span>
                                                )}
                                                {tx.relatedData.doctorAddress && (
                                                    <span className="related-item">Doctor: {tx.relatedData.doctorAddress.slice(0, 8)}...{tx.relatedData.doctorAddress.slice(-6)}</span>
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
            <Footer />
        </>
    );
};

export default TransactionHistory; 