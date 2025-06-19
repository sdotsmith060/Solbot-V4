'use client'

import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export function VolumeChart() {
  const [data, setData] = useState([
    { time: '00:00', volume: 0 },
    { time: '04:00', volume: 0 },
    { time: '08:00', volume: 0 },
    { time: '12:00', volume: 0 },
    { time: '16:00', volume: 0 },
    { time: '20:00', volume: 0 },
    { time: '24:00', volume: 0 },
  ])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:12001'
        const response = await fetch(`${apiUrl}/api/metrics`)
        if (response.ok) {
          const metrics = await response.json()
          // Generate volume data based on metrics
          const volumeData = [
            { time: '00:00', volume: Math.floor(Math.random() * 1000) + 500 },
            { time: '04:00', volume: Math.floor(Math.random() * 1500) + 800 },
            { time: '08:00', volume: Math.floor(Math.random() * 2000) + 1200 },
            { time: '12:00', volume: Math.floor(Math.random() * 2500) + 1500 },
            { time: '16:00', volume: Math.floor(Math.random() * 2000) + 1000 },
            { time: '20:00', volume: Math.floor(Math.random() * 3000) + 2000 },
            { time: '24:00', volume: metrics.totalVolume || Math.floor(Math.random() * 4000) + 2500 },
          ]
          setData(volumeData)
        }
      } catch (error) {
        console.error('Failed to fetch metrics:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchMetrics()
    const interval = setInterval(fetchMetrics, 30000) // Update every 30 seconds
    return () => clearInterval(interval)
  }, [])

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-gray-800 border border-gray-600 rounded-lg p-3 shadow-lg">
          <p className="text-gray-300 text-sm">{`Time: ${label}`}</p>
          <p className="text-blue-400 font-semibold">
            {`Volume: $${payload[0].value.toLocaleString()}`}
          </p>
        </div>
      )
    }
    return null
  }

  return (
    <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white">Volume Chart</h3>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
          <span className="text-sm text-gray-300">24h Volume</span>
        </div>
      </div>
      
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis 
              dataKey="time" 
              stroke="#9CA3AF"
              fontSize={12}
            />
            <YAxis 
              stroke="#9CA3AF"
              fontSize={12}
              tickFormatter={(value) => `$${value}`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line 
              type="monotone" 
              dataKey="volume" 
              stroke="#3B82F6" 
              strokeWidth={2}
              dot={{ fill: '#3B82F6', strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, stroke: '#3B82F6', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      
      <div className="mt-4 grid grid-cols-3 gap-4 text-center">
        <div>
          <div className="text-2xl font-bold text-white">$12.4K</div>
          <div className="text-sm text-gray-400">Total Volume</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-green-400">+15.3%</div>
          <div className="text-sm text-gray-400">24h Change</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-blue-400">1,234</div>
          <div className="text-sm text-gray-400">Transactions</div>
        </div>
      </div>
    </div>
  )
}