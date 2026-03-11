import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { Tv, Film, Clapperboard, Play, Sparkles, Zap } from 'lucide-react'

const PRIMARY = '#E50914'
const BG_DARK = '#0a0a0a'
const BG_CARD = '#141414'

// Ana kategoriler - Sadece bunlar var!
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
      {/* ========== HERO SECTION - Minimal ========== */}
      <section className="relative px-6 pt-16 pb-12 lg:pt-24 lg:pb-16">
        {/* Arka plan gradyanı */}
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(229,9,20,0.15), transparent)'
          }}
        />

        <div className="relative max-w-6xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6"
            style={{ backgroundColor: 'rgba(229,9,20,0.1)', border: '1px solid rgba(229,9,20,0.2)' }}
          >
            <Sparkles className="w-4 h-4" style={{ color: PRIMARY }} />
            <span className="text-sm font-medium text-white/80">Premium IPTV Deneyimi</span>
          </div>

          {/* Başlık */}
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-black text-white mb-6 tracking-tight">
            İstediğiniz içeriğe{' '}
            <span style={{ color: PRIMARY }}>anında</span>{' '}
            ulaşın
          </h1>

          {/* Açıklama */}
          <p className="text-lg md:text-xl text-white/60 max-w-2xl mx-auto mb-10 leading-relaxed">
            Canlı TV, film ve dizi arşivimizi keşfedin. 
            Yüksek kaliteli yayınlar için kategorinizi seçin.
          </p>

          {/* CTA Butonu */}
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

      {/* ========== KATEGORİLER - Sadece 3 Kart ========== */}
      <section className="px-6 pb-20">
        <div className="max-w-6xl mx-auto">
          {/* Grid */}
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
                  {/* Gradient Arka Plan */}
                  <div 
                    className={`absolute inset-0 bg-gradient-to-br ${category.gradient} opacity-60 transition-opacity duration-500`}
                    style={{ opacity: isHovered ? 1 : 0.6 }}
                  />

                  {/* Glow Efekti */}
                  <div 
                    className="absolute top-0 right-0 w-40 h-40 rounded-full blur-3xl transition-opacity duration-500"
                    style={{ 
                      backgroundColor: category.color,
                      opacity: isHovered ? 0.2 : 0.1
                    }}
                  />

                  {/* İçerik */}
                  <div className="relative p-8 h-full flex flex-col min-h-[280px]">
                    {/* İkon */}
                    <div 
                      className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 transition-transform duration-500"
                      style={{ 
                        backgroundColor: category.color,
                        transform: isHovered ? 'scale(1.1)' : 'scale(1)'
                      }}
                    >
                      <Icon className="w-8 h-8 text-white" />
                    </div>

                    {/* Başlık */}
                    <h3 className="text-2xl font-bold text-white mb-2">
                      {category.title}
                    </h3>

                    {/* Alt Başlık */}
                    <p className="text-sm font-semibold mb-3" style={{ color: category.color }}>
                      {category.subtitle}
                    </p>

                    {/* Açıklama */}
                    <p className="text-white/50 text-sm leading-relaxed mb-6 flex-grow">
                      {category.description}
                    </p>

                    {/* Ok İndikatörü */}
                    <div className="flex items-center gap-2 text-white/40 group-hover:text-white transition-colors">
                      <span className="text-sm font-medium">Keşfet</span>
                      <svg 
                        className="w-4 h-4 transition-transform group-hover:translate-x-1" 
                        fill="none" 
                        viewBox="0 0 24 24" 
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Alt Bilgi */}
          <div className="mt-12 text-center">
            <p className="text-white/40 text-sm">
              Aktif paketiniz: <span className="text-white font-medium">
                {user?.status === 'active' ? 'Premium' : 'Beklemede'}
              </span>
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}

export default HomePage
