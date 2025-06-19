'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  Play, 
  Pause, 
  Square, 
  Settings, 
  TrendingUp, 
  DollarSign,
  Clock,
  Activity,
  AlertCircle,
  CheckCircle
} from 'lucide-react'
import toast from 'react-hot-toast'

interface BackendTradingControlsProps {
  sessionId: string | null
  onSessionUpdate?: () => void
}

interface SessionStatus {
  id: string
  tokenName: string
  tokenSymbol: string
  tokenAddress: string
  walletCount: number
  isTrading: boolean
  timestamp: string
}

export function BackendTradingControls({ sessionId, onSessionUpdate }: BackendTradingControlsProps) {
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // New session creation state
  const [showCreateSession, setShowCreateSession] = useState(false)
  const [tokenAddress, setTokenAddress] = useState('')
  const [adminPrivateKey, setAdminPrivateKey] = useState('')
  const [walletCount, setWalletCount] = useState(5)
  const [solAmount, setSolAmount] = useState(0.1)
  const [validatingToken, setValidatingToken] = useState(false)
  const [tokenInfo, setTokenInfo] = useState<any>(null)

  useEffect(() => {
    if (sessionId) {
      loadSessionStatus()
    }
  }, [sessionId])

  const loadSessionStatus = async () => {
    if (!sessionId) return

    setLoading(true)
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:12001'
      const response = await fetch(`${apiUrl}/api/sessions/${sessionId}`)
      
      if (response.ok) {
        const data = await response.json()
        setSessionStatus(data)
      } else {
        throw new Error('Failed to load session status')
      }
    } catch (error) {
      console.error('Load session status error:', error)
      toast.error('Failed to load session status')
    } finally {
      setLoading(false)
    }
  }

  const validateToken = async () => {
    if (!tokenAddress) {
      toast.error('Please enter a token address')
      return
    }

    setValidatingToken(true)
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:12001'
      const response = await fetch(`${apiUrl}/api/tokens/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tokenAddress, fetchPoolKeys: true })
      })

      if (response.ok) {
        const data = await response.json()
        setTokenInfo(data.token)
        toast.success(`Token validated: ${data.token.name} (${data.token.symbol})`)
      } else {
        const error = await response.json()
        throw new Error(error.error || 'Token validation failed')
      }
    } catch (error) {
      console.error('Token validation error:', error)
      toast.error('Token validation failed')
      setTokenInfo(null)
    } finally {
      setValidatingToken(false)
    }
  }

  const createSession = async () => {
    if (!tokenAddress) {
      toast.error('Please enter and validate a token address')
      return
    }

    if (!tokenInfo) {
      toast.error('Please validate the token first')
      return
    }

    setActionLoading('create')
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:12001'
      const response = await fetch(`${apiUrl}/api/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tokenAddress,
          adminWalletPrivateKey: adminPrivateKey || undefined,
          walletCount,
          solAmount,
          tradeStrategy: 'INCREASE_MAKERS_VOLUME'
        })
      })

      if (response.ok) {
        const data = await response.json()
        toast.success(`Session created successfully! ID: ${data.sessionId}`)
        setShowCreateSession(false)
        onSessionUpdate?.()
        
        // Reset form
        setTokenAddress('')
        setAdminPrivateKey('')
        setTokenInfo(null)
        setWalletCount(5)
        setSolAmount(0.1)
      } else {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create session')
      }
    } catch (error) {
      console.error('Create session error:', error)
      toast.error('Failed to create session')
    } finally {
      setActionLoading(null)
    }
  }

  const startTrading = async () => {
    if (!sessionId) return

    setActionLoading('start')
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:12001'
      const response = await fetch(`${apiUrl}/api/sessions/${sessionId}/start`, {
        method: 'POST'
      })

      if (response.ok) {
        toast.success('Trading started successfully!')
        await loadSessionStatus()
        onSessionUpdate?.()
      } else {
        const error = await response.json()
        throw new Error(error.error || 'Failed to start trading')
      }
    } catch (error) {
      console.error('Start trading error:', error)
      toast.error('Failed to start trading')
    } finally {
      setActionLoading(null)
    }
  }

  const pauseTrading = async () => {
    if (!sessionId) return

    setActionLoading('pause')
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:12001'
      const response = await fetch(`${apiUrl}/api/sessions/${sessionId}/pause`, {
        method: 'POST'
      })

      if (response.ok) {
        toast.success('Trading paused')
        await loadSessionStatus()
        onSessionUpdate?.()
      } else {
        const error = await response.json()
        throw new Error(error.error || 'Failed to pause trading')
      }
    } catch (error) {
      console.error('Pause trading error:', error)
      toast.error('Failed to pause trading')
    } finally {
      setActionLoading(null)
    }
  }

  const stopTrading = async () => {
    if (!sessionId) return

    setActionLoading('stop')
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:12001'
      const response = await fetch(`${apiUrl}/api/sessions/${sessionId}/stop`, {
        method: 'POST'
      })

      if (response.ok) {
        toast.success('Trading stopped')
        await loadSessionStatus()
        onSessionUpdate?.()
      } else {
        const error = await response.json()
        throw new Error(error.error || 'Failed to stop trading')
      }
    } catch (error) {
      console.error('Stop trading error:', error)
      toast.error('Failed to stop trading')
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <span className="ml-3 text-gray-300">Loading trading controls...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Session Status */}
      {sessionStatus ? (
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <Activity className="w-6 h-6 text-blue-400" />
              <h2 className="text-xl font-semibold text-white">Trading Session</h2>
              <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm ${
                sessionStatus.isTrading 
                  ? 'bg-green-900 text-green-300' 
                  : 'bg-gray-700 text-gray-300'
              }`}>
                {sessionStatus.isTrading ? (
                  <>
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                    <span>Trading Active</span>
                  </>
                ) : (
                  <>
                    <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                    <span>Trading Stopped</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Session Info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-gray-700 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <TrendingUp className="w-4 h-4 text-blue-400" />
                <span className="text-gray-300 text-sm">Token</span>
              </div>
              <div className="text-white font-semibold">{sessionStatus.tokenName}</div>
              <div className="text-gray-400 text-sm">{sessionStatus.tokenSymbol}</div>
            </div>

            <div className="bg-gray-700 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <DollarSign className="w-4 h-4 text-green-400" />
                <span className="text-gray-300 text-sm">Wallets</span>
              </div>
              <div className="text-white font-semibold">{sessionStatus.walletCount}</div>
              <div className="text-gray-400 text-sm">Trading wallets</div>
            </div>

            <div className="bg-gray-700 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Clock className="w-4 h-4 text-purple-400" />
                <span className="text-gray-300 text-sm">Created</span>
              </div>
              <div className="text-white font-semibold">{sessionStatus.timestamp}</div>
              <div className="text-gray-400 text-sm">Session start</div>
            </div>
          </div>

          {/* Trading Controls */}
          <div className="flex items-center space-x-4">
            {!sessionStatus.isTrading ? (
              <button
                onClick={startTrading}
                disabled={actionLoading === 'start'}
                className="flex items-center space-x-2 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors duration-200"
              >
                {actionLoading === 'start' ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Play className="w-4 h-4" />
                )}
                <span>Start Trading</span>
              </button>
            ) : (
              <button
                onClick={pauseTrading}
                disabled={actionLoading === 'pause'}
                className="flex items-center space-x-2 px-6 py-3 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors duration-200"
              >
                {actionLoading === 'pause' ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Pause className="w-4 h-4" />
                )}
                <span>Pause Trading</span>
              </button>
            )}

            <button
              onClick={stopTrading}
              disabled={actionLoading === 'stop'}
              className="flex items-center space-x-2 px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors duration-200"
            >
              {actionLoading === 'stop' ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <Square className="w-4 h-4" />
              )}
              <span>Stop Trading</span>
            </button>
          </div>
        </div>
      ) : (
        /* Create New Session */
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <Settings className="w-6 h-6 text-blue-400" />
              <h2 className="text-xl font-semibold text-white">Create Trading Session</h2>
            </div>
            {!showCreateSession && (
              <button
                onClick={() => setShowCreateSession(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-200"
              >
                <Play className="w-4 h-4" />
                <span>New Session</span>
              </button>
            )}
          </div>

          {showCreateSession ? (
            <div className="space-y-6">
              {/* Token Address */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Token Address
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={tokenAddress}
                    onChange={(e) => setTokenAddress(e.target.value)}
                    placeholder="Enter Solana token address..."
                    className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={validateToken}
                    disabled={validatingToken || !tokenAddress}
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors duration-200"
                  >
                    {validatingToken ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <CheckCircle className="w-4 h-4" />
                    )}
                    <span>Validate</span>
                  </button>
                </div>
                {tokenInfo && (
                  <div className="mt-2 p-3 bg-green-900 border border-green-700 rounded-lg">
                    <div className="flex items-center space-x-2 text-green-300">
                      <CheckCircle className="w-4 h-4" />
                      <span className="font-medium">{tokenInfo.name} ({tokenInfo.symbol})</span>
                    </div>
                    <div className="text-green-400 text-sm mt-1">
                      Price: ${tokenInfo.price} | 24h Volume: ${tokenInfo.volume24h}
                    </div>
                  </div>
                )}
              </div>

              {/* Admin Wallet */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Admin Wallet Private Key (Optional)
                </label>
                <input
                  type="password"
                  value={adminPrivateKey}
                  onChange={(e) => setAdminPrivateKey(e.target.value)}
                  placeholder="Leave empty to generate new wallet..."
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-gray-400 text-sm mt-1">
                  If empty, a new admin wallet will be generated
                </p>
              </div>

              {/* Configuration */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Number of Trading Wallets
                  </label>
                  <input
                    type="number"
                    value={walletCount}
                    onChange={(e) => setWalletCount(Number(e.target.value))}
                    min="1"
                    max="50"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    SOL Amount per Wallet
                  </label>
                  <input
                    type="number"
                    value={solAmount}
                    onChange={(e) => setSolAmount(Number(e.target.value))}
                    min="0.001"
                    step="0.001"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center space-x-4">
                <button
                  onClick={createSession}
                  disabled={actionLoading === 'create' || !tokenInfo}
                  className="flex items-center space-x-2 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors duration-200"
                >
                  {actionLoading === 'create' ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  <span>Create Session</span>
                </button>

                <button
                  onClick={() => setShowCreateSession(false)}
                  className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors duration-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <AlertCircle className="w-12 h-12 text-gray-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-300 mb-2">No Active Trading Session</h3>
              <p className="text-gray-500 mb-6">
                Create a new trading session or import an existing one to start trading
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}