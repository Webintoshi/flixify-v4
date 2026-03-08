import { useEffect, useState } from 'react'
import api from '../services/api'
import { 
  Users, 
  Loader2, 
  Plus, 
  Search, 
  Settings,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Calendar
} from 'lucide-react'

function AdminPage() {
  const [users, setUsers] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedUser, setSelectedUser] = useState(null)
  const [showActivateModal, setShowActivateModal] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  
  // Form states
  const [m3uUrl, setM3uUrl] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [adminNotes, setAdminNotes] = useState('')
  const [filter, setFilter] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [usersRes, statsRes] = await Promise.all([
        api.get('/api/v1/admin/users?limit=100'),
        api.get('/api/v1/admin/stats')
      ])
      setUsers(usersRes.data.data.users)
      setStats(statsRes.data.data)
    } catch (err) {
      setError('Veriler yüklenirken hata oluştu')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateUser = async () => {
    try {
      await api.post('/api/v1/auth/register', { adminNotes })
      setShowCreateModal(false)
      setAdminNotes('')
      loadData()
    } catch (err) {
      alert('Kullanıcı oluşturulurken hata: ' + err.response?.data?.message)
    }
  }

  const handleActivate = async () => {
    if (!selectedUser || !m3uUrl) return

    try {
      await api.put(`/api/v1/admin/users/${selectedUser.code}/activate`, {
        m3uUrl,
        expiresAt: expiresAt || null,
        adminNotes
      })
      setShowActivateModal(false)
      setM3uUrl('')
      setExpiresAt('')
      setAdminNotes('')
      setSelectedUser(null)
      loadData()
    } catch (err) {
      alert('Aktivasyon hatası: ' + err.response?.data?.message)
    }
  }

  const handleSuspend = async (code) => {
    if (!confirm('Kullanıcıyı askıya almak istediğinize emin misiniz?')) return

    try {
      await api.put(`/api/v1/admin/users/${code}/suspend`, {
        reason: 'Admin tarafından askıya alındı'
      })
      loadData()
    } catch (err) {
      alert('Hata: ' + err.response?.data?.message)
    }
  }

  const handleDelete = async (code) => {
    if (!confirm('Kullanıcıyı silmek istediğinize emin misiniz? Bu işlem geri alınamaz!')) return

    try {
      await api.delete(`/api/v1/admin/users/${code}`)
      loadData()
    } catch (err) {
      alert('Hata: ' + err.response?.data?.message)
    }
  }

  const getStatusBadge = (status) => {
    const config = {
      pending: { 
        class: 'bg-warning/10 text-warning border border-warning/20', 
        icon: Clock,
        label: 'Beklemede'
      },
      active: { 
        class: 'bg-accent/10 text-accent border border-accent/20', 
        icon: CheckCircle2,
        label: 'Aktif'
      },
      suspended: { 
        class: 'bg-danger/10 text-danger border border-danger/20', 
        icon: XCircle,
        label: 'Askıda'
      },
      expired: { 
        class: 'bg-foreground-muted/10 text-foreground-muted border border-foreground-muted/20', 
        icon: Calendar,
        label: 'Süresi Doldu'
      }
    }
    const { class: className, icon: Icon, label } = config[status]
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${className}`}>
        <Icon className="w-3.5 h-3.5" />
        {label}
      </span>
    )
  }

  const filteredUsers = users.filter(u => 
    u.code.toLowerCase().includes(filter.toLowerCase()) ||
    (u.adminNotes && u.adminNotes.toLowerCase().includes(filter.toLowerCase()))
  )

  if (loading) {
    return (
      <div className="flix-container flex items-center justify-center h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-[#E50914] animate-spin" />
          <span className="text-foreground-muted">Yükleniyor...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flix-container py-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#E50914]/10 flex items-center justify-center">
            <Settings className="w-5 h-5 text-[#E50914]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Admin Panel</h1>
            <p className="text-sm text-foreground-muted">Kullanıcı yönetimi ve istatistikler</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flix-btn flix-btn-primary gap-2"
        >
          <Plus className="w-4 h-4" />
          Yeni Kullanıcı
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {Object.entries(stats.counts).filter(([key]) => key !== 'total').map(([key, count]) => (
            <div key={key} className="bg-surface p-5 rounded-2xl border border-border">
              <p className="text-foreground-muted text-sm capitalize font-medium mb-1">{key}</p>
              <p className="text-3xl font-black text-foreground">{count}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filter */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
        <input
          type="text"
          placeholder="Kod veya not ara..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full md:w-96 bg-surface border border-border rounded-xl pl-11 pr-4 py-3 text-foreground placeholder:text-foreground-muted focus:outline-none focus:border-primary transition-colors"
        />
      </div>

      {/* Users Table */}
      <div className="bg-surface rounded-2xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-background/50">
              <tr>
                <th className="text-left p-4 text-foreground-muted font-semibold text-sm">Kod</th>
                <th className="text-left p-4 text-foreground-muted font-semibold text-sm">Durum</th>
                <th className="text-left p-4 text-foreground-muted font-semibold text-sm">Bitiş Tarihi</th>
                <th className="text-left p-4 text-foreground-muted font-semibold text-sm">Notlar</th>
                <th className="text-left p-4 text-foreground-muted font-semibold text-sm">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id} className="border-t border-border hover:bg-background/30 transition-colors">
                  <td className="p-4 font-mono text-sm text-foreground">{user.code}</td>
                  <td className="p-4">{getStatusBadge(user.status)}</td>
                  <td className="p-4 text-foreground-muted text-sm">
                    {user.expiresAt ? new Date(user.expiresAt).toLocaleDateString('tr-TR') : '-'}
                  </td>
                  <td className="p-4 text-foreground-muted text-sm max-w-xs truncate">
                    {user.adminNotes || '-'}
                  </td>
                  <td className="p-4">
                    <div className="flex gap-2">
                      {user.status === 'pending' && (
                        <button
                          onClick={() => {
                            setSelectedUser(user)
                            setShowActivateModal(true)
                          }}
                          className="px-3 py-1.5 rounded-lg bg-accent/10 text-accent text-xs font-semibold hover:bg-accent/20 transition-colors"
                        >
                          Aktifleştir
                        </button>
                      )}
                      {user.status === 'active' && (
                        <button
                          onClick={() => handleSuspend(user.code)}
                          className="px-3 py-1.5 rounded-lg bg-danger/10 text-danger text-xs font-semibold hover:bg-danger/20 transition-colors"
                        >
                          Askıya Al
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(user.code)}
                        className="px-3 py-1.5 rounded-lg bg-foreground-muted/10 text-foreground-muted text-xs font-semibold hover:bg-foreground-muted/20 transition-colors"
                      >
                        Sil
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-surface rounded-2xl p-6 w-full max-w-md border border-border">
            <h2 className="text-xl font-bold text-foreground mb-2">Yeni Kullanıcı Oluştur</h2>
            <p className="text-foreground-muted text-sm mb-6">
              Yeni bir kullanıcı oluşturulacak ve 16 haneli kodu gösterilecek.
            </p>
            <textarea
              placeholder="Admin notları (opsiyonel)"
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              className="w-full bg-background border border-border rounded-xl p-4 text-foreground placeholder:text-foreground-muted focus:outline-none focus:border-primary transition-colors mb-6"
              rows={3}
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 py-3 rounded-xl bg-surface-hover text-foreground font-semibold hover:bg-surface transition-colors"
              >
                İptal
              </button>
              <button
                onClick={handleCreateUser}
                className="flex-1 py-3 rounded-xl bg-[#E50914] text-white font-semibold hover:bg-[#E50914]-hover transition-colors"
              >
                Oluştur
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Activate Modal */}
      {showActivateModal && selectedUser && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-surface rounded-2xl p-6 w-full max-w-md border border-border">
            <h2 className="text-xl font-bold text-foreground mb-2">Kullanıcı Aktifleştir</h2>
            <p className="text-foreground-muted text-sm mb-6">
              Kod: <span className="font-mono text-foreground">{selectedUser.code}</span>
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">M3U URL *</label>
                <input
                  type="text"
                  placeholder="http://provider.com/playlist.m3u"
                  value={m3uUrl}
                  onChange={(e) => setM3uUrl(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl p-4 text-foreground placeholder:text-foreground-muted focus:outline-none focus:border-primary transition-colors"
                />
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Bitiş Tarihi (opsiyonel)</label>
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl p-4 text-foreground focus:outline-none focus:border-primary transition-colors"
                />
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Admin Notları</label>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl p-4 text-foreground placeholder:text-foreground-muted focus:outline-none focus:border-primary transition-colors"
                  rows={2}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowActivateModal(false)}
                className="flex-1 py-3 rounded-xl bg-surface-hover text-foreground font-semibold hover:bg-surface transition-colors"
              >
                İptal
              </button>
              <button
                onClick={handleActivate}
                disabled={!m3uUrl}
                className="flex-1 py-3 rounded-xl bg-accent text-white font-semibold hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Aktifleştir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminPage
