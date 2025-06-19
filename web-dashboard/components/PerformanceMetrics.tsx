'use client'

import { useState, useEffect } from 'react'

export function PerformanceMetrics() {
  const [metrics, setMetrics] = useState({
    successRate: 0,
    avgSlippage: 0,
    totalFees: 0,
    activeSessions: 0,
    tradingSessions: 0
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:12001'
        const response = await fetch(`${apiUrl}/api/metrics`)
        if (response.ok) {
          const data = await response.json()
          setMetrics({
            successRate: data.successRate || 0,
            avgSlippage: data.avgSlippage || 0,
            totalFees: data.totalFees || 0,
            activeSessions: data.activeSessions || 0,
            tradingSessions: data.tradingSessions || 0
          })
        }
      } catch (error) {
        console.error('Failed to fetch metrics:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchMetrics()
    const interval = setInterval(fetchMetrics, 10000) // Update every 10 seconds
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">Performance Metrics</h3>
        <div className="space-y-4">
          <div className="animate-pulse">
            <div className="h-4 bg-gray-700 rounded w-3/4 mb-2"></div>
            <div className="h-4 bg-gray-700 rounded w-1/2 mb-2"></div>
            <div className="h-4 bg-gray-700 rounded w-2/3"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
      <h3 className="text-lg font-semibold text-white mb-4">Performance Metrics</h3>
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-gray-300">Success Rate</span>
          <span className="text-green-400 font-semibold">
            {metrics.successRate > 0 ? `${metrics.successRate.toFixed(1)}%` : 'N/A'}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-300">Avg. Slippage</span>
          <span className="text-blue-400 font-semibold">
            {metrics.avgSlippage > 0 ? `${metrics.avgSlippage.toFixed(1)}%` : 'N/A'}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-300">Total Fees Paid</span>
          <span className="text-yellow-400 font-semibold">
            {metrics.totalFees > 0 ? `${metrics.totalFees.toFixed(6)} SOL` : 'N/A'}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-300">Active Sessions</span>
          <span className="text-purple-400 font-semibold">{metrics.activeSessions}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-300">Trading Sessions</span>
          <span className="text-orange-400 font-semibold">{metrics.tradingSessions}</span>
        </div>
      </div>
    </div>
  )
}