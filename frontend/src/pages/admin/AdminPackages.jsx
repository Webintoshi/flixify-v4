import { useEffect, useState } from 'react'
import { useAdminStore } from '../../stores/adminStore'
import { 
  Package, 
  Plus, 
  Edit2, 
  Trash2, 
  Clock,
  CheckCircle2,
  X,
  Save,
  Loader2,
  Sparkles,
  Zap,
  Crown,
  TrendingUp,
  RefreshCw,
  AlertCircle,
  Calendar,
  Tag
} from 'lucide-react'

const PRIMARY = '#E50914'
const BG_SURFACE = '#0f0f0f'
const BORDER = '#2a2a2a'

// Paket ikonları
const PACKAGE_ICONS = {
  1: Calendar,
  3: TrendingUp,
  6: Zap,
  12: Crown
}

// Premium paket renk temaları - daha sofistike
const PACKAGE_THEMES = {
  1: { 
    gradient: 'from-blue-600/30 via-blue-500/20 to-transparent',
    accent: '#3b82f6',
    glow: 'rgba(59, 130, 246, 0.3)',
    iconBg: 'bg-blue-500/15'
  },
  3: { 
    gradient: 'from-emerald-600/30 via-emerald-500/20 to-transparent',
    accent: '#10b981',
    glow: 'rgba(16, 185, 129, 0.3)',
    iconBg: 'bg-emerald-500/15'
  },
  6: { 
    gradient: 'from-red-600/30 via-rose-500/20 to-transparent',
    accent: '#f43f5e',
    glow: 'rgba(244, 63, 94, 0.3)',
    iconBg: 'bg-rose-500/15'
  },
  12: { 
    gradient: 'from-amber-600/30 via-yellow-500/20 to-transparent',
    accent: '#f59e0b',
    glow: 'rgba(245, 158, 11, 0.3)',
    iconBg: 'bg-amber-500/15'
  }
}

// Badge stilleri - modern & lüks
const BADGE_STYLES = {
  popular: {
    gradient: 'from-rose-500 to-pink-600',
    shadow: 'shadow-rose-500/25',
    icon: Sparkles
  },
  discount: {
    gradient: 'from-emerald-500 to-teal-600',
    shadow: 'shadow-emerald-500/25',
    icon: Tag
  },
  best: {
    gradient: 'from-amber-500 to-orange-600',
    shadow: 'shadow-amber-500/25',
    icon: Crown
  },
  default: {
    gradient: 'from-indigo-500 to-purple-600',
    shadow: 'shadow-indigo-500/25',
    icon: Package
  }
}

