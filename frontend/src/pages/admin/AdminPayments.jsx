import { useEffect, useState } from 'react'
import { useAdminStore } from '../../stores/adminStore'
import { 
  CreditCard, 
  Search, 
  CheckCircle, 
  XCircle, 
  Clock,
  Filter,
  User,
  Calendar,
  TurkishLira,
  AlertCircle
} from 'lucide-react'

const PRIMARY = '#E50914'
const BG_SURFACE = '#141414'
const BORDER = '#2a2a2a'

function AdminPayments() {
  const { fetchPayments, approvePayment, rejectPayment } = useAdminStore()
  
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filter, setFilter] = useState('all') // all, pending, approved, rejected
  const [selectedPayment, setSelectedPayment] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    loadPayments()
  }, [])

  const loadPayments = async () => {
    try {
      const data = await fetchPayments()
      // API returns { status: 'success', data: { payments: [...] } }
      setPayments(data.data?.payments || data.payments || [])
    } catch (error) {
      console.error('Payments load error:', error)
      setPayments([])
    } finally {
      setLoading(false)
    }
  }

  const filteredPayments = payments.filter(payment => {
    const matchesSearch = 
      payment.userCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (payment.userEmail && payment.userEmail.toLowerCase().includes(searchQuery.toLowerCase()))
    const matchesFilter = filter === 'all' || payment.status === filter
    return matchesSearch && matchesFilter
  })

  const handleApprove = async (paymentId) => {
    if (!confirm('Bu ödemeyi onaylamak istediğinize emin misiniz?')) return
    setProcessing(true)
    try {
      await approvePayment(paymentId)
      await loadPayments()
      setShowModal(false)
    } catch (error) {
      console.error('Approve error:', error)
      alert('Onaylama başarısız')
    } finally {
      setProcessing(false)
    }
  }

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      alert('Reddetme sebebi giriniz')
      return
    }
    setProcessing(true)
    try {
      await rejectPayment(selectedPayment.id, rejectReason)
      await loadPayments()
      setShowModal(false)
      setRejectReason('')
    } catch (error) {
      console.error('Reject error:', error)
      alert('Reddetme başarısız')
    } finally {
      setProcessing(false)
    }
  }

  const getStatusBadge = (status) => {
    const styles = {
      pending: { bg: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b', text: 'Bekliyor', icon: Clock },
      approved: { bg: 'rgba(16, 185, 129, 0.2)', color: '#10b981', text: 'Onaylandı', icon: CheckCircle },
      rejected: { bg: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', text: 'Reddedildi', icon: XCircle },
    }
    const style = styles[status] || styles.pending
    const Icon = style.icon
    return (
      <span 
        className="px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1"
        style={{ backgroundColor: style.bg, color: style.color }}
      >
        <Icon className="w-3 h-3" />
        {style.text}
      </span>
    )
  }

  const getMethodLabel = (method) => {
    const labels = {
      'Havale': 'Havale/EFT',
      'Kredi Kartı': 'Kredi Kartı',
      'Kripto': 'Kripto Para'
    }
    return labels[method] || method
  }

  const stats = {
    total: payments.length,
    pending: payments.filter(p => p.status === 'pending').length,
    approved: payments.filter(p => p.status === 'approved').length,
    rejected: payments.filter(p => p.status === 'rejected').length,
    totalAmount: payments.filter(p => p.status === 'approved').reduce((sum, p) => sum + p.amount, 0)
  }

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
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <CreditCard className="w-6 h-6" style={{ color: PRIMARY }} />
          Ödeme Bildirimleri
        </h1>
        <p className="text-gray-400">Kullanıcı ödemelerini yönetin</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Toplam" value={stats.total} color="#6b7280" />
        <StatCard title="Bekleyen" value={stats.pending} color="#f59e0b" />
        <StatCard title="Onaylanan" value={stats.approved} color="#10b981" />
        <StatCard title="Toplam Gelir" value={`₺${(stats.totalAmount || 0).toLocaleString()}`} color={PRIMARY} />
      </div>

      {/* Filters */}
      <div 
        className="p-4 rounded-2xl space-y-4"
        style={{ backgroundColor: BG_SURFACE, border: `1px solid ${BORDER}` }}
      >
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="text"
              placeholder="Kullanıcı kodu veya e-posta ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-xl text-white placeholder-gray-500 focus:outline-none"
              style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
            />
          </div>
          <div className="flex gap-2">
            {[
              { value: 'all', label: 'Tümü' },
              { value: 'pending', label: 'Bekleyen' },
              { value: 'approved', label: 'Onaylanan' },
              { value: 'rejected', label: 'Reddedilen' }
            ].map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  filter === f.value ? 'text-white' : 'text-gray-400 hover:text-white'
                }`}
                style={{ backgroundColor: filter === f.value ? PRIMARY : '#1a1a1a' }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Payments Table */}
      <div 
        className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: BG_SURFACE, border: `1px solid ${BORDER}` }}
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-gray-400 text-sm border-b" style={{ borderColor: BORDER }}>
                <th className="p-4 font-medium">Kullanıcı</th>
                <th className="p-4 font-medium">Tutar</th>
                <th className="p-4 font-medium">Yöntem</th>
                <th className="p-4 font-medium">Tarih</th>
                <th className="p-4 font-medium">Durum</th>
                <th className="p-4 font-medium text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayments.map((payment) => (
                <tr key={payment.id} className="border-b hover:bg-white/5 transition-colors" style={{ borderColor: BORDER }}>
                  <td className="p-4">
                    <div>
                      <code className="text-white font-mono text-sm">{payment.userCode}</code>
                      {payment.userEmail && (
                        <p className="text-gray-500 text-xs">{payment.userEmail}</p>
                      )}
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="text-white font-bold">₺{payment.amount}</span>
                  </td>
                  <td className="p-4">
                    <div>
                      <span className="text-gray-300">{getMethodLabel(payment.method)}</span>
                      {payment.bank && (
                        <p className="text-gray-500 text-xs">{payment.bank}</p>
                      )}
                    </div>
                  </td>
                  <td className="p-4 text-gray-400 text-sm">
                    {new Date(payment.date).toLocaleDateString('tr-TR')}
                  </td>
                  <td className="p-4">
                    {getStatusBadge(payment.status)}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-2">
                      {payment.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleApprove(payment.id)}
                            disabled={processing}
                            className="px-3 py-2 rounded-lg bg-green-500/20 text-green-500 hover:bg-green-500/30 text-sm font-medium transition-colors"
                          >
                            Onayla
                          </button>
                          <button
                            onClick={() => { setSelectedPayment(payment); setShowModal(true) }}
                            className="px-3 py-2 rounded-lg bg-red-500/20 text-red-500 hover:bg-red-500/30 text-sm font-medium transition-colors"
                          >
                            Reddet
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => { setSelectedPayment(payment); setShowModal(true) }}
                        className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                      >
                        Detay
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredPayments.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            Ödeme bulunamadı
          </div>
        )}
      </div>

      {/* Detail/Reject Modal */}
      {showModal && selectedPayment && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div 
            className="w-full max-w-md rounded-2xl p-6"
            style={{ backgroundColor: BG_SURFACE, border: `1px solid ${BORDER}` }}
          >
            <h2 className="text-xl font-bold text-white mb-6">Ödeme Detayı</h2>
            
            <div className="space-y-4 mb-6">
              <div className="flex justify-between">
                <span className="text-gray-400">Kullanıcı</span>
                <code className="text-white font-mono">{selectedPayment.userCode}</code>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Tutar</span>
                <span className="text-white font-bold">₺{selectedPayment.amount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Yöntem</span>
                <span className="text-gray-300">{getMethodLabel(selectedPayment.method)}</span>
              </div>
              {selectedPayment.bank && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Banka</span>
                  <span className="text-gray-300">{selectedPayment.bank}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-400">Tarih</span>
                <span className="text-gray-300">
                  {new Date(selectedPayment.date).toLocaleString('tr-TR')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Durum</span>
                {getStatusBadge(selectedPayment.status)}
              </div>
              {selectedPayment.note && (
                <div className="p-3 rounded-lg" style={{ backgroundColor: '#1a1a1a' }}>
                  <span className="text-gray-400 text-sm">Not:</span>
                  <p className="text-gray-300 mt-1">{selectedPayment.note}</p>
                </div>
              )}
            </div>

            {selectedPayment.status === 'pending' && (
              <div className="border-t pt-4" style={{ borderColor: BORDER }}>
                <label className="block text-sm text-gray-400 mb-2">Reddetme Sebebi (Opsiyonel)</label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Reddetme sebebini girin..."
                  rows="3"
                  className="w-full p-3 rounded-xl text-white focus:outline-none resize-none"
                  style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
                />
                
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => setShowModal(false)}
                    className="flex-1 py-3 rounded-xl font-medium text-white hover:bg-white/5 transition-colors"
                    style={{ backgroundColor: '#2a2a2a' }}
                  >
                    Kapat
                  </button>
                  {rejectReason.trim() && (
                    <button
                      onClick={handleReject}
                      disabled={processing}
                      className="flex-1 py-3 rounded-xl font-medium text-white bg-red-600 hover:bg-red-700 transition-colors"
                    >
                      {processing ? 'İşleniyor...' : 'Reddet'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {selectedPayment.status !== 'pending' && (
              <button
                onClick={() => setShowModal(false)}
                className="w-full py-3 rounded-xl font-medium text-white hover:bg-white/5 transition-colors"
                style={{ backgroundColor: '#2a2a2a' }}
              >
                Kapat
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ title, value, color }) {
  return (
    <div 
      className="p-4 rounded-2xl"
      style={{ backgroundColor: BG_SURFACE, border: `1px solid ${BORDER}` }}
    >
      <p className="text-gray-400 text-sm mb-1">{title}</p>
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
    </div>
  )
}

export default AdminPayments
