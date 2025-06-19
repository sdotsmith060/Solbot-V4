'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  FileText, 
  Download, 
  Upload, 
  Eye, 
  Play, 
  Calendar, 
  Wallet,
  RefreshCw,
  Search,
  Filter,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import toast from 'react-hot-toast'
import { SessionFile, SessionData, WalletData } from '@/types'

interface SessionManagerProps {
  onSessionImport?: (sessionId: string) => void
}

export function SessionManager({ onSessionImport }: SessionManagerProps) {
  const [sessionFiles, setSessionFiles] = useState<SessionFile[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSession, setSelectedSession] = useState<SessionData | null>(null)
  const [showDetails, setShowDetails] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'wallets'>('date')
  const [isImporting, setIsImporting] = useState<string | null>(null)

  useEffect(() => {
    loadSessionFiles()
  }, [])

  const loadSessionFiles = async () => {
    setLoading(true)
    try {
      const apiUrl = 'https://work-2-deghialcmhllpyek.prod-runtime.all-hands.dev'
      console.log('Environment API URL:', process.env.NEXT_PUBLIC_API_URL)
      console.log('Final API URL:', apiUrl)
      console.log('Loading sessions from:', `${apiUrl}/api/sessions`)
      
      alert('About to make API request to: ' + `${apiUrl}/api/sessions`)
      
      const response = await fetch(`${apiUrl}/api/sessions`)
      console.log('Response status:', response.status)
      console.log('Response headers:', response.headers)
      
      if (response.ok) {
        const sessions = await response.json()
        console.log('Sessions loaded:', sessions)
        
        // Convert sessions to SessionFile format
        const files = sessions.map((session: any) => ({
          filename: `${session.id}_session.json`,
          tokenName: session.tokenName,
          lastModified: new Date(session.timestamp),
          size: '2.4 KB', // Placeholder
          walletCount: session.walletCount,
          id: session.id,
          tokenSymbol: session.tokenSymbol,
          tokenAddress: session.tokenAddress,
          status: session.status,
          isTrading: session.isTrading
        }))
        setSessionFiles(files)
        toast.success(`Loaded ${files.length} sessions`)
      } else {
        const errorText = await response.text()
        console.error('API Error:', response.status, errorText)
        throw new Error(`Failed to load sessions: ${response.status} ${errorText}`)
      }
    } catch (error) {
      console.error('Load session files error:', error)
      toast.error(`Failed to load sessions: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const loadSessionDetails = async (filename: string) => {
    try {
      const apiUrl = 'https://work-2-deghialcmhllpyek.prod-runtime.all-hands.dev'
      const response = await fetch(`${apiUrl}/api/sessions/files/${filename}`)
      
      if (response.ok) {
        const sessionData = await response.json()
        setSelectedSession(sessionData)
        setShowDetails(filename)
      } else {
        throw new Error('Failed to load session details')
      }
    } catch (error) {
      console.error('Load session details error:', error)
      toast.error('Failed to load session details')
    }
  }

  const importSession = async (filename: string) => {
    setIsImporting(filename)
    try {
      const apiUrl = 'https://work-2-deghialcmhllpyek.prod-runtime.all-hands.dev'
      const response = await fetch(`${apiUrl}/api/sessions/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename,
          userWallet: '11111111111111111111111111111111' // Default user wallet
        }),
      })
      
      if (response.ok) {
        const data = await response.json()
        toast.success(`Session imported successfully! ID: ${data.sessionId}`)
        onSessionImport?.(data.sessionId)
      } else {
        const error = await response.json()
        throw new Error(error.error || 'Failed to import session')
      }
    } catch (error) {
      console.error('Import session error:', error)
      toast.error('Failed to import session')
    } finally {
      setIsImporting(null)
    }
  }

  const filteredSessions = sessionFiles
    .filter(session => 
      session.tokenName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      session.filename.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.tokenName.localeCompare(b.tokenName)
        case 'wallets':
          // Extract wallet count from filename or default to 0
          const aWallets = parseInt(a.filename.match(/(\d+)_wallets/)?.[1] || '0')
          const bWallets = parseInt(b.filename.match(/(\d+)_wallets/)?.[1] || '0')
          return bWallets - aWallets
        case 'date':
        default:
          return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
      }
    })

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <span className="ml-3 text-gray-300">Loading session files...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <FileText className="w-6 h-6 text-blue-400" />
            <h2 className="text-xl font-semibold text-white">Session Manager</h2>
          </div>
          <button
            onClick={loadSessionFiles}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-200"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </button>
        </div>

        {/* Search and Filter */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search sessions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'date' | 'name' | 'wallets')}
              className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="date">Sort by Date</option>
              <option value="name">Sort by Token</option>
              <option value="wallets">Sort by Wallets</option>
            </select>
          </div>
        </div>

        {/* Session Count */}
        <div className="text-sm text-gray-400 mb-4">
          Found {filteredSessions.length} session{filteredSessions.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Session List */}
      <div className="space-y-4">
        {filteredSessions.length === 0 ? (
          <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 text-center">
            <FileText className="w-12 h-12 text-gray-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-300 mb-2">No Session Files Found</h3>
            <p className="text-gray-500">
              {searchTerm ? 'No sessions match your search criteria.' : 'No session files available to import.'}
            </p>
          </div>
        ) : (
          filteredSessions.map((session) => (
            <motion.div
              key={session.filename}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden"
            >
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-lg font-semibold text-white">{session.tokenName}</h3>
                      <span className="px-2 py-1 bg-blue-900 text-blue-300 text-xs rounded-full">
                        {session.size}
                      </span>
                    </div>
                    <div className="flex items-center space-x-4 text-sm text-gray-400">
                      <div className="flex items-center space-x-1">
                        <Calendar className="w-4 h-4" />
                        <span>{formatDate(session.lastModified)}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <FileText className="w-4 h-4" />
                        <span>{session.filename}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => loadSessionDetails(session.filename)}
                      className="flex items-center space-x-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors duration-200"
                    >
                      <Eye className="w-4 h-4" />
                      <span>View</span>
                    </button>
                    <button
                      onClick={() => importSession(session.filename)}
                      disabled={isImporting === session.filename}
                      className="flex items-center space-x-2 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors duration-200"
                    >
                      {isImporting === session.filename ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Importing...</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4" />
                          <span>Import</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => setShowDetails(showDetails === session.filename ? null : session.filename)}
                      className="p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors duration-200"
                    >
                      {showDetails === session.filename ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Session Details */}
              {showDetails === session.filename && selectedSession && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="border-t border-gray-700 bg-gray-750"
                >
                  <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Admin Wallet */}
                      <div>
                        <h4 className="text-sm font-medium text-gray-300 mb-3">Admin Wallet</h4>
                        <div className="bg-gray-800 rounded-lg p-4 space-y-2">
                          <div className="flex justify-between">
                            <span className="text-gray-400">Address:</span>
                            <span className="text-white font-mono text-sm">{selectedSession.admin.address}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Number:</span>
                            <span className="text-white">{selectedSession.admin.number}</span>
                          </div>
                        </div>
                      </div>

                      {/* Token Info */}
                      <div>
                        <h4 className="text-sm font-medium text-gray-300 mb-3">Token Information</h4>
                        <div className="bg-gray-800 rounded-lg p-4 space-y-2">
                          <div className="flex justify-between">
                            <span className="text-gray-400">Name:</span>
                            <span className="text-white">{selectedSession.tokenName}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Address:</span>
                            <span className="text-white font-mono text-sm">{selectedSession.tokenAddress}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Timestamp:</span>
                            <span className="text-white">{selectedSession.timestamp}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Trading Wallets */}
                    <div className="mt-6">
                      <h4 className="text-sm font-medium text-gray-300 mb-3">
                        Trading Wallets ({selectedSession.wallets.length})
                      </h4>
                      <div className="bg-gray-800 rounded-lg p-4 max-h-64 overflow-y-auto">
                        <div className="space-y-2">
                          {selectedSession.wallets.map((wallet, index) => (
                            <div key={wallet.number} className="flex items-center justify-between py-2 border-b border-gray-700 last:border-b-0">
                              <div className="flex items-center space-x-3">
                                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
                                  {wallet.number}
                                </div>
                                <span className="text-white font-mono text-sm">{wallet.address}</span>
                              </div>
                              <div className="text-gray-400 text-sm">
                                {wallet.generationTimestamp && formatDate(new Date(wallet.generationTimestamp))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </motion.div>
          ))
        )}
      </div>
    </div>
  )
}