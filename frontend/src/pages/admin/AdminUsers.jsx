import { useEffect, useState } from 'react'
import { useAdminStore } from '../../stores/adminStore'
import { 
  Users, 
  Search, 
  Plus, 
  Edit2, 
  Trash2,
  Clock,
  CheckCircle,
  X,
  Save,
  Loader2,
  Link2,
  AlertTriangle,
  RefreshCw
} from 'lucide-react'

const PRIMARY = '#E50914'
const BG_SURFACE = '#141414'
const BORDER = '#2a2a2a'

// Kullanım süresi seçenekleri (gün bazlı)
const DURATION_OPTIONS = [
  { value: 30, label: '30 Gün', description: '1 Aylık kullanım', color: '#3b82f6' },
  { value: 90, label: '90 Gün', description: '3 Aylık kullanım', color: '#8b5cf6', popular: true },
  { value: 180, label: '180 Gün', description: '6 Aylık kullanım', color: '#f59e0b' },
  { value: 365, label: '365 Gün', description: '1 Yıllık kullanım', color: '#10b981', best: true }
]

function AdminUsers() {
  const { 
    fetchUsers, 
    extendUserExpiry, 
    updateUserM3U,
    deleteUser
  } = useAdminStore()

  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [userToDelete, setUserToDelete] = useState(null)
  const [userStats, setUserStats] = useState(null)
  const [loadingStats, setLoadingStats] = useState(false)
  const [formData, setFormData] = useState({
    durationDays: 30,
    m3uUrl: ''
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Track previous user count for detecting new registrations
  const [previousUserCount, setPreviousUserCount] = useState(0)
  const [lastUpdated, setLastUpdated] = useState(null)

  useEffect(() => {
    loadData()
    
    // Auto-refresh every 60 seconds (slower to avoid rate limit)
    const interval = setInterval(() => {
      // Only refresh if page is visible
      if (!document.hidden) {
        loadData(true) // silent refresh (no loading spinner)
      }
    }, 60000)
    
    return () => clearInterval(interval)
  }, [])

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const usersData = await fetchUsers()
      const newUsers = usersData.data?.users || usersData.users || []
      
      // Check for new users
      if (silent && newUsers.length > previousUserCount && previousUserCount > 0) {
        const newUserCount = newUsers.length - previousUserCount
        // Show browser notification for new users
        if (Notification.permission === 'granted') {
          new Notification('Flixify Pro', {
            body: `${newUserCount} yeni kullanıcı kaydoldu!`,
            icon: '/favicon.ico'
          })
        }
      }
      
      setPreviousUserCount(newUsers.length)
      setUsers(newUsers)
      setLastUpdated(new Date())
    } catch (err) {
      console.error('Data load error:', err)
      if (!silent) {
        setError(err.message || 'Kullanıcılar yüklenirken bir hata oluştu')
      }
      setUsers([])
    } finally {
      if (!silent) setLoading(false)
    }
  }

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  const filteredUsers = users.filter(user => 
    user.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (user.email && user.email.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  // Yeni bitiş tarihini hesapla
  const calculateNewExpiry = (days) => {
    const today = new Date()
    const expiryDate = new Date(today)
    expiryDate.setDate(today.getDate() + parseInt(days))
    return expiryDate.toLocaleDateString('tr-TR')
  }

  // Kalan gün sayısını hesapla
  const getRemainingDays = (expiresAt) => {
    if (!expiresAt) return { days: 0, status: 'expired', color: '#ef4444' }
    
    const expiry = new Date(expiresAt)
    const today = new Date()
    const diffTime = expiry - today
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    if (diffDays < 0) {
      return { days: 0, status: 'expired', color: '#ef4444', text: 'Süresi Doldu' }
    } else if (diffDays <= 7) {
      return { days: diffDays, status: 'critical', color: '#ef4444', text: `${diffDays} gün` }
    } else if (diffDays <= 30) {
      return { days: diffDays, status: 'warning', color: '#f59e0b', text: `${diffDays} gün` }
    } else {
      return { days: diffDays, status: 'active', color: '#10b981', text: `${diffDays} gün` }
    }
  }

  const handleConfigureUser = (user) => {
    setSelectedUser(user)
    setFormData({ 
      durationDays: 30, 
      m3uUrl: user.m3uUrl || '' 
    })
    setShowModal(true)
  }

  const handleDeleteClick = async (user) => {
    setUserToDelete(user)
    setUserStats(null)
    setLoadingStats(true)
    setShowDeleteModal(true)
    
    // Fetch user details with stats
    try {
      const response = await fetch(`${API_URL}/admin/users/${user.code}`, {
        headers: { 'Authorization': `Bearer ${useAdminStore.getState().adminToken}` }
      })
      if (response.ok) {
        const data = await response.json()
        setUserStats(data.data?.stats || null)
      }
    } catch (error) {
      console.error('Failed to load user stats:', error)
    } finally {
      setLoadingStats(false)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!userToDelete) return
    
    setDeleting(true)
    try {
      await deleteUser(userToDelete.code)
      setShowDeleteModal(false)
      setUserToDelete(null)
      await loadData()
    } catch (error) {
      console.error('Delete error:', error)
      alert('Kullanıcı silinirken hata oluştu: ' + error.message)
    } finally {
      setDeleting(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Her iki işlemi de yap
      await extendUserExpiry(selectedUser.code, formData.durationDays)
      if (formData.m3uUrl) {
        await updateUserM3U(selectedUser.code, formData.m3uUrl)
      }
      await loadData()
      setShowModal(false)
    } catch (error) {
      console.error('Save error:', error)
      alert('İşlem başarısız: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const getStatusBadge = (status) => {
    const styles = {
      active: { bg: 'rgba(16, 185, 129, 0.2)', color: '#10b981', text: 'Aktif' },
      expired: { bg: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', text: 'Süresi Dolmuş' },
      suspended: { bg: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b', text: 'Askıya Alındı' },
    }
    const style = styles[status] || styles.expired
    return (
      <span 
        className="px-2 py-1 rounded-full text-xs font-medium"
        style={{ backgroundColor: style.bg, color: style.color }}
      >
        {style.text}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="text-red-500 text-center">
          <p className="text-lg font-medium mb-2">Hata Oluştu</p>
          <p className="text-gray-400">{error}</p>
        </div>
        <button 
          onClick={loadData}
          className="px-4 py-2 rounded-xl font-medium text-white flex items-center gap-2"
          style={{ backgroundColor: PRIMARY }}
        >
          Tekrar Dene
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users className="w-6 h-6" style={{ color: PRIMARY }} />
            Kullanıcı Yönetimi
            <span className="text-sm font-normal text-gray-500 ml-2">
              ({filteredUsers.length} kullanıcı)
            </span>
          </h1>
          <p className="text-gray-400">
            Kullanıcıları yönetin ve erişim sürelerini tanımlayın
            {lastUpdated && (
              <span className="ml-2 text-xs text-gray-500">
                • Son güncelleme: {lastUpdated.toLocaleTimeString('tr-TR')}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => loadData()}
            disabled={loading}
            className="px-3 py-2 rounded-xl font-medium text-white flex items-center gap-2 hover:bg-white/10 transition-colors disabled:opacity-50"
            style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
            title="Listeyi Yenile"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button 
            className="px-4 py-2 rounded-xl font-medium text-white flex items-center gap-2"
            style={{ backgroundColor: PRIMARY }}
          >
            <Plus className="w-5 h-5" />
            Yeni Kullanıcı
          </button>
        </div>
      </div>

      {/* Search */}
      <div 
        className="p-4 rounded-2xl"
        style={{ backgroundColor: BG_SURFACE, border: `1px solid ${BORDER}` }}
      >
        <div className="relative">
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
      </div>

      {/* Users Table */}
      <div 
        className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: BG_SURFACE, border: `1px solid ${BORDER}` }}
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-gray-400 text-sm border-b" style={{ borderColor: BORDER }}>
                <th className="p-4 font-medium">Kullanıcı Kodu</th>
                <th className="p-4 font-medium">Notlar</th>
                <th className="p-4 font-medium">Bitiş Tarihi</th>
                <th className="p-4 font-medium">Kalan Süre</th>
                <th className="p-4 font-medium">Durum</th>
                <th className="p-4 font-medium">M3U</th>
                <th className="p-4 font-medium text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id} className="border-b hover:bg-white/5 transition-colors" style={{ borderColor: BORDER }}>
                  <td className="p-4">
                    <code className="text-white font-mono text-sm">{user.code}</code>
                  </td>
                  <td className="p-4 text-gray-300">{user.adminNotes || '-'}</td>
                  <td className="p-4 text-gray-300">
                    {user.expiresAt ? new Date(user.expiresAt).toLocaleDateString('tr-TR') : '-'}
                  </td>
                  <td className="p-4">
                    {user.expiresAt ? (
                      (() => {
                        const remaining = getRemainingDays(user.expiresAt)
                        return (
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: remaining.color }}
                            />
                            <span className="text-sm font-medium" style={{ color: remaining.color }}>
                              {remaining.text}
                            </span>
                          </div>
                        )
                      })()
                    ) : (
                      <span className="text-gray-500">-</span>
                    )}
                  </td>
                  <td className="p-4">{getStatusBadge(user.status)}</td>
                  <td className="p-4">
                    {user.m3uUrl ? (
                      <span className="text-green-500 flex items-center gap-1 text-sm">
                        <CheckCircle className="w-4 h-4" />
                        Tanımlı
                      </span>
                    ) : (
                      <span className="text-gray-500 text-sm">-</span>
                    )}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={() => handleConfigureUser(user)}
                        className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors"
                        style={{ 
                          backgroundColor: user.status === 'active' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(229,9,20,0.2)',
                          color: user.status === 'active' ? '#10b981' : PRIMARY
                        }}
                      >
                        <Clock className="w-4 h-4" />
                        {user.status === 'active' ? 'Yenile' : 'Tanımla'}
                      </button>
                      <button 
                        onClick={() => handleConfigureUser(user)}
                        className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                        title="Düzenle"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDeleteClick(user)}
                        className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-red-500 transition-colors"
                        title="Sil"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredUsers.length === 0 && (
          <div className="p-8 text-center">
            <p className="text-gray-500 mb-4">Kullanıcı bulunamadı</p>
            <button 
              onClick={loadData}
              className="px-4 py-2 rounded-xl font-medium text-white text-sm"
              style={{ backgroundColor: '#2a2a2a' }}
            >
              Yenile
            </button>
          </div>
        )}
      </div>

      {/* Modal - Birleşik Kullanıcı Tanımla */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div 
            className="w-full max-w-lg rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
            style={{ backgroundColor: BG_SURFACE, border: `1px solid ${BORDER}` }}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">
                Kullanıcı Tanımla
              </h2>
              <button 
                onClick={() => setShowModal(false)}
                className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Kullanıcı Bilgisi */}
            <div className="mb-6 p-4 rounded-xl" style={{ backgroundColor: '#1a1a1a' }}>
              <p className="text-gray-400 text-sm mb-1">Kullanıcı</p>
              <code className="text-white font-mono text-lg">{selectedUser?.code}</code>
              {selectedUser?.expiresAt && (
                <p className="text-sm mt-2" style={{ color: '#f59e0b' }}>
                  Mevcut bitiş: {new Date(selectedUser.expiresAt).toLocaleDateString('tr-TR')}
                </p>
              )}
            </div>

            <div className="space-y-6">
              {/* Erişim Süresi Seçimi */}
              <div>
                <label className="block text-sm text-gray-400 mb-3">Kullanım Süresi Seçin</label>
                <div className="grid grid-cols-2 gap-3">
                  {DURATION_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setFormData({ ...formData, durationDays: option.value })}
                      className="relative p-4 rounded-xl text-left transition-all"
                      style={{
                        backgroundColor: formData.durationDays === option.value ? `${option.color}20` : '#1a1a1a',
                        border: `2px solid ${formData.durationDays === option.value ? option.color : '#2a2a2a'}`,
                      }}
                    >
                      {/* Badge */}
                      {(option.popular || option.best) && (
                        <span 
                          className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full text-[10px] font-bold"
                          style={{ 
                            backgroundColor: option.best ? PRIMARY : option.color,
                            color: '#fff'
                          }}
                        >
                          {option.best ? '🔥 En İyi' : '⭐ Popüler'}
                        </span>
                      )}
                      
                      <div className="flex items-center gap-2 mb-1">
                        <Clock className="w-4 h-4" style={{ color: option.color }} />
                        <span className="text-white font-bold">{option.label}</span>
                      </div>
                      <p className="text-xs" style={{ color: '#6b7280' }}>{option.description}</p>
                    </button>
                  ))}
                </div>

                {/* Yeni Bitiş Tarihi Özeti */}
                <div 
                  className="mt-4 p-4 rounded-xl"
                  style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)' }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Yeni Bitiş Tarihi:</span>
                    <span className="text-white font-bold">
                      {calculateNewExpiry(formData.durationDays)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Bugünden itibaren {formData.durationDays} gün eklenecek
                  </p>
                </div>
              </div>

              {/* Divider */}
              <div style={{ borderTop: `1px solid ${BORDER}` }} />

              {/* M3U Link Tanımla */}
              <div>
                <label className="block text-sm text-gray-400 mb-3 flex items-center gap-2">
                  <Link2 className="w-4 h-4" />
                  M3U Playlist URL
                </label>
                <input
                  type="url"
                  value={formData.m3uUrl}
                  onChange={(e) => setFormData({ ...formData, m3uUrl: e.target.value })}
                  placeholder="http://example.com/playlist.m3u"
                  className="w-full p-4 rounded-xl text-white focus:outline-none"
                  style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
                />
                {selectedUser?.m3uUrl && (
                  <p className="text-xs mt-2" style={{ color: '#6b7280' }}>
                    Mevcut URL: {selectedUser.m3uUrl.substring(0, 40)}...
                  </p>
                )}
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 mt-8">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-3 rounded-xl font-medium text-white hover:bg-white/5 transition-colors"
                style={{ backgroundColor: '#2a2a2a' }}
              >
                İptal
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-3 rounded-xl font-medium text-white flex items-center justify-center gap-2"
                style={{ backgroundColor: PRIMARY }}
              >
                {saving ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Save className="w-5 h-5" />
                )}
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && userToDelete && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div 
            className="w-full max-w-md rounded-2xl p-6"
            style={{ backgroundColor: BG_SURFACE, border: `1px solid ${BORDER}` }}
          >
            <div className="flex items-center gap-4 mb-6">
              <div 
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)' }}
              >
                <AlertTriangle className="w-6 h-6" style={{ color: '#ef4444' }} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Kullanıcıyı Sil</h2>
                <p className="text-gray-400 text-sm">Bu işlem geri alınamaz</p>
              </div>
            </div>

            <div 
              className="p-4 rounded-xl mb-6"
              style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
            >
              <p className="text-gray-400 text-sm mb-1">Silinecek Kullanıcı</p>
              <code className="text-white font-mono text-lg">{userToDelete.code}</code>
              <p className="text-sm text-gray-500 mt-2">
                Durum: <span className="capitalize">{userToDelete.status}</span>
                {userToDelete.expiresAt && (
                  <span> • Bitiş: {new Date(userToDelete.expiresAt).toLocaleDateString('tr-TR')}</span>
                )}
              </p>
            </div>

            {/* User Stats Warning */}
            {loadingStats ? (
              <div className="flex items-center justify-center py-4 mb-4">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                <span className="text-gray-400 ml-2">Kullanıcı verileri yükleniyor...</span>
              </div>
            ) : userStats ? (
              <div 
                className="p-4 rounded-xl mb-4"
                style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)' }}
              >
                <p className="text-amber-400 font-medium mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Bu kullanıcıya ait kayıtlı veriler:
                </p>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-white">{userStats.payments || 0}</p>
                    <p className="text-xs text-gray-400">Ödeme</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-white">{userStats.devices || 0}</p>
                    <p className="text-xs text-gray-400">Cihaz</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-400">₺{userStats.totalAmount?.toFixed(2) || '0.00'}</p>
                    <p className="text-xs text-gray-400">Toplam Ödeme</p>
                  </div>
                </div>
              </div>
            ) : null}

            <div 
              className="p-4 rounded-xl mb-6"
              style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)' }}
            >
              <p className="text-blue-400 text-sm flex items-start gap-2">
                <span className="text-lg">ℹ️</span>
                <span>
                  Kullanıcı soft-delete olarak işaretlenecektir. Ödemeler ve analiz verileri korunacak, 
                  sadece kullanıcı listelerinde görünmeyecektir. Bu işlem 30 gün sonra kalıcı silinmek üzere işaretlenir.
                </span>
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false)
                  setUserToDelete(null)
                  setUserStats(null)
                }}
                disabled={deleting}
                className="flex-1 py-3 rounded-xl font-medium text-white hover:bg-white/5 transition-colors"
                style={{ backgroundColor: '#2a2a2a' }}
              >
                İptal
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleting}
                className="flex-1 py-3 rounded-xl font-medium text-white flex items-center justify-center gap-2"
                style={{ backgroundColor: '#ef4444' }}
              >
                {deleting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Trash2 className="w-5 h-5" />
                )}
                {deleting ? 'Siliniyor...' : 'Evet, Sil'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminUsers
