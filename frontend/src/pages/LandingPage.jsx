import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Play, Star, ChevronRight, Check, Globe, Shield, Zap } from 'lucide-react'
import Logo from '../components/Logo'

// Renk tanımları
const PRIMARY = '#E50914'
const PRIMARY_HOVER = '#F40612'
const BG_DARK = '#0a0a0a'
const BG_SURFACE = '#1a1a1a'
const BORDER = '#222222'

function LandingPage() {
  const [isScrolled, setIsScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const features = [
    { icon: Globe, title: '1000+ Kanal', desc: 'Ulusal ve uluslararası kanallar' },
    { icon: Zap, title: '4K UHD', desc: 'Ultra yüksek çözünürlük' },
    { icon: Shield, title: 'Kesintisiz', desc: 'Donma ve takılma yok' },
  ]

  // Button stili
  const btnPrimary = {
    backgroundColor: PRIMARY,
    color: 'white',
    fontWeight: 700,
    padding: '0.75rem 1.5rem',
    borderRadius: '0.5rem',
    transition: 'all 0.2s ease',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem'
  }

  const btnPrimaryHover = (e) => {
    e.target.style.backgroundColor = PRIMARY_HOVER
    e.target.style.transform = 'scale(1.02)'
  }

  const btnPrimaryLeave = (e) => {
    e.target.style.backgroundColor = PRIMARY
    e.target.style.transform = 'scale(1)'
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: BG_DARK }}>
      {/* Header */}
      <header 
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled 
            ? 'border-b backdrop-blur-xl' 
            : 'bg-gradient-to-b from-black/60 to-transparent'
        }`}
        style={isScrolled ? { backgroundColor: 'rgba(10,10,10,0.95)', borderColor: BORDER } : {}}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-16">
          <div className="flex items-center justify-between h-16 lg:h-20">
            {/* Logo */}
            <Logo to="/" />

            {/* Navigation - Ortada */}
            <nav className="hidden md:flex items-center gap-8">
              <Link to="/" className="text-sm font-medium text-white hover:text-white/80 transition-colors">
                Ana Sayfa
              </Link>
              <Link to="/register" className="text-sm font-medium text-white/80 hover:text-white transition-colors">
                Filmler
              </Link>
              <Link to="/register" className="text-sm font-medium text-white/80 hover:text-white transition-colors">
                Diziler
              </Link>
              <Link to="/register" className="text-sm font-medium text-white/80 hover:text-white transition-colors">
                Canlı TV
              </Link>
            </nav>

            {/* Right Side */}
            <div className="flex items-center gap-4">
              <Link 
                to="/login" 
                className="text-sm font-medium text-white hover:text-white/80 transition-colors"
              >
                Giriş Yap
              </Link>
              <Link 
                to="/register"
                style={btnPrimary}
                onMouseEnter={btnPrimaryHover}
                onMouseLeave={btnPrimaryLeave}
              >
                Hesap Oluştur
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center">
        {/* Background Image */}
        <div className="absolute inset-0">
          <img 
            src="https://images.unsplash.com/photo-1577223625816-7546f13df25d?w=1920&q=80"
            alt="Stadium"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/70 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/30" />
        </div>

        {/* Hero Content */}
        <div className="relative z-10 max-w-7xl ml-0 lg:ml-8 xl:ml-16 px-4 sm:px-6 lg:px-8 pt-20">
          <div className="max-w-2xl">
            {/* Badge/Stats */}
            <div className="flex items-center gap-4 mb-6">
              <div className="flex items-center gap-1.5">
                <Star className="w-4 h-4" style={{ color: '#fbbf24', fill: '#fbbf24' }} />
                <span className="font-bold text-sm" style={{ color: '#fbbf24' }}>9.8</span>
              </div>
              <span className="text-white/60">•</span>
              <span className="text-white/80 text-sm font-medium">2026</span>
              <span className="text-white/60">•</span>
              <span className="text-white/80 text-sm font-medium">Her Gün Güncel İçerik</span>
              <span className="text-white/60">•</span>
              <span className="text-white/80 text-sm font-medium">4K UHD</span>
            </div>

            {/* Title */}
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-black text-white leading-[1.1] mb-6">
              Sınırsız Eğlence<br />
              Tek Bir Yerde.
            </h1>

            {/* Description */}
            <p className="text-lg text-white/80 mb-8 max-w-xl leading-relaxed">
              Favori TV Şovlarınızı, Filmlerinizi, Canlı Yayınları, Haber Kanallarını, Spor Müsabakalarını, 
              Canlı Etkinlikleri ve Çocuklarınız İçin Çizgi Filmleri 4K HD Kalitesinde donmadan izleyin.
            </p>

            {/* CTA Buttons */}
            <div className="flex items-center gap-4">
              <Link 
                to="/register"
                style={{ ...btnPrimary, padding: '1rem 2rem', fontSize: '1.125rem' }}
                onMouseEnter={btnPrimaryHover}
                onMouseLeave={btnPrimaryLeave}
              >
                Hesap Oluştur
                <Play className="w-5 h-5" style={{ fill: 'white' }} />
              </Link>
              <button 
                className="w-12 h-12 rounded-xl border-2 flex items-center justify-center text-white transition-colors"
                style={{ borderColor: 'rgba(255,255,255,0.3)' }}
                onMouseEnter={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.6)'}
                onMouseLeave={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.3)'}
              >
                <span className="text-2xl font-light">+</span>
              </button>
            </div>

            {/* Features */}
            <div className="flex items-center gap-8 mt-12">
              {features.map((feature, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
                  >
                    <feature.icon className="w-5 h-5" style={{ color: PRIMARY }} />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm">{feature.title}</p>
                    <p className="text-white/60 text-xs">{feature.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Content Sections */}
      <section className="py-20" style={{ backgroundColor: BG_DARK }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-16">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-black text-white mb-4">
              Neden Flixify Pro?
            </h2>
            <p className="text-white/60 max-w-2xl mx-auto">
              En iyi IPTV deneyimi için tasarlandı. Kesintisiz yayın, yüksek kalite ve geniş içerik kütüphanesi.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                title: 'Canlı TV',
                desc: '1000+ ulusal ve uluslararası kanal canlı yayında. Spor, haber, müzik ve daha fazlası.',
                icon: '📺'
              },
              {
                title: 'Film Arşivi',
                desc: 'Yüzlerce film istediğiniz zaman izleyin. Aksiyondan komediye her türde içerik.',
                icon: '🎬'
              },
              {
                title: 'Dizi Kütüphanesi',
                desc: 'En popüler yerli ve yabancı diziler. Yeni bölümler anında yayında.',
                icon: '🎭'
              }
            ].map((item, i) => (
              <div 
                key={i} 
                className="rounded-2xl p-8 transition-colors"
                style={{ 
                  backgroundColor: BG_SURFACE, 
                  border: `1px solid ${BORDER}` 
                }}
              >
                <div className="text-4xl mb-4">{item.icon}</div>
                <h3 className="text-xl font-bold text-white mb-3">{item.title}</h3>
                <p className="text-white/60 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-20" style={{ backgroundColor: BG_SURFACE }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-16">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-black text-white mb-4">
              Hemen Başlayın
            </h2>
            <p className="text-white/60">
              Anonim kayıt, anında erişim. Kredi kartı gerekmez.
            </p>
          </div>

          <div 
            className="max-w-md mx-auto rounded-2xl p-8"
            style={{ backgroundColor: BG_DARK, border: `1px solid ${BORDER}` }}
          >
            <div className="text-center mb-8">
              <div 
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold mb-4"
                style={{ backgroundColor: 'rgba(229,9,20,0.1)', color: PRIMARY }}
              >
                <Check className="w-4 h-4" />
                7 Gün Ücretsiz Deneme
              </div>
              <div className="flex items-end justify-center gap-2">
                <span className="text-5xl font-black text-white">₺99</span>
                <span className="text-white/60 mb-2">/aylık</span>
              </div>
            </div>

            <ul className="space-y-4 mb-8">
              {[
                '1000+ Canlı TV Kanalı',
                '4K UHD Kalite',
                'VOD Film ve Dizi Arşivi',
                'Multi-device Desteği',
                '7/24 Teknik Destek'
              ].map((feature, i) => (
                <li key={i} className="flex items-center gap-3 text-white/80">
                  <Check className="w-5 h-5 flex-shrink-0" style={{ color: PRIMARY }} />
                  <span className="text-sm">{feature}</span>
                </li>
              ))}
            </ul>

            <Link 
              to="/register"
              style={{ ...btnPrimary, display: 'block', textAlign: 'center', width: '100%' }}
              onMouseEnter={btnPrimaryHover}
              onMouseLeave={btnPrimaryLeave}
            >
              Hesap Oluştur
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer 
        className="py-12 border-t"
        style={{ backgroundColor: BG_DARK, borderColor: BORDER }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-16">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <Logo size="small" to={null} />

            <div className="flex items-center gap-8 text-sm text-white/60">
              <a href="#" className="hover:text-white transition-colors">Gizlilik</a>
              <a href="#" className="hover:text-white transition-colors">Kullanım Şartları</a>
              <a href="#" className="hover:text-white transition-colors">İletişim</a>
            </div>

            <p className="text-sm text-white/40">
              © 2026 Flixify Pro. Tüm hakları saklıdır.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default LandingPage
