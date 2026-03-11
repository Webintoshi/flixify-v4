import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { Tv, Film, Clapperboard, Play, Sparkles, Zap, MessageCircle, Package, X, Crown, ArrowRight } from 'lucide-react'
import { hasValidSubscription } from '../services/playlist'

const PRIMARY = '#E50914'
const BG_DARK = '#0a0a0a'
const BG_CARD = '#141414'
const WHATSAPP_GREEN = '#25D366'

// Ana kategoriler
const CATEGORIES = [
  {
    id: 'live',
    title: 'Canlı TV',
    subtitle: '1000+ Kanal',
    description: 'Ulusal, spor ve uluslararası yayınlar',
    icon: Tv,
    color: '#E50914',
    route: '/live-tv',
    gradient: 'from-red-600/20 via-red-900/10 to-transparent'
  },
  {
    id: 'movies',
    title: 'Filmler',
    subtitle: 'VOD Arşivi',
    description: 'Yüzlerce film ve güncel yapımlar',
    icon: Film,
    color: '#7c3aed',
    route: '/movies',
    gradient: 'from-purple-600/20 via-purple-900/10 to-transparent'
  },
  {
    id: 'series',
    title: 'Diziler',
    subtitle: 'Tüm Sezonlar',
    description: 'Popüler diziler ve yeni bölümler',
    icon: Clapperboard,
    color: '#2563eb',
    route: '/series',
    gradient: 'from-blue-600/20 via-blue-900/10 to-transparent'
  }
]

