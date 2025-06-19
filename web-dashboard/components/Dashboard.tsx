'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { motion } from 'framer-motion'
import { 
  TrendingUp, 
  Settings, 
  Wallet, 
  BarChart3, 
  Play, 
  Pause, 
  Square,
  RefreshCw,
  DollarSign,
  Users,
  Activity,
  Zap
} from 'lucide-react'
import { TradingControls } from './TradingControls'
import { AdvancedTradingControls } from './AdvancedTradingControls'
import { BackendFlowTradingControls } from './BackendFlowTradingControls'
import { BackendTradingControls } from './BackendTradingControls'
import { AdvancedSessionManager } from './AdvancedSessionManager'
import { AdvancedWalletManager } from './AdvancedWalletManager'
import { RealTimeMonitor } from './RealTimeMonitor'
import { MetricsCards } from './MetricsCards'
import { VolumeChart } from './VolumeChart'
import { TransactionHistory } from './TransactionHistory'
import { PerformanceMetrics } from './PerformanceMetrics'
import { WalletManager } from './WalletManager'

import { SessionManager } from './SessionManager'
import { UserStats } from './UserStats'
import { useWebSocket } from '../hooks/useWebSocket'
import toast from 'react-hot-toast'

export function Dashboard() {
  const { publicKey, disconnect } = useWallet()
  const [activeTab, setActiveTab] = useState('trading')
  const [isTrading, setIsTrading] = useState(false)
  const [sessionData, setSessionData] = useState(null)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [currentWallet, setCurrentWallet] = useState<any>(null)
  const [realtimeMetrics, setRealtimeMetrics] = useState<any>(null)

  const [isProductionMode, setIsProductionMode] = useState(true)
  const [sessionWallets, setSessionWallets] = useState<any[]>([])
  const [tokenAddress, setTokenAddress] = useState<string>('')

  // Load wallet from localStorage on mount
  useEffect(() => {
    const savedWallet = localStorage.getItem('currentWallet')
    if (savedWallet) {
      try {
        setCurrentWallet(JSON.parse(savedWallet))
      } catch (error) {
        console.error('Error parsing saved wallet:', error)
      }
    }
  }, [])

  // WebSocket integration for real-time updates
  const { isConnected, error: wsError, joinSession, leaveSession } = useWebSocket({
    sessionId: currentSessionId,
    onSessionStarted: (data) => {
      console.log('Session started:', data)
      setIsTrading(true)
      toast.success('Trading session started!')
    },
    onSessionPaused: (data) => {
      console.log('Session paused:', data)
      setIsTrading(false)
      toast.info('Trading session paused')
    },
    onSessionStopped: (data) => {
      console.log('Session stopped:', data)
      setIsTrading(false)
      toast.info('Trading session stopped')
    },
    onTransactionStarted: (data) => {
      console.log('Transaction started:', data)
      toast.loading(`${data.transaction.type} transaction started...`, { id: data.transaction.id })
    },
    onTransactionSuccess: (data) => {
      console.log('Transaction success:', data)
      toast.success(`${data.transaction.type} transaction successful!`, { id: data.transaction.id })
    },
    onTransactionFailed: (data) => {
      console.log('Transaction failed:', data)
      toast.error(`${data.transaction.type} transaction failed: ${data.error}`, { id: data.transaction.id })
    },
    onTradingError: (data) => {
      console.error('Trading error:', data)
      toast.error(`Trading error: ${data.error}`)
    },
    onMetricsUpdate: (data) => {
      console.log('Metrics update:', data)
      setRealtimeMetrics(data)
    }
  })

  // Handle session changes
  useEffect(() => {
    if (currentSessionId && joinSession) {
      joinSession(currentSessionId)
    }
  }, [currentSessionId, joinSession])

  const tabs = isProductionMode ? [
    { id: 'trading', label: 'Advanced Trading', icon: TrendingUp },
    { id: 'sessions', label: 'Session Manager', icon: Activity },
    { id: 'wallets', label: 'Wallet Manager', icon: Wallet },
    { id: 'monitor', label: 'Real-Time Monitor', icon: Zap },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: Settings },
  ] : [
    { id: 'trading', label: 'Trading', icon: TrendingUp },
    { id: 'sessions', label: 'Sessions', icon: Activity },
    { id: 'wallets', label: 'Wallets', icon: Wallet },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: Settings },
  ]

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-white" />
                </div>
                <span className="text-2xl font-bold text-white">Solbot</span>
              </div>
              
              {/* Status Indicators */}
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${isTrading ? 'bg-green-500' : 'bg-gray-500'}`}></div>
                  <span className="text-sm text-gray-300">
                    {isTrading ? 'Trading Active' : 'Idle'}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-blue-500' : 'bg-red-500'}`}></div>
                  <span className="text-sm text-gray-300">
                    {isConnected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              {/* Production Mode Toggle */}
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-300">Simple</span>
                <button
                  onClick={() => setIsProductionMode(!isProductionMode)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    isProductionMode ? 'bg-blue-600' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      isProductionMode ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <span className="text-sm text-gray-300">Production</span>
              </div>

              {/* Current Wallet Info - Only show if wallet came from Backend Flow */}
              {currentWallet && currentWallet.fromBackendFlow && (
                <div className="bg-gray-700 rounded-lg px-4 py-2 border border-gray-600">
                  <div className="flex items-center space-x-3">
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                    <div>
                      <div className="text-xs text-gray-400">Admin Trading Wallet</div>
                      <div className="text-sm font-mono text-white">
                        {currentWallet.publicKey.slice(0, 8)}...{currentWallet.publicKey.slice(-8)}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(currentWallet.publicKey)
                        toast.success('Public key copied to clipboard')
                      }}
                      className="text-gray-400 hover:text-white transition-colors"
                      title="Copy public key"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}

              {/* Start Trading Setup Button - Only show if no wallet from Backend Flow */}
              {!currentWallet?.fromBackendFlow && (
                <button
                  onClick={() => setActiveTab('trading')}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors"
                >
                  <Wallet className="w-4 h-4" />
                  <span>Start Trading Setup</span>
                </button>
              )}
              <UserStats />
              <WalletMultiButton className="!bg-gray-700 hover:!bg-gray-600 !border-gray-600" />
            </div>
          </div>
        </div>
      </header>



      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Navigation Tabs */}
        <div className="flex space-x-1 bg-gray-800 p-1 rounded-lg mb-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-all duration-200 ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {activeTab === 'trading' && (
            <div className="space-y-8">
              <MetricsCards />
              {isProductionMode ? (
                <BackendTradingControls
                  sessionId={currentSessionId}
                  onSessionUpdate={() => {
                    // Refresh session data
                    if (currentSessionId) {
                      // Trigger refresh of other components
                      setSessionData(null)
                    }
                  }}
                />
              ) : (
                <div className="grid lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2">
                    <TradingControls 
                      isTrading={isTrading}
                      onTradingChange={setIsTrading}
                      onSessionChange={setCurrentSessionId}
                      currentWallet={currentWallet}
                    />
                  </div>
                  <div>
                    <VolumeChart />
                  </div>
                </div>
              )}
              <TransactionHistory />
            </div>
          )}

          {activeTab === 'sessions' && (
            <div className="space-y-8">
              {isProductionMode ? (
                <AdvancedSessionManager
                  currentSession={sessionData}
                  onSessionSelect={(session) => {
                    setSessionData(session)
                    setCurrentSessionId(session.id)
                    setTokenAddress(session.tokenAddress || '')
                  }}
                  onSessionRestart={(sessionId, restartPoint) => {
                    console.log(`Restarting session ${sessionId} from point ${restartPoint}`)
                  }}
                  onSessionDelete={(sessionId) => {
                    if (currentSessionId === sessionId) {
                      setCurrentSessionId(null)
                      setSessionData(null)
                    }
                  }}
                />
              ) : (
                <>
                  <SessionManager 
                    onSessionImport={(sessionId) => {
                      setCurrentSessionId(sessionId)
                      setActiveTab('trading')
                      toast.success('Session imported! Switch to Trading tab to start.')
                    }}
                  />

                </>
              )}
            </div>
          )}

          {activeTab === 'wallets' && (
            <div className="space-y-8">
              {isProductionMode ? (
                <AdvancedWalletManager
                  currentWallet={currentWallet}
                  sessionWallets={sessionWallets}
                  tokenAddress={tokenAddress}
                  onWalletSelect={(wallet) => {
                    setCurrentWallet(wallet)
                    localStorage.setItem('currentWallet', JSON.stringify(wallet))
                  }}
                  onWalletsUpdate={setSessionWallets}
                />
              ) : (
                <WalletManager sessionId={currentSessionId} />
              )}
            </div>
          )}

          {activeTab === 'monitor' && isProductionMode && (
            <RealTimeMonitor
              sessionId={currentSessionId}
              tokenAddress={tokenAddress}
              isConnected={isConnected}
            />
          )}

          {activeTab === 'analytics' && (
            <div className="space-y-8">
              <div className="grid lg:grid-cols-2 gap-8">
                <VolumeChart />
                <PerformanceMetrics />
              </div>
              <TransactionHistory />
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="max-w-2xl space-y-8">
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <h3 className="text-lg font-semibold text-white mb-4">Trading Settings</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Max Slippage (%)
                    </label>
                    <input
                      type="number"
                      defaultValue="5"
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Trade Interval (seconds)
                    </label>
                    <input
                      type="number"
                      defaultValue="8"
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Min SOL per Wallet
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      defaultValue="0.001"
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <h3 className="text-lg font-semibold text-white mb-4">Notifications</h3>
                <div className="space-y-3">
                  <label className="flex items-center">
                    <input type="checkbox" defaultChecked className="mr-3" />
                    <span className="text-gray-300">Trading alerts</span>
                  </label>
                  <label className="flex items-center">
                    <input type="checkbox" defaultChecked className="mr-3" />
                    <span className="text-gray-300">Error notifications</span>
                  </label>
                  <label className="flex items-center">
                    <input type="checkbox" className="mr-3" />
                    <span className="text-gray-300">Daily reports</span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>


    </div>
  )
}