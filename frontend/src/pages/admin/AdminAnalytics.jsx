import { useEffect, useState } from 'react'
import { useAdminStore } from '../../stores/adminStore'
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown,
  Users,
  CreditCard,
  Calendar,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react'

const PRIMARY = '#E50914'
const BG_SURFACE = '#141414'
const BORDER = '#2a2a2a'

function AdminAnalytics() {
  const { fetchAnalytics } = useAdminStore()
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState('7d') // 7d, 30d, 90d, 1y

  useEffect(() => {
    loadAnalytics()
  }, [timeRange])

  const loadAnalytics = async () => {
    try {
      const data = await fetchAnalytics()
      setAnalytics(data)
    } catch (error) {
      console.error('Analytics load error:', error)
    } finally {
      setLoading(false)
    }
  }

  const timeRanges = [
    { value: '7d', label: 'Son 7 Gün' },
    { value: '30d', label: 'Son 30 Gün' },
    { value: '90d', label: 'Son 3 Ay' },
    { value: '1y', label: 'Son 1 Yıl' }
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-6 h-6" style={{ color: PRIMARY }} />
            Detaylı Analiz
          </h1>
          <p className="text-gray-400">Kapsamlı sistem istatistikleri</p>
        </div>
        
        {/* Time Range Selector */}
        <div className="flex gap-2">
          {timeRanges.map((range) => (
            <button
              key={range.value}
              onClick={() => setTimeRange(range.value)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                timeRange === range.value 
                  ? 'text-white' 
                  : 'text-gray-400 hover:text-white'
              }`}
              style={{ 
                backgroundColor: timeRange === range.value ? PRIMARY : '#2a2a2a'
              }}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Toplam Gelir"
          value={`₺${analytics?.revenue?.total?.toLocaleString() || 0}`}
          change={analytics?.revenue?.change}
          icon={CreditCard}
          color="#10b981"
        />
        <MetricCard
          title="Yeni Kullanıcı"
          value={`+${analytics?.users?.new || 0}`}
          change={analytics?.users?.growth}
          icon={Users}
          color="#3b82f6"
        />
        <MetricCard
          title="Aktif Kullanıcı"
          value={analytics?.users?.active || 0}
          subtitle={`%${Math.round((analytics?.users?.active / analytics?.users?.total) * 100) || 0} oranında`}
          icon={Users}
          color="#8b5cf6"
        />
        <MetricCard
          title="Toplam Ödeme"
          value={analytics?.payments?.total || 0}
          subtitle={`${analytics?.payments?.pending || 0} bekliyor`}
          icon={CreditCard}
          color="#f59e0b"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Chart */}
        <div 
          className="rounded-2xl p-6"
          style={{ backgroundColor: BG_SURFACE, border: `1px solid ${BORDER}` }}
        >
          <h2 className="text-lg font-bold text-white mb-4">Gelir Trendi</h2>
          <div className="h-64 flex items-end justify-between gap-2">
            {analytics?.revenue?.daily?.map((amount, index) => (
              <div key={index} className="flex-1 flex flex-col items-center gap-2">
                <div 
                  className="w-full rounded-t-lg transition-all hover:opacity-80 relative group"
                  style={{ 
                    height: `${(amount / 2000) * 100}%`, 
                    backgroundColor: PRIMARY,
                    opacity: 0.8
                  }}
                >
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black px-2 py-1 rounded text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    ₺{amount}
                  </div>
                </div>
                <span className="text-xs text-gray-500">
                  {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'][index]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Package Distribution */}
        <div 
          className="rounded-2xl p-6"
          style={{ backgroundColor: BG_SURFACE, border: `1px solid ${BORDER}` }}
        >
          <h2 className="text-lg font-bold text-white mb-4">Paket Dağılımı</h2>
          <div className="space-y-4">
            {analytics?.packages?.distribution?.map((pkg, index) => (
              <div key={index}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-300">{pkg.name}</span>
                  <span className="text-white font-medium">{pkg.count} ({pkg.percentage}%)</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#2a2a2a' }}>
                  <div 
                    className="h-full rounded-full transition-all"
                    style={{ 
                      width: `${pkg.percentage}%`, 
                      backgroundColor: [PRIMARY, '#3b82f6', '#10b981', '#f59e0b'][index]
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Payment Methods */}
      <div 
        className="rounded-2xl p-6"
        style={{ backgroundColor: BG_SURFACE, border: `1px solid ${BORDER}` }}
      >
        <h2 className="text-lg font-bold text-white mb-4">Ödeme Yöntemleri</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {analytics?.payments?.methods?.map((method, index) => (
            <div 
              key={index}
              className="p-4 rounded-xl"
              style={{ backgroundColor: '#1a1a1a' }}
            >
              <p className="text-gray-400 text-sm mb-1">{method.name}</p>
              <p className="text-2xl font-bold text-white mb-2">₺{(method.amount || 0).toLocaleString()}</p>
              <p className="text-sm" style={{ color: PRIMARY }}>{method.count} işlem</p>
            </div>
          ))}
        </div>
      </div>

      {/* Top Users */}
      <div 
        className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: BG_SURFACE, border: `1px solid ${BORDER}` }}
      >
        <div className="p-4 border-b" style={{ borderColor: BORDER }}>
          <h2 className="text-lg font-bold text-white">En Çok Harcama Yapan Kullanıcılar</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-gray-400 text-sm border-b" style={{ borderColor: BORDER }}>
                <th className="p-4 font-medium">Sıra</th>
                <th className="p-4 font-medium">Kullanıcı Kodu</th>
                <th className="p-4 font-medium">Toplam Harcama</th>
                <th className="p-4 font-medium">Ödeme Sayısı</th>
              </tr>
            </thead>
            <tbody>
              {analytics?.topUsers?.map((user, index) => (
                <tr key={index} className="border-b hover:bg-white/5 transition-colors" style={{ borderColor: BORDER }}>
                  <td className="p-4">
                    <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                      style={{ 
                        backgroundColor: index === 0 ? '#fbbf24' : index === 1 ? '#9ca3af' : index === 2 ? '#b45309' : '#2a2a2a',
                        color: index < 3 ? 'black' : 'white'
                      }}
                    >
                      {index + 1}
                    </span>
                  </td>
                  <td className="p-4 text-white font-mono">{user.code}</td>
                  <td className="p-4 text-white font-bold">₺{(user.totalSpent || 0).toLocaleString()}</td>
                  <td className="p-4 text-gray-400">{user.payments} ödeme</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function MetricCard({ title, value, change, subtitle, icon: Icon, color }) {
  const isPositive = change >= 0
  
  return (
    <div 
      className="p-6 rounded-2xl"
      style={{ backgroundColor: BG_SURFACE, border: `1px solid ${BORDER}` }}
    >
      <div className="flex items-start justify-between mb-4">
        <div 
          className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${color}20` }}
        >
          <Icon className="w-6 h-6" style={{ color }} />
        </div>
        {change !== undefined && (
          <div className={`flex items-center gap-1 text-sm ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
            {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            %{Math.abs(change)}
          </div>
        )}
      </div>
      <h3 className="text-gray-400 text-sm mb-1">{title}</h3>
      <p className="text-2xl font-bold text-white mb-1">{value}</p>
      {subtitle && <p className="text-xs" style={{ color }}>{subtitle}</p>}
    </div>
  )
}

export default AdminAnalytics