function HomePage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [isLoading, setIsLoading] = useState(true)
  const [hoveredCard, setHoveredCard] = useState(null)
  const [showPurchaseModal, setShowPurchaseModal] = useState(false)

  // Paket kontrolü
  useEffect(() => {
    if (user && !hasValidSubscription(user)) {
      setShowPurchaseModal(true)
    }
  }, [user])

  // Hızlı yükleme için minimal efekt
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 100)
    return () => clearTimeout(timer)
  }, [])

  if (isLoading) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: BG_DARK }}
      >
        <div className="w-12 h-12 border-3 border-t-transparent rounded-full animate-spin" 
          style={{ borderColor: PRIMARY, borderTopColor: 'transparent' }} 
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: BG_DARK }}>
      {/* ========== HERO SECTION ========== */}
      <section className="relative px-6 pt-16 pb-12 lg:pt-24 lg:pb-16">
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(229,9,20,0.15), transparent)'
          }}
        />

        <div className="relative max-w-6xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6"
            style={{ backgroundColor: 'rgba(229,9,20,0.1)', border: '1px solid rgba(229,9,20,0.2)' }}
          >
            <Sparkles className="w-4 h-4" style={{ color: PRIMARY }} />
            <span className="text-sm font-medium text-white/80">Premium IPTV Deneyimi</span>
          </div>

          <h1 className="text-4xl md:text-6xl lg:text-7xl font-black text-white mb-6 tracking-tight">
            İstediğiniz içeriğe{' '}
            <span style={{ color: PRIMARY }}>anında</span>{' '}
            ulaşın
          </h1>

          <p className="text-lg md:text-xl text-white/60 max-w-2xl mx-auto mb-10 leading-relaxed">
            Canlı TV, film ve dizi arşivimizi keşfedin. 
            Yüksek kaliteli yayınlar için kategorinizi seçin.
          </p>

          <button
            onClick={() => navigate('/live-tv')}
            className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl font-bold text-lg text-white transition-all hover:scale-105"
            style={{ 
              backgroundColor: PRIMARY,
              boxShadow: '0 10px 40px rgba(229,9,20,0.4)'
            }}
          >
            <Play className="w-5 h-5" fill="white" />
            Canlı TV'ye Git
            <Zap className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* ========== KATEGORİLER ========== */}
      <section className="px-6 pb-20">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-6">
            {CATEGORIES.map((category) => {
              const Icon = category.icon
              const isHovered = hoveredCard === category.id

              return (
                <button
                  key={category.id}
                  onClick={() => navigate(category.route)}
                  onMouseEnter={() => setHoveredCard(category.id)}
                  onMouseLeave={() => setHoveredCard(null)}
                  className="group relative text-left rounded-3xl overflow-hidden transition-all duration-500"
                  style={{
                    backgroundColor: BG_CARD,
                    border: `1px solid ${isHovered ? category.color : 'rgba(255,255,255,0.08)'}`,
                    transform: isHovered ? 'translateY(-8px)' : 'translateY(0)',
                    boxShadow: isHovered 
                      ? `0 30px 60px -20px ${category.color}40`
                      : '0 10px 30px -15px rgba(0,0,0,0.5)'
                  }}
                >
                  <div 
                    className={`absolute inset-0 bg-gradient-to-br ${category.gradient} opacity-60 transition-opacity duration-500`}
                    style={{ opacity: isHovered ? 1 : 0.6 }}
                  />

                  <div 
                    className="absolute top-0 right-0 w-40 h-40 rounded-full blur-3xl transition-opacity duration-500"
                    style={{ 
                      backgroundColor: category.color,
                      opacity: isHovered ? 0.2 : 0.1
                    }}
                  />

                  <div className="relative p-8 h-full flex flex-col min-h-[280px]">
                    <div 
                      className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 transition-transform duration-500"
                      style={{ 
                        backgroundColor: category.color,
                        transform: isHovered ? 'scale(1.1)' : 'scale(1)'
                      }}
                    >
                      <Icon className="w-8 h-8 text-white" />
                    </div>

                    <h3 className="text-2xl font-bold text-white mb-2">
                      {category.title}
                    </h3>

                    <p className="text-sm font-semibold mb-3" style={{ color: category.color }}>
                      {category.subtitle}
                    </p>

                    <p className="text-white/50 text-sm leading-relaxed mb-6 flex-grow">
                      {category.description}
                    </p>

                    <div className="flex items-center gap-2 text-white/40 group-hover:text-white transition-colors">
                      <span className="text-sm font-medium">Keşfet</span>
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {/* ========== PAKET SATIN ALMA MODAL - Modern Tasarım ========== */}
      {showPurchaseModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-300"
          style={{ backgroundColor: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(10px)' }}
          onClick={(e) => e.target === e.currentTarget && setShowPurchaseModal(false)}
        >
          <div 
            className="relative w-full max-w-lg rounded-3xl overflow-hidden animate-in zoom-in-95 duration-300"
            style={{
              background: 'linear-gradient(145deg, #1a1a1a 0%, #0d0d0d 100%)',
              border: '1px solid rgba(255,255,255,0.1)'
            }}
          >
            {/* Glow Efekti */}
            <div 
              className="absolute -top-20 -right-20 w-40 h-40 rounded-full blur-3xl opacity-50"
              style={{ backgroundColor: PRIMARY }}
            />
            <div 
              className="absolute -bottom-20 -left-20 w-40 h-40 rounded-full blur-3xl opacity-30"
              style={{ backgroundColor: WHATSAPP_GREEN }}
            />

            {/* Kapat Butonu */}
            <button
              onClick={() => setShowPurchaseModal(false)}
              className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-all"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="relative p-8">
              {/* Header */}
              <div className="text-center mb-8">
                <div 
                  className="w-20 h-20 rounded-3xl mx-auto mb-6 flex items-center justify-center"
                  style={{ 
                    background: `linear-gradient(135deg, ${PRIMARY}20, ${PRIMARY}40)`,
                    border: `2px solid ${PRIMARY}60`
                  }}
                >
                  <Crown className="w-10 h-10" style={{ color: PRIMARY }} />
                </div>
                
                <h2 className="text-3xl font-black text-white mb-3">
                  Premium Erişim
                </h2>
                <p className="text-white/60 text-lg leading-relaxed">
                  Tüm içeriklere erişmek için aktif bir paket satın almalısınız
                </p>
              </div>

              {/* Butonlar */}
              <div className="space-y-4">
                {/* WhatsApp ile İletişim */}
                <a
                  href="https://wa.me/447510223419"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group w-full flex items-center gap-4 p-5 rounded-2xl transition-all hover:scale-[1.02]"
                  style={{ 
                    backgroundColor: `${WHATSAPP_GREEN}15`,
                    border: `2px solid ${WHATSAPP_GREEN}40`
                  }}
                >
                  <div 
                    className="w-14 h-14 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110"
                    style={{ backgroundColor: WHATSAPP_GREEN }}
                  >
                    <MessageCircle className="w-7 h-7 text-white" fill="white" />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-bold text-white text-lg">WhatsApp ile İletişim</div>
                    <div className="text-white/50 text-sm">+44 7510 223419</div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-white/30 group-hover:text-white transition-colors" />
                </a>

                {/* Paket Satın Al */}
                <button
                  onClick={() => {
                    setShowPurchaseModal(false)
                    navigate('/profil/paketler')
                  }}
                  className="group w-full flex items-center gap-4 p-5 rounded-2xl transition-all hover:scale-[1.02]"
                  style={{ 
                    backgroundColor: `${PRIMARY}15`,
                    border: `2px solid ${PRIMARY}40`
                  }}
                >
                  <div 
                    className="w-14 h-14 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110"
                    style={{ backgroundColor: PRIMARY }}
                  >
                    <Package className="w-7 h-7 text-white" />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-bold text-white text-lg">Paket Satın Al</div>
                    <div className="text-white/50 text-sm">Tüm paketleri görüntüle</div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-white/30 group-hover:text-white transition-colors" />
                </button>
              </div>

              {/* Alt Bilgi */}
              <div className="mt-8 pt-6 text-center" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <button
                  onClick={() => setShowPurchaseModal(false)}
                  className="text-white/40 hover:text-white text-sm font-medium transition-colors"
                >
                  Şimdi değil, daha sonra hatırlat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default HomePage
