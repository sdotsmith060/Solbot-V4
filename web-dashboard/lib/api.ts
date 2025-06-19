// API Configuration for Production
export const API_CONFIG = {
  // Use environment variable or fallback to local development
  BASE_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:12001',
  
  // WebSocket URL
  WS_URL: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:12001',
  
  // API endpoints
  ENDPOINTS: {
    HEALTH: '/api/health',
    TOKENS_VALIDATE: '/api/tokens/validate',
    SESSIONS: '/api/sessions',
    SESSIONS_CREATE: '/api/sessions',
    SESSIONS_START: (id: string) => `/api/sessions/${id}/start`,
    SESSIONS_PAUSE: (id: string) => `/api/sessions/${id}/pause`,
    SESSIONS_STOP: (id: string) => `/api/sessions/${id}/stop`,
    SESSIONS_WALLETS: (id: string) => `/api/sessions/${id}/wallets`,
    WALLETS_CREATE: '/api/wallets/create',
    WALLETS_CREATE_MULTIPLE: '/api/wallets/create-multiple',
    WALLETS_DISTRIBUTE_SOL: '/api/wallets/distribute-sol',
    SESSIONS_CREATE_FILE: '/api/sessions/create-file',
    METRICS: '/api/metrics',
    TRANSACTIONS: '/api/transactions',
    USER_STATS: (wallet: string) => `/api/users/${wallet}/stats`
  }
}

// Helper function to make API calls
export async function apiCall(endpoint: string, options: RequestInit = {}) {
  const url = `${API_CONFIG.BASE_URL}${endpoint}`
  
  const defaultOptions: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  }
  
  const response = await fetch(url, { ...defaultOptions, ...options })
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Network error' }))
    throw new Error(errorData.error || `HTTP ${response.status}`)
  }
  
  return response.json()
}

// Specific API functions
export const api = {
  // Health check
  health: () => apiCall(API_CONFIG.ENDPOINTS.HEALTH),
  
  // Token validation
  validateToken: (tokenAddress: string, fetchPoolKeys: boolean = true) => 
    apiCall(API_CONFIG.ENDPOINTS.TOKENS_VALIDATE, {
      method: 'POST',
      body: JSON.stringify({ tokenAddress, fetchPoolKeys })
    }),
  
  // Session management
  getSessions: () => apiCall(API_CONFIG.ENDPOINTS.SESSIONS),
  
  createSession: (sessionData: any) =>
    apiCall(API_CONFIG.ENDPOINTS.SESSIONS_CREATE, {
      method: 'POST',
      body: JSON.stringify(sessionData)
    }),
  
  startSession: (sessionId: string) =>
    apiCall(API_CONFIG.ENDPOINTS.SESSIONS_START(sessionId), {
      method: 'POST'
    }),
  
  pauseSession: (sessionId: string) =>
    apiCall(API_CONFIG.ENDPOINTS.SESSIONS_PAUSE(sessionId), {
      method: 'POST'
    }),
  
  stopSession: (sessionId: string) =>
    apiCall(API_CONFIG.ENDPOINTS.SESSIONS_STOP(sessionId), {
      method: 'POST'
    }),
  
  getSessionWallets: (sessionId: string) =>
    apiCall(API_CONFIG.ENDPOINTS.SESSIONS_WALLETS(sessionId)),
  
  // Wallet management
  createWallet: (type: 'generate' | 'import', privateKey?: string) =>
    apiCall(API_CONFIG.ENDPOINTS.WALLETS_CREATE, {
      method: 'POST',
      body: JSON.stringify({ type, privateKey })
    }),
  
  createMultipleWallets: (count: number) =>
    apiCall(API_CONFIG.ENDPOINTS.WALLETS_CREATE_MULTIPLE, {
      method: 'POST',
      body: JSON.stringify({ count })
    }),
  
  distributeSol: (fromWallet: any, toWallets: string[], totalAmount: number) =>
    apiCall(API_CONFIG.ENDPOINTS.WALLETS_DISTRIBUTE_SOL, {
      method: 'POST',
      body: JSON.stringify({ fromWallet, toWallets, totalAmount })
    }),
  
  createSessionFile: (data: { sessionData: any, tokenName: string }) =>
    apiCall(API_CONFIG.ENDPOINTS.SESSIONS_CREATE_FILE, {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  
  // Metrics and stats
  getMetrics: () => apiCall(API_CONFIG.ENDPOINTS.METRICS),
  
  getTransactions: (limit?: number, userWallet?: string) => {
    const params = new URLSearchParams()
    if (limit) params.append('limit', limit.toString())
    if (userWallet) params.append('userWallet', userWallet)
    
    return apiCall(`${API_CONFIG.ENDPOINTS.TRANSACTIONS}?${params}`)
  },
  
  getUserStats: (walletAddress: string) =>
    apiCall(API_CONFIG.ENDPOINTS.USER_STATS(walletAddress))
}