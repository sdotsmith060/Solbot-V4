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
  createWalletWithNumber
} from './utility';
import { getPoolKeysForTokenAddress, getMarketIdForTokenAddress } from './pool-keys';
import RaydiumSwap from './RaydiumSwap';
import WalletWithNumber from './wallet';
import { dynamicTrade } from './dynamicTrade';
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

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'https://work-1-deghialcmhllpyek.prod-runtime.all-hands.dev'],
  credentials: true
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
app.get('/api/sessions', (req, res) => {
  const sessions = Array.from(activeSessions.values()).map(session => ({
    id: session.id,
    tokenName: session.tokenName,
    tokenSymbol: session.tokenSymbol,
    tokenAddress: session.tokenAddress,
    walletCount: session.tradingWallets.length,
    isTrading: session.isTrading,
    timestamp: session.data.timestamp
  }));
  
  res.json(sessions);
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

    // Start trading
    session.isTrading = true;
    session.globalTradingFlag.value = true;

    // Start dynamic trading in background
    dynamicTrade(
      session.adminWallet,
      session.tradingWallets,
      session.tokenAddress,
      'INCREASE_MAKERS_VOLUME', // Default strategy
      session.connection,
      session.data.timestamp,
      session.tokenName,
      session.globalTradingFlag
    ).catch(error => {
      console.error('Dynamic trade error:', error);
      session.isTrading = false;
      session.globalTradingFlag.value = false;
    });

    res.json({ 
      success: true, 
      message: 'Trading started',
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

// Metrics and monitoring
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
      console.log(`API Server running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();