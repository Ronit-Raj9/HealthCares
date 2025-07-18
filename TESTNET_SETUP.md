# Testnet Setup Guide - Sepolia Only

## Frontend Configuration ✅ (Already Updated)
The frontend is now configured to use **Sepolia testnet only**.

## Backend Configuration

Create a `.env` file in the `backend/` directory with the following configuration:

```env
# Database Configuration
MONGODB_URI=mongodb://localhost:27017/healthcare

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d

# CORS Configuration
CORS_ORIGIN=http://localhost:5173

# Blockchain Configuration (Sepolia Testnet)
ETHEREUM_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID
PRIVATE_KEY=YOUR_PRIVATE_KEY_WITHOUT_0x_PREFIX
HEALTH_RECORD_FACTORY_ADDRESS=0x5c2757e33f3DA21A2F788F645CF68d8cB35895b3

# IPFS Configuration
IPFS_API_URL=https://ipfs.infura.io:5001
IPFS_PROJECT_ID=YOUR_IPFS_PROJECT_ID
IPFS_PROJECT_SECRET=YOUR_IPFS_PROJECT_SECRET

# Network Configuration
CHAIN_ID=11155111
NETWORK_NAME=sepolia

# Server Configuration
PORT=5000
NODE_ENV=development
```

## MetaMask Configuration

### Step 1: Switch to Sepolia Testnet

1. **Open MetaMask**
2. **Click on the network dropdown** (currently showing "Ethereum Mainnet")
3. **Select "Sepolia test network"**
   - If you don't see it, click "Show/Hide test networks" in settings first

### Step 2: Get Sepolia Test ETH

1. **Visit a Sepolia faucet:**
   - https://sepoliafaucet.com/
   - https://www.alchemy.com/faucets/ethereum-sepolia
   - https://faucets.chain.link/sepolia

2. **Enter your wallet address**
3. **Request test ETH** (usually 0.5 ETH per day)

### Step 3: Verify Network Settings

**Sepolia Testnet Details:**
- **Network Name:** Sepolia test network
- **RPC URL:** https://sepolia.infura.io/v3/[YOUR-PROJECT-ID]
- **Chain ID:** 11155111
- **Currency Symbol:** ETH
- **Block Explorer:** https://sepolia.etherscan.io

## Quick Setup Commands

```bash
# 1. Create backend .env file
cd backend
touch .env
# Copy the configuration above into the .env file

# 2. Start the application
npm run dev

# 3. In another terminal, start backend
cd backend
npm start
```

## Verification

After setup, you should see:
- ✅ MetaMask connected to "Sepolia test network"
- ✅ System Health Status showing "Connected" 
- ✅ No mainnet transactions possible
- ✅ All transactions using test ETH only

## Important Notes

🚨 **NEVER use real ETH or mainnet for testing!**
🔒 **Keep your private keys secure**
🧪 **Use only test accounts for development**
📝 **Sepolia transactions are free (except gas fees in test ETH)**

## Contract Addresses (Sepolia Testnet)

- **Factory Contract:** `0x5c2757e33f3DA21A2F788F645CF68d8cB35895b3`
- **Network:** Sepolia (Chain ID: 11155111)
- **Explorer:** https://sepolia.etherscan.io/ 