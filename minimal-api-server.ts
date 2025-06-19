import express from 'express';
import cors from 'cors';
import * as fs from 'fs';
import * as path from 'path';
import { Connection, PublicKey } from '@solana/web3.js';
import { swapConfig } from './swapConfig';
import { 
  loadSession, 
  saveSession, 
  appendWalletsToSession, 
  distributeSol, 
  getSolBalance,
  SessionData,
  createWalletWithNumber,
  sendSol
} from './utility';
import { getPoolKeysForTokenAddress, getMarketIdForTokenAddress } from './pool-keys';
import RaydiumSwap from './RaydiumSwap';
import WalletWithNumber from './wallet';
import axios from 'axios';

// Local implementation of getTokenBalance to avoid importing startTrading.ts
async function getTokenBalance(raydiumSwap: RaydiumSwap, mintAddress: string): Promise<number> {
  try {
    const tokenAccounts = await raydiumSwap.getOwnerTokenAccounts();
    const tokenAccount = tokenAccounts.find(acc => acc.accountInfo.mint.toString() === mintAddress);
    if (!tokenAccount) return 0;

    const decimals = await raydiumSwap.getTokenDecimals(mintAddress);
    return Number(tokenAccount.accountInfo.amount) / Math.pow(10, decimals);
  } catch (error) {
    return 0;
  }
}

const app = express();
const PORT = parseInt(process.env.PORT || '12001', 10);

// Middleware - Allow all origins for now to debug
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Global state management
interface ActiveSession {
  id: string;
  data: SessionData;
  adminWallet: WalletWithNumber;
  tradingWallets: WalletWithNumber[];
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  poolKeys: any;
  isTrading: boolean;
  globalTradingFlag: { value: boolean };
  connection: Connection;
}

const activeSessions = new Map<string, ActiveSession>();
let connection: Connection;

// Initialize connection
async function initializeConnection() {
  connection = new Connection(swapConfig.RPC_URL, 'confirmed');
  console.log(`Connected to Solana RPC: ${swapConfig.RPC_URL}`);
}

// Utility functions
async function getDexscreenerData(tokenAddress: string): Promise<any> {
  try {
    const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
    return response.data;
  } catch (error) {
    console.error(`Failed to fetch token data from Dexscreener: ${error.message}`);
    return null;
  }
}

function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function formatTimestampToEST(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-').slice(0, -5);
}

// API Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    activeSessions: activeSessions.size
  });
});

// Token validation
app.post('/api/tokens/validate', async (req, res) => {
  try {
    const { tokenAddress, fetchPoolKeys = true } = req.body;
    
    if (!tokenAddress) {
      return res.status(400).json({ error: 'Token address is required' });
    }

    // Validate token via Dexscreener
    const tokenData = await getDexscreenerData(tokenAddress);
    if (!tokenData || !tokenData.pairs || tokenData.pairs.length === 0) {
      return res.status(404).json({ error: 'Token not found or invalid' });
    }

    const pair = tokenData.pairs[0];
    const tokenInfo = {
      address: tokenAddress,
      name: pair.baseToken.name,
      symbol: pair.baseToken.symbol,
      price: pair.priceUsd,
      volume24h: pair.volume.h24,
      priceChange24h: pair.priceChange.h24,
      buys24h: pair.txns.h24.buys,
      sells24h: pair.txns.h24.sells
    };

    let poolKeys = null;
    let marketId = null;

    if (fetchPoolKeys) {
      try {
        marketId = await getMarketIdForTokenAddress(connection, tokenAddress);
        if (marketId) {
          poolKeys = await getPoolKeysForTokenAddress(connection, tokenAddress);
        }
      } catch (error) {
        console.error('Error fetching pool keys:', error);
      }
    }

    res.json({
      valid: true,
      token: tokenInfo,
      poolKeys,
      marketId: marketId?.toString()
    });
  } catch (error) {
    console.error('Token validation error:', error);
    res.status(500).json({ error: 'Failed to validate token' });
  }
});

// Session management
// Session creation file endpoint
app.post('/api/sessions/create-file', async (req, res) => {
  try {
    const { sessionData, tokenName } = req.body;
    
    if (!sessionData || !tokenName) {
      return res.status(400).json({ error: 'Session data and token name are required' });
    }

    // Generate session ID
    const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
    const sessionId = `${tokenName.toUpperCase()}_${timestamp}`;
    const filename = `${sessionId}_session.json`;
    const filePath = path.join(__dirname, 'sessions', filename);

    // Ensure sessions directory exists
    const sessionsDir = path.join(__dirname, 'sessions');
    if (!fs.existsSync(sessionsDir)) {
      fs.mkdirSync(sessionsDir, { recursive: true });
    }

    // Write session file
    fs.writeFileSync(filePath, JSON.stringify(sessionData, null, 2));

    res.json({
      success: true,
      sessionId,
      filename,
      message: 'Session file created successfully'
    });
  } catch (error) {
    console.error('Create session file error:', error);
    res.status(500).json({ error: 'Failed to create session file' });
  }
});

app.get('/api/sessions', (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const sessionsDir = './sessions';
    
    if (!fs.existsSync(sessionsDir)) {
      return res.json([]);
    }
    
    const sessionFiles = fs.readdirSync(sessionsDir)
      .filter((file: string) => file.endsWith('_session.json'));
    
    const sessions = sessionFiles.map((file: string) => {
      try {
        const filePath = path.join(sessionsDir, file);
        const sessionData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const sessionId = file.replace('_session.json', '');
        
        return {
          id: sessionId,
          tokenName: sessionData.tokenName || 'Unknown',
          tokenSymbol: sessionData.tokenSymbol || 'UNK',
          tokenAddress: sessionData.tokenAddress,
          walletCount: sessionData.tradingWallets?.length || 0,
          isTrading: activeSessions.has(sessionId),
          timestamp: sessionData.timestamp,
          status: activeSessions.has(sessionId) ? 'active' : 'stopped',
          adminWallet: sessionData.adminWallet?.publicKey,
          solPerWallet: sessionData.solPerWallet || 0
        };
      } catch (error) {
        console.error(`Error reading session file ${file}:`, error);
        return null;
      }
    }).filter(Boolean);
    
    res.json(sessions);
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

app.post('/api/sessions', async (req, res) => {
  try {
    const { 
      tokenAddress, 
      adminWalletPrivateKey, 
      walletCount = 5, 
      solAmount = 0.1,
      tradeStrategy = 'INCREASE_MAKERS_VOLUME'
    } = req.body;

    if (!tokenAddress) {
      return res.status(400).json({ error: 'Token address is required' });
    }

    // Validate token
    const tokenData = await getDexscreenerData(tokenAddress);
    if (!tokenData || !tokenData.pairs || tokenData.pairs.length === 0) {
      return res.status(404).json({ error: 'Token not found or invalid' });
    }

    const pair = tokenData.pairs[0];
    const tokenName = pair.baseToken.name;
    const tokenSymbol = pair.baseToken.symbol;

    // Get pool keys
    const marketId = await getMarketIdForTokenAddress(connection, tokenAddress);
    if (!marketId) {
      return res.status(404).json({ error: 'Market ID not found for token' });
    }

    const poolKeys = await getPoolKeysForTokenAddress(connection, tokenAddress);
    if (!poolKeys) {
      return res.status(404).json({ error: 'Pool keys not found for token' });
    }

    // Create admin wallet
    let adminWallet: WalletWithNumber;
    if (adminWalletPrivateKey) {
      adminWallet = createWalletWithNumber(adminWalletPrivateKey, 0);
    } else {
      adminWallet = new WalletWithNumber();
    }

    // Create trading wallets
    const tradingWallets = Array.from({ length: walletCount }, () => new WalletWithNumber());

    // Create session data
    const sessionTimestamp = new Date().toISOString();
    const sessionId = generateSessionId();
    
    const sessionData: SessionData = {
      admin: {
        number: adminWallet.number,
        address: adminWallet.publicKey,
        privateKey: adminWallet.privateKey
      },
      wallets: tradingWallets.map(wallet => ({
        number: wallet.number,
        address: wallet.publicKey,
        privateKey: wallet.privateKey,
        generationTimestamp: new Date().toISOString()
      })),
      tokenAddress,
      poolKeys,
      tokenName,
      timestamp: formatTimestampToEST(new Date(sessionTimestamp))
    };

    // Save session file
    const sessionFileName = `${tokenName}_${formatTimestampToEST(new Date(sessionTimestamp))}_session.json`;
    const sessionFilePath = path.join(swapConfig.SESSION_DIR, sessionFileName);
    
    await fs.promises.mkdir(swapConfig.SESSION_DIR, { recursive: true });
    await fs.promises.writeFile(sessionFilePath, JSON.stringify(sessionData, null, 2));

    // Store active session
    const activeSession: ActiveSession = {
      id: sessionId,
      data: sessionData,
      adminWallet,
      tradingWallets,
      tokenAddress,
      tokenName,
      tokenSymbol,
      poolKeys,
      isTrading: false,
      globalTradingFlag: { value: false },
      connection
    };

    activeSessions.set(sessionId, activeSession);

    res.json({
      sessionId,
      tokenName,
      tokenSymbol,
      adminWallet: {
        address: adminWallet.publicKey,
        privateKey: adminWallet.privateKey
      },
      walletCount: tradingWallets.length,
      sessionFile: sessionFileName
    });
  } catch (error) {
    console.error('Session creation error:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

app.get('/api/sessions/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = activeSessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json({
    id: session.id,
    tokenName: session.tokenName,
    tokenSymbol: session.tokenSymbol,
    tokenAddress: session.tokenAddress,
    adminWallet: {
      address: session.adminWallet.publicKey,
      number: session.adminWallet.number
    },
    walletCount: session.tradingWallets.length,
    isTrading: session.isTrading,
    timestamp: session.data.timestamp
  });
});

app.get('/api/sessions/:sessionId/wallets', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = activeSessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Get real-time wallet balances
    const walletsWithBalances = await Promise.all(
      session.tradingWallets.map(async (wallet, index) => {
        try {
          const solBalance = await getSolBalance(wallet, session.connection);
          const raydiumSwap = new RaydiumSwap(swapConfig.RPC_URL, wallet.privateKey);
          const tokenBalance = await getTokenBalance(raydiumSwap, session.tokenAddress);
          
          return {
            id: `wallet_${wallet.number}`,
            number: wallet.number,
            address: wallet.publicKey,
            privateKey: wallet.privateKey,
            solBalance,
            tokenBalance,
            isActive: solBalance > 0 || tokenBalance > 0,
            privateKeyVisible: false
          };
        } catch (error) {
          console.error(`Error getting balance for wallet ${index}:`, error);
          return {
            id: `wallet_${wallet.number}`,
            number: wallet.number,
            address: wallet.publicKey,
            privateKey: wallet.privateKey,
            solBalance: 0,
            tokenBalance: 0,
            isActive: false,
            privateKeyVisible: false
          };
        }
      })
    );

    res.json(walletsWithBalances);
  } catch (error) {
    console.error('Get session wallets error:', error);
    res.status(500).json({ error: 'Failed to get session wallets' });
  }
});

app.post('/api/sessions/:sessionId/start', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = activeSessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.isTrading) {
      return res.status(400).json({ error: 'Session is already trading' });
    }

    // Start trading (simplified - just set flag for now)
    session.isTrading = true;
    session.globalTradingFlag.value = true;

    res.json({ 
      success: true, 
      message: 'Trading started (simplified mode)',
      sessionId: session.id
    });
  } catch (error) {
    console.error('Start session error:', error);
    res.status(500).json({ error: 'Failed to start session' });
  }
});

app.post('/api/sessions/:sessionId/pause', (req, res) => {
  const { sessionId } = req.params;
  const session = activeSessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  session.globalTradingFlag.value = false;
  
  res.json({ 
    success: true, 
    message: 'Trading paused',
    sessionId: session.id
  });
});

app.post('/api/sessions/:sessionId/stop', (req, res) => {
  const { sessionId } = req.params;
  const session = activeSessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  session.isTrading = false;
  session.globalTradingFlag.value = false;
  
  res.json({ 
    success: true, 
    message: 'Trading stopped',
    sessionId: session.id
  });
});

// Session file management
app.get('/api/sessions/files', async (req, res) => {
  try {
    await fs.promises.mkdir(swapConfig.SESSION_DIR, { recursive: true });
    const files = await fs.promises.readdir(swapConfig.SESSION_DIR);
    const sessionFiles = files.filter(file => file.endsWith('_session.json'));
    
    const fileDetails = await Promise.all(
      sessionFiles.map(async (filename) => {
        try {
          const filePath = path.join(swapConfig.SESSION_DIR, filename);
          const stats = await fs.promises.stat(filePath);
          const content = await fs.promises.readFile(filePath, 'utf-8');
          const sessionData = JSON.parse(content);
          
          return {
            filename,
            tokenName: sessionData.tokenName || 'Unknown',
            lastModified: stats.mtime,
            size: `${(stats.size / 1024).toFixed(1)} KB`,
            walletCount: sessionData.wallets?.length || 0
          };
        } catch (error) {
          console.error(`Error reading session file ${filename}:`, error);
          return null;
        }
      })
    );

    res.json(fileDetails.filter(Boolean));
  } catch (error) {
    console.error('Get session files error:', error);
    res.status(500).json({ error: 'Failed to get session files' });
  }
});

app.get('/api/sessions/files/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(swapConfig.SESSION_DIR, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Session file not found' });
    }

    const content = await fs.promises.readFile(filePath, 'utf-8');
    const sessionData = JSON.parse(content);
    
    res.json(sessionData);
  } catch (error) {
    console.error('Get session file error:', error);
    res.status(500).json({ error: 'Failed to get session file' });
  }
});

app.post('/api/sessions/import', async (req, res) => {
  try {
    const { filename } = req.body;
    const filePath = path.join(swapConfig.SESSION_DIR, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Session file not found' });
    }

    const content = await fs.promises.readFile(filePath, 'utf-8');
    const sessionData: SessionData = JSON.parse(content);
    
    // Create session ID
    const sessionId = generateSessionId();
    
    // Recreate wallets from session data
    const adminWallet = createWalletWithNumber(sessionData.admin.privateKey, sessionData.admin.number);
    const tradingWallets = sessionData.wallets.map(wallet =>
      createWalletWithNumber(wallet.privateKey, wallet.number)
    );

    // Get token info
    const tokenData = await getDexscreenerData(sessionData.tokenAddress);
    const tokenSymbol = tokenData?.pairs?.[0]?.baseToken?.symbol || 'Unknown';

    // Store active session
    const activeSession: ActiveSession = {
      id: sessionId,
      data: sessionData,
      adminWallet,
      tradingWallets,
      tokenAddress: sessionData.tokenAddress,
      tokenName: sessionData.tokenName,
      tokenSymbol,
      poolKeys: sessionData.poolKeys,
      isTrading: false,
      globalTradingFlag: { value: false },
      connection
    };

    activeSessions.set(sessionId, activeSession);

    res.json({
      sessionId,
      message: 'Session imported successfully',
      tokenName: sessionData.tokenName,
      walletCount: tradingWallets.length
    });
  } catch (error) {
    console.error('Import session error:', error);
    res.status(500).json({ error: 'Failed to import session' });
  }
});

// Wallet operations
app.post('/api/wallets/distribute-sol', async (req, res) => {
  try {
    const { sessionId, totalAmount } = req.body;
    
    if (!sessionId || !totalAmount) {
      return res.status(400).json({ error: 'Session ID and total amount are required' });
    }

    const session = activeSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const { successWallets } = await distributeSol(
      session.adminWallet,
      session.tradingWallets,
      totalAmount,
      session.connection
    );

    res.json({
      success: true,
      message: `Distributed ${totalAmount} SOL to ${successWallets.length} wallets`,
      successCount: successWallets.length,
      totalWallets: session.tradingWallets.length
    });
  } catch (error) {
    console.error('Distribute SOL error:', error);
    res.status(500).json({ error: 'Failed to distribute SOL' });
  }
});

app.post('/api/wallets/collect-sol', async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    const session = activeSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Simple collect SOL implementation
    let totalCollected = 0;
    let successWallets = 0;
    
    for (const wallet of session.tradingWallets) {
      try {
        const balance = await getSolBalance(wallet, session.connection);
        if (balance > 0.001) { // Leave some SOL for transaction fees
          const amountToCollect = balance - 0.001;
          await sendSol(wallet, new PublicKey(session.adminWallet.publicKey), amountToCollect, session.connection);
          totalCollected += amountToCollect;
          successWallets++;
        }
      } catch (error) {
        console.error(`Failed to collect from wallet ${wallet.number}:`, error);
      }
    }

    res.json({
      success: true,
      message: `Collected ${totalCollected.toFixed(4)} SOL from ${successWallets} wallets`,
      successCount: successWallets,
      totalWallets: session.tradingWallets.length,
      totalCollected
    });
  } catch (error) {
    console.error('Collect SOL error:', error);
    res.status(500).json({ error: 'Failed to collect SOL' });
  }
});

// Wallet creation endpoint
app.post('/api/wallets/create', async (req, res) => {
  try {
    const { sessionId, count = 1 } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    // Generate new wallets
    const newWallets = [];
    for (let i = 0; i < count; i++) {
      const wallet = new WalletWithNumber();
      newWallets.push({
        number: wallet.number,
        address: wallet.publicKey,
        privateKey: wallet.privateKey,
        generationTimestamp: new Date().toISOString(),
        balance: 0
      });
    }

    res.json({
      success: true,
      wallets: newWallets,
      message: `Created ${count} new wallet(s)`
    });
  } catch (error) {
    console.error('Create wallets error:', error);
    res.status(500).json({ error: 'Failed to create wallets' });
  }
});

app.get('/api/wallets/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // First check active sessions
    let session = activeSessions.get(sessionId);
    
    // If not active, try to load from file
    if (!session) {
      const fs = require('fs');
      const path = require('path');
      const sessionFile = `${sessionId}_session.json`;
      const filePath = path.join('./sessions', sessionFile);
      
      if (fs.existsSync(filePath)) {
        const sessionData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        // Create temporary session for wallet info
        let adminWallet, tradingWallets;
        try {
          adminWallet = createWalletWithNumber(sessionData.admin.privateKey, sessionData.admin.number);
          tradingWallets = sessionData.wallets.map((wallet: any) =>
            createWalletWithNumber(wallet.privateKey, wallet.number)
          );
        } catch (error) {
          console.error('Invalid private keys in session file:', error);
          return res.status(400).json({ 
            error: 'Session file contains invalid private keys. This appears to be mock data.' 
          });
        }
        
        session = {
          id: sessionId,
          data: sessionData,
          adminWallet,
          tradingWallets,
          tokenAddress: sessionData.tokenAddress,
          tokenName: sessionData.tokenName,
          tokenSymbol: sessionData.tokenSymbol || 'UNK',
          poolKeys: sessionData.poolKeys,
          isTrading: false,
          globalTradingFlag: { value: false },
          connection
        };
      }
    }
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Get real-time wallet balances
    const walletsWithBalances = await Promise.all(
      session.tradingWallets.map(async (wallet, index) => {
        try {
          const solBalance = await getSolBalance(wallet, session.connection);
          const raydiumSwap = new RaydiumSwap(swapConfig.RPC_URL, wallet.privateKey);
          const tokenBalance = await getTokenBalance(raydiumSwap, session.tokenAddress);
          
          return {
            number: wallet.number,
            address: wallet.publicKey,
            solBalance: solBalance,
            tokenBalance: tokenBalance,
            status: 'active'
          };
        } catch (error) {
          console.error(`Error getting balance for wallet ${index}:`, error);
          return {
            number: wallet.number,
            address: wallet.publicKey,
            solBalance: 0,
            tokenBalance: 0,
            status: 'error'
          };
        }
      })
    );

    // Get admin wallet balance
    const adminSolBalance = await getSolBalance(session.adminWallet, session.connection);
    const adminRaydiumSwap = new RaydiumSwap(swapConfig.RPC_URL, session.adminWallet.privateKey);
    const adminTokenBalance = await getTokenBalance(adminRaydiumSwap, session.tokenAddress);

    res.json({
      sessionId: session.id,
      tokenAddress: session.tokenAddress,
      tokenName: session.tokenName,
      tokenSymbol: session.tokenSymbol,
      adminWallet: {
        number: session.adminWallet.number,
        address: session.adminWallet.publicKey,
        solBalance: adminSolBalance,
        tokenBalance: adminTokenBalance
      },
      tradingWallets: walletsWithBalances,
      totalSolBalance: walletsWithBalances.reduce((sum, w) => sum + w.solBalance, 0) + adminSolBalance,
      totalTokenBalance: walletsWithBalances.reduce((sum, w) => sum + w.tokenBalance, 0) + adminTokenBalance
    });
  } catch (error) {
    console.error('Get wallets error:', error);
    res.status(500).json({ error: 'Failed to get wallet information' });
  }
});

// Metrics and monitoring
// Transactions endpoint
app.get('/api/transactions', (req, res) => {
  try {
    // Mock transaction data for now - replace with real data from database/logs
    const transactions = [
      {
        id: '1',
        type: 'buy',
        amount: '1000',
        token: 'BONK',
        price: '0.000012',
        time: new Date(Date.now() - 300000).toISOString(),
        hash: '5KJp7UX4KzQXVtoxT5QqGEpVkd8HSNuyLMbBxkKjvdGG',
        status: 'success',
        fee: '0.000005'
      },
      {
        id: '2',
        type: 'sell',
        amount: '500',
        token: 'BONK',
        price: '0.000013',
        time: new Date(Date.now() - 600000).toISOString(),
        hash: '3Hw1JbkdVbwpXnVnNiSqHuVnHwRiDvfqGL2i8FTxrHpY',
        status: 'success',
        fee: '0.000005'
      },
      {
        id: '3',
        type: 'buy',
        amount: '2000',
        token: 'USDC',
        price: '1.00',
        time: new Date(Date.now() - 900000).toISOString(),
        hash: '7Nt8HQoLdPASQHcyJHTXhCUoSGY9ToBfvQcrFQtzDie7',
        status: 'failed',
        fee: '0.000005'
      }
    ];

    res.json(transactions);
  } catch (error) {
    console.error('Transactions error:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

app.get('/api/metrics', async (req, res) => {
  try {
    const metrics = {
      activeSessions: activeSessions.size,
      tradingSessions: Array.from(activeSessions.values()).filter(s => s.isTrading).length,
      totalWallets: Array.from(activeSessions.values()).reduce((sum, s) => sum + s.tradingWallets.length, 0),
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };

    res.json(metrics);
  } catch (error) {
    console.error('Get metrics error:', error);
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

// Error handling middleware
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('API Error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function startServer() {
  try {
    await initializeConnection();
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Minimal API Server running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();