function AdminPackages() {
  const { 
    adminToken,
    fetchPackages,
    createPackage,
    updatePackage,
    deletePackage
  } = useAdminStore()
  
  const [packages, setPackages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [editingPackage, setEditingPackage] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: 100,
    duration: 1,
    features: [],
    badge: '',
    isPopular: false,
    isActive: true
  })
  const [saving, setSaving] = useState(false)
  const [featureInput, setFeatureInput] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)

  useEffect(() => {
    loadPackages()
  }, [])

  const normalizePackage = (pkg) => {
    const durationDays = pkg.duration_days || pkg.duration || 30
    const duration = Math.ceil(durationDays / 30)
    const description = pkg.description || ''
    const isPopular = description.toLowerCase().includes('popüler') || 
                      description.toLowerCase().includes('en iyi') ||
                      pkg.isPopular === true
    
    let features = pkg.features || []
    if (!features.length && description) {
      const lines = description.split(/[-,]/).map(s => s.trim()).filter(s => s)
      if (lines.length > 1) {
        features = lines.slice(0, 4)
      } else {
        features = [`${durationDays} gün erişim`, 'HD Kalite', '7/24 Destek', 'Tek Cihaz']
      }
    }
    
    let badge = pkg.badge || ''
    let badgeType = 'default'
    
    if (!badge) {
      if (description.includes('%')) {
        const match = description.match(/%\d+/)
        if (match) {
          badge = match[0] + ' İndirim'
          badgeType = 'discount'
        }
      } else if (isPopular) {
        badge = 'Popüler'
        badgeType = 'popular'
      }
    } else {
      if (badge.includes('Popüler')) badgeType = 'popular'
      else if (badge.includes('%')) badgeType = 'discount'
      else if (badge.includes('En İyi')) badgeType = 'best'
    }
    
    return {
      id: pkg.id,
      name: pkg.name,
      description: description,
      price: parseFloat(pkg.price) || 0,
      duration: duration,
      duration_days: durationDays,
      features: features,
      badge: badge,
      badgeType: badgeType,
      isPopular: isPopular,
      isActive: pkg.isActive !== false,
      created_at: pkg.created_at,
      updated_at: pkg.updated_at
    }
  }

  const loadPackages = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const result = await fetchPackages()
      const rawPackages = result.data?.packages || result.packages || result.data || []
      const normalizedPackages = rawPackages.map(normalizePackage)
      
      setPackages(normalizedPackages)
      setLastUpdated(new Date())
    } catch (err) {
      console.error('Load packages error:', err)
      setError(err.message || 'Paketler yüklenemedi')
      setPackages([])
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (pkg) => {
    setEditingPackage(pkg)
    setFormData({
      name: pkg.name,
      description: pkg.description,
      price: pkg.price,
      duration: pkg.duration || Math.ceil((pkg.duration_days || 30) / 30),
      features: [...(pkg.features || [])],
      badge: pkg.badge || '',
      isPopular: pkg.isPopular || false,
      isActive: pkg.isActive !== false
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (editingPackage) {
        await updatePackage(editingPackage.id, formData)
      } else {
        await createPackage(formData)
      }
      
      await loadPackages()
      setShowModal(false)
    } catch (err) {
      console.error('Save error:', err)
      alert('Kaydetme başarısız: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (pkg) => {
    if (!confirm(`"${pkg.name}" paketini silmek istediğinize emin misiniz?`)) return
    
    try {
      await deletePackage(pkg.id)
      await loadPackages()
    } catch (err) {
      console.error('Delete error:', err)
      alert('Silme başarısız: ' + err.message)
    }
  }

  const addFeature = () => {
    if (featureInput.trim()) {
      setFormData({ 
        ...formData, 
        features: [...formData.features, featureInput.trim()] 
      })
      setFeatureInput('')
    }
  }

  const removeFeature = (index) => {
    setFormData({ 
      ...formData, 
      features: formData.features.filter((_, i) => i !== index) 
    })
  }

  // Gün sayısını ay cinsine çevir (12 ay = 365 gün için özel düzeltme)
  const getPeriodText = (duration, durationDays) => {
    // 12 aylık paket için özel durum
    if (duration === 12 || durationDays >= 360) {
      return { months: 12, days: 365, label: '12 Ay (365 gün)' }
    }
    return { 
      months: duration, 
      days: durationDays, 
      label: `${duration} Ay (${durationDays} gün)` 
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-3 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <p className="text-red-500">{error}</p>
        <button 
          onClick={loadPackages}
          className="px-5 py-2.5 rounded-xl font-medium text-white flex items-center gap-2 hover:bg-red-700 transition-all"
          style={{ backgroundColor: PRIMARY }}
        >
          <RefreshCw className="w-4 h-4" />
          Tekrar Dene
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header - Premium Stil */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-red-600/30 to-red-900/20 border border-red-500/20">
              <Package className="w-6 h-6 text-red-500" />
            </div>
            Paket Yönetimi
            <span className="text-sm font-medium px-3 py-1.5 rounded-full bg-white/5 text-gray-400 border border-white/10">
              {packages.length} paket
            </span>
          </h1>
          <p className="text-gray-500 mt-3 flex items-center gap-2 text-sm">
            Abonelik paketlerini düzenleyin ve yönetin
            {lastUpdated && (
              <span className="text-xs text-gray-600">
                • Son güncelleme: {lastUpdated.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </p>
        </div>
        <button 
          onClick={loadPackages}
          className="px-4 py-2.5 rounded-xl font-medium text-gray-400 hover:text-white flex items-center gap-2 hover:bg-white/5 transition-all border border-white/10 hover:border-white/20"
        >
          <RefreshCw className="w-4 h-4" />
          Yenile
        </button>
      </div>

      {/* Packages Grid - Modern Bento Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {packages.map((pkg, index) => {
          const badgeStyle = BADGE_STYLES[pkg.badgeType] || BADGE_STYLES.default
          const BadgeIcon = badgeStyle.icon
          const PackageIcon = PACKAGE_ICONS[pkg.duration] || Package
          const theme = PACKAGE_THEMES[pkg.duration] || PACKAGE_THEMES[1]
          const period = getPeriodText(pkg.duration, pkg.duration_days)
          
          return (
            <div 
              key={pkg.id}
              className="group relative flex flex-col rounded-2xl overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:-translate-y-1 h-full"
              style={{ 
                background: `linear-gradient(180deg, rgba(30,30,30,0.8) 0%, rgba(20,20,20,0.95) 100%)`,
                border: `1px solid ${pkg.isPopular ? PRIMARY : 'rgba(255,255,255,0.08)'}`,
                boxShadow: pkg.isPopular ? `0 0 40px ${theme.glow}` : '0 4px 24px rgba(0,0,0,0.3)'
              }}
            >
              {/* Gradient Background Effect */}
              <div className={`absolute inset-0 bg-gradient-to-br ${theme.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-700`} />
              
              {/* Top Glow Line */}
              <div 
                className="absolute top-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{ background: `linear-gradient(90deg, transparent, ${theme.accent}, transparent)` }}
              />

              {/* Badge - Premium Stil */}
              {(pkg.badge || pkg.isPopular) && (
                <div 
                  className={`relative z-10 px-4 py-2.5 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider bg-gradient-to-r ${badgeStyle.gradient} ${badgeStyle.shadow} shadow-lg`}
                >
                  <BadgeIcon className="w-3.5 h-3.5" />
                  {pkg.badge}
                </div>
              )}

              {/* Card Content - Flex Column */}
              <div className="relative z-10 p-6 flex flex-col flex-1">
                {/* Icon & Name */}
                <div className="flex items-start gap-4 mb-5">
                  <div 
                    className={`p-3 rounded-xl ${theme.iconBg} border border-white/5 transition-transform duration-300 group-hover:scale-110`}
                    style={{ color: theme.accent }}
                  >
                    <PackageIcon className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-bold text-white leading-tight truncate">{pkg.name}</h3>
                    <p className="text-gray-500 text-sm mt-1 line-clamp-2">{pkg.description}</p>
                  </div>
                </div>

                {/* Price - Enhanced Typography */}
                <div className="mb-5">
                  <div className="flex items-baseline gap-1">
                    <span className="text-gray-500 text-xl font-medium">₺</span>
                    <span className="text-5xl font-black text-white tracking-tighter">
                      {pkg.price.toLocaleString('tr-TR')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span 
                      className="text-sm font-medium px-2.5 py-0.5 rounded-full"
                      style={{ backgroundColor: `${theme.accent}15`, color: theme.accent }}
                    >
                      {period.label}
                    </span>
                  </div>
                </div>

                {/* Divider */}
                <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-5" />

                {/* Features - Flex Grow ile esneyen alan */}
                <div className="space-y-3 flex-1">
                  {(pkg.features || []).slice(0, 4).map((feature, idx) => (
                    <div key={idx} className="flex items-center gap-3 text-sm group/item">
                      <div 
                        className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover/item:scale-110"
                        style={{ backgroundColor: `${theme.accent}15` }}
                      >
                        <CheckCircle2 className="w-3 h-3" style={{ color: theme.accent }} />
                      </div>
                      <span className="text-gray-300 group-hover/item:text-white transition-colors">{feature}</span>
                    </div>
                  ))}
                </div>

                {/* Actions - Her zaman alta sabit */}
                <div className="flex gap-3 mt-6 pt-2">
                  <button 
                    onClick={() => handleEdit(pkg)}
                    className="flex-1 py-2.5 px-4 rounded-xl font-medium text-white text-sm flex items-center justify-center gap-2 transition-all duration-300 hover:shadow-lg active:scale-95"
                    style={{ 
                      backgroundColor: theme.accent,
                      boxShadow: `0 4px 20px ${theme.glow}`
                    }}
                  >
                    <Edit2 className="w-4 h-4" />
                    Düzenle
                  </button>
                  <button 
                    onClick={() => handleDelete(pkg)}
                    className="px-4 rounded-xl border border-white/10 text-gray-500 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10 transition-all duration-300 active:scale-95"
                    title="Paketi Sil"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Corner Accent */}
              <div 
                className="absolute top-0 right-0 w-20 h-20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                style={{ 
                  background: `radial-gradient(circle at 100% 0%, ${theme.accent}10, transparent 70%)`
                }}
              />
            </div>
          )
        })}
      </div>

      {/* Empty State */}
      {packages.length === 0 && (
        <div className="text-center py-20 rounded-2xl border border-dashed border-gray-700 bg-white/[0.02]">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-white/5 flex items-center justify-center">
            <Package className="w-10 h-10 text-gray-600" />
          </div>
          <p className="text-gray-400 text-lg font-medium">Henüz paket bulunmuyor</p>
          <p className="text-gray-600 text-sm mt-2">Yeni bir paket eklemek için yukarıdaki butonu kullanın</p>
        </div>
      )}

      {/* Modal - Enhanced Design */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div 
            className="w-full max-w-lg rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
            style={{ 
              background: 'linear-gradient(180deg, #1a1a1a 0%, #141414 100%)',
              border: `1px solid ${BORDER}`,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
            }}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-gradient-to-br from-red-600/30 to-red-900/20 border border-red-500/20">
                  <Package className="w-5 h-5 text-red-500" />
                </div>
                <h2 className="text-xl font-bold text-white">
                  {editingPackage ? 'Paketi Düzenle' : 'Yeni Paket'}
                </h2>
              </div>
              <button 
                onClick={() => setShowModal(false)}
                className="p-2 rounded-xl hover:bg-white/10 text-gray-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-5">
              {/* Package Name */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Paket Adı</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Örn: 6 Aylık Paket"
                  className="w-full px-4 py-3 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] text-white placeholder-gray-600 focus:outline-none focus:border-red-600/50 focus:ring-1 focus:ring-red-600/50 transition-all"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Açıklama</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Paket açıklaması..."
                  className="w-full px-4 py-3 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] text-white placeholder-gray-600 focus:outline-none focus:border-red-600/50 focus:ring-1 focus:ring-red-600/50 transition-all"
                />
              </div>

              {/* Price & Duration */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Fiyat (₺)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">₺</span>
                    <input
                      type="number"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: parseInt(e.target.value) || 0 })}
                      className="w-full pl-9 pr-4 py-3 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] text-white focus:outline-none focus:border-red-600/50 focus:ring-1 focus:ring-red-600/50 transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Süre (Ay)</label>
                  <select
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
                    className="w-full px-4 py-3 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] text-white focus:outline-none focus:border-red-600/50 focus:ring-1 focus:ring-red-600/50 transition-all appearance-none cursor-pointer"
                  >
                    <option value={1}>1 Ay</option>
                    <option value={3}>3 Ay</option>
                    <option value={6}>6 Ay</option>
                    <option value={12}>12 Ay</option>
                  </select>
                </div>
              </div>

              {/* Badge */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Rozet (Opsiyonel)</label>
                <input
                  type="text"
                  value={formData.badge}
                  onChange={(e) => setFormData({ ...formData, badge: e.target.value })}
                  placeholder="Örn: %10 İndirim, Popüler, En İyi Fiyat"
                  className="w-full px-4 py-3 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] text-white placeholder-gray-600 focus:outline-none focus:border-red-600/50 focus:ring-1 focus:ring-red-600/50 transition-all"
                />
              </div>

              {/* Toggles */}
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={formData.isPopular}
                      onChange={(e) => setFormData({ ...formData, isPopular: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-700 rounded-full peer peer-checked:bg-red-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" />
                  </div>
                  <span className="text-gray-300 group-hover:text-white transition-colors">Popüler olarak işaretle</span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-700 rounded-full peer peer-checked:bg-emerald-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" />
                  </div>
                  <span className="text-gray-300 group-hover:text-white transition-colors">Aktif</span>
                </label>
              </div>

              {/* Features */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-3">Özellikler</label>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={featureInput}
                    onChange={(e) => setFeatureInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addFeature()}
                    placeholder="Yeni özellik ekle..."
                    className="flex-1 px-4 py-2.5 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] text-white placeholder-gray-600 focus:outline-none focus:border-red-600/50 focus:ring-1 focus:ring-red-600/50 transition-all text-sm"
                  />
                  <button
                    onClick={addFeature}
                    className="px-5 py-2.5 rounded-xl font-medium text-white text-sm hover:brightness-110 transition-all"
                    style={{ backgroundColor: PRIMARY }}
                  >
                    Ekle
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {formData.features.map((feature, idx) => (
                    <span 
                      key={idx}
                      className="px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 bg-white/5 text-gray-300 border border-white/10 hover:border-white/20 transition-colors"
                    >
                      {feature}
                      <button 
                        onClick={() => removeFeature(idx)}
                        className="text-gray-500 hover:text-red-400 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-8 pt-4 border-t border-white/5">
              <button 
                onClick={() => setShowModal(false)}
                className="flex-1 py-3 rounded-xl font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-all border border-white/10"
              >
                İptal
              </button>
              <button 
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-3 rounded-xl font-medium text-white flex items-center justify-center gap-2 hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: PRIMARY }}
              >
                {saving ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Save className="w-5 h-5" />
                )}
                {saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminPackages
