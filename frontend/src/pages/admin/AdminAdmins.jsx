import { useEffect, useState } from 'react'
import { useAdminStore } from '../../stores/adminStore'
import { 
  Shield, 
  Plus, 
  Edit2, 
  Trash2, 
  User,
  Mail,
  CheckCircle,
  X,
  Save,
  Loader2,
  AlertTriangle
} from 'lucide-react'

const PRIMARY = '#E50914'
const BG_SURFACE = '#141414'
const BORDER = '#2a2a2a'

function AdminAdmins() {
  const { fetchAdmins, createAdmin, deleteAdmin, adminUser } = useAdminStore()
  
  const [admins, setAdmins] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'admin'
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadAdmins()
  }, [])

  const loadAdmins = async () => {
    try {
      const data = await fetchAdmins()
      setAdmins(data.admins || [])
    } catch (error) {
      console.error('Admins load error:', error)
      // Mock data
      setAdmins([
        { id: 1, name: 'Super Admin', email: 'super@flixify.com', role: 'super', createdAt: '2024-01-01', lastLogin: '2024-03-15 10:30' },
        { id: 2, name: 'Ahmet Yılmaz', email: 'ahmet@flixify.com', role: 'admin', createdAt: '2024-02-01', lastLogin: '2024-03-14 15:45' },
        { id: 3, name: 'Mehmet Demir', email: 'mehmet@flixify.com', role: 'admin', createdAt: '2024-02-15', lastLogin: '2024-03-13 09:20' },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = () => {
    setFormData({
      name: '',
      email: '',
      password: '',
      role: 'admin'
    })
    setShowModal(true)
  }

  const handleDelete = async (adminId) => {
    if (!confirm('Bu admini silmek istediğinize emin misiniz?')) return
    try {
      await deleteAdmin(adminId)
      await loadAdmins()
    } catch (error) {
      console.error('Delete error:', error)
      alert('Admin silinemedi')
    }
  }

  const handleSave = async () => {
    if (!formData.name || !formData.email || !formData.password) {
      alert('Lütfen tüm alanları doldurun')
      return
    }
    
    setSaving(true)
    try {
      await createAdmin(formData)
      await loadAdmins()
      setShowModal(false)
    } catch (error) {
      console.error('Save error:', error)
      alert('Admin oluşturulamadı')
    } finally {
      setSaving(false)
    }
  }

  const getRoleBadge = (role) => {
    const styles = {
      super: { bg: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', text: 'Super Admin' },
      admin: { bg: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6', text: 'Admin' },
      editor: { bg: 'rgba(16, 185, 129, 0.2)', color: '#10b981', text: 'Editör' },
    }
    const style = styles[role] || styles.admin
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Shield className="w-6 h-6" style={{ color: PRIMARY }} />
            Admin Yönetimi
          </h1>
          <p className="text-gray-400">Sistem yöneticilerini yönetin</p>
        </div>
        <button 
          onClick={handleAdd}
          className="px-4 py-2 rounded-xl font-medium text-white flex items-center gap-2"
          style={{ backgroundColor: PRIMARY }}
        >
          <Plus className="w-5 h-5" />
          Yeni Admin
        </button>
      </div>

      {/* Info Card */}
      <div 
        className="p-4 rounded-2xl flex items-start gap-3"
        style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)' }}
      >
        <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#f59e0b' }} />
        <div>
          <p className="text-white text-sm font-medium">Roller ve Yetkiler</p>
          <ul className="text-gray-400 text-sm mt-1 space-y-1">
            <li><strong>Super Admin:</strong> Tüm yetkiler</li>
            <li><strong>Admin:</strong> Kullanıcı ve ödeme yönetimi</li>
          </ul>
        </div>
      </div>

      {/* Admins Table */}
      <div 
        className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: BG_SURFACE, border: `1px solid ${BORDER}` }}
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-gray-400 text-sm border-b" style={{ borderColor: BORDER }}>
                <th className="p-4 font-medium">Admin</th>
                <th className="p-4 font-medium">Rol</th>
                <th className="p-4 font-medium">Kayıt Tarihi</th>
                <th className="p-4 font-medium">Son Giriş</th>
                <th className="p-4 font-medium text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((admin) => (
                <tr key={admin.id} className="border-b hover:bg-white/5 transition-colors" style={{ borderColor: BORDER }}>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-10 h-10 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: PRIMARY }}
                      >
                        <span className="text-white font-bold">
                          {admin.name[0].toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="text-white font-medium">{admin.name}</p>
                        <p className="text-gray-500 text-sm">{admin.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">{getRoleBadge(admin.role)}</td>
                  <td className="p-4 text-gray-400 text-sm">{admin.createdAt}</td>
                  <td className="p-4 text-gray-400 text-sm">{admin.lastLogin || '-'}</td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-2">
                      {admin.id !== adminUser?.id && admin.role !== 'super' && (
                        <button 
                          onClick={() => handleDelete(admin.id)}
                          className="p-2 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-500 transition-colors"
                          title="Sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Admin Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div 
            className="w-full max-w-md rounded-2xl p-6"
            style={{ backgroundColor: BG_SURFACE, border: `1px solid ${BORDER}` }}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Yeni Admin Ekle</h2>
              <button 
                onClick={() => setShowModal(false)}
                className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Ad Soyad</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ahmet Yılmaz"
                  className="w-full p-3 rounded-xl text-white focus:outline-none"
                  style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">E-posta</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="admin@flixify.com"
                  className="w-full p-3 rounded-xl text-white focus:outline-none"
                  style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">Şifre</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full p-3 rounded-xl text-white focus:outline-none"
                  style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">Rol</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full p-3 rounded-xl text-white focus:outline-none"
                  style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
                >
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
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
                Oluştur
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminAdmins
