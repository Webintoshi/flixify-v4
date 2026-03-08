import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { 
  Play, Info, ChevronLeft, ChevronRight,
  Radio, Clapperboard, Film, Trophy,
  Tv, Flame, Star, Clock, Calendar, Sparkles
} from 'lucide-react'
import { hasValidSubscription } from '../services/playlist'

const PRIMARY = '#E50914'
const BG_DARK = '#0a0a0a'
const BG_SURFACE = '#141414'
const BG_CARD = '#1a1a1a'
const BORDER = '#2a2a2a'

// === ENHANCED CONTENT DATA ===
// Yerel logolar - /public/logos/ klasorunden yuklenir
const POPULAR_CHANNELS = [
  { name: 'TRT 1', genre: 'Ulusal', logo: '/logos/channels/trt1.png', viewers: '1.2M' },
  { name: 'Show TV', genre: 'Ulusal', logo: '/logos/channels/showtv.png', viewers: '850K' },
  { name: 'Kanal D', genre: 'Ulusal', logo: '/logos/channels/kanald.png', viewers: '720K' },
  { name: 'Star TV', genre: 'Ulusal', logo: '/logos/channels/startv.png', viewers: '680K' },
  { name: 'ATV', genre: 'Ulusal', logo: '/logos/channels/atv.png', viewers: '920K' },
  { name: 'Fox TV', genre: 'Ulusal', logo: '/logos/channels/fox.png', viewers: '540K' },
  { name: 'TV8', genre: 'Ulusal', logo: '/logos/channels/tv8.png', viewers: '1.1M' },
  { name: 'Beyaz TV', genre: 'Ulusal', logo: '/logos/channels/beyaztv.png', viewers: '420K' },
  { name: 'TRT Spor', genre: 'Spor', logo: '/logos/channels/trtspor.png', viewers: '380K', live: true },
  { name: 'beIN Sports 1', genre: 'Spor', logo: '/logos/channels/beinsports.png', viewers: '650K', live: true },
  { name: 'A Spor', genre: 'Spor', logo: '/logos/channels/aspor.png', viewers: '290K', live: true },
  { name: 'Eurosport', genre: 'Spor', logo: '/logos/channels/eurosport.png', viewers: '180K' },
]

const POPULAR_MOVIES = [
  { name: 'The Batman', genre: 'Aksiyon', logo: '/logos/movies/batman.jpg', rating: '8.5', year: '2022', duration: '2h 56m' },
  { name: 'Spider-Man: No Way Home', genre: 'Aksiyon', logo: '/logos/movies/spiderman.jpg', rating: '8.7', year: '2021', duration: '2h 28m' },
  { name: 'Top Gun: Maverick', genre: 'Aksiyon', logo: '/logos/movies/topgun.jpg', rating: '8.4', year: '2022', duration: '2h 10m' },
  { name: 'Jurassic World: Dominion', genre: 'Bilim Kurgu', logo: '/logos/movies/jurassic.jpg', rating: '7.0', year: '2022', duration: '2h 26m' },
  { name: 'Minions: The Rise of Gru', genre: 'Animasyon', logo: '/logos/movies/minions.jpg', rating: '6.6', year: '2022', duration: '1h 27m' },
  { name: 'Lightyear', genre: 'Animasyon', logo: '/logos/movies/lightyear.jpg', rating: '6.1', year: '2022', duration: '1h 45m' },
  { name: 'Elvis', genre: 'Biyografi', logo: '/logos/movies/elvis.jpg', rating: '7.6', year: '2022', duration: '2h 39m' },
  { name: 'The Northman', genre: 'Dram', logo: '/logos/movies/northman.jpg', rating: '7.2', year: '2022', duration: '2h 17m' },
  { name: 'Doctor Strange 2', genre: 'Aksiyon', logo: '/logos/movies/doctorstrange.jpg', rating: '7.0', year: '2022', duration: '2h 6m' },
  { name: 'Thor: Love and Thunder', genre: 'Aksiyon', logo: '/logos/movies/thor.jpg', rating: '6.7', year: '2022', duration: '1h 58m' },
]

const POPULAR_SERIES = [
  { name: 'Game of Thrones', genre: 'Fantastik', logo: '/logos/series/got.jpg', rating: '9.2', seasons: '8 Sezon', episodes: '73 Bolum' },
  { name: 'Breaking Bad', genre: 'Dram', logo: '/logos/series/breakingbad.jpg', rating: '9.5', seasons: '5 Sezon', episodes: '62 Bolum' },
  { name: 'Stranger Things', genre: 'Bilim Kurgu', logo: '/logos/series/strangerthings.jpg', rating: '8.7', seasons: '4 Sezon', episodes: '34 Bolum' },
  { name: 'The Walking Dead', genre: 'Korku', logo: '/logos/series/walkingdead.jpg', rating: '8.1', seasons: '11 Sezon', episodes: '177 Bolum' },
  { name: 'Peaky Blinders', genre: 'Dram', logo: '/logos/series/peakyblinders.jpg', rating: '8.8', seasons: '6 Sezon', episodes: '36 Bolum' },
  { name: 'The Witcher', genre: 'Fantastik', logo: '/logos/series/witcher.jpg', rating: '8.0', seasons: '3 Sezon', episodes: '24 Bolum' },
  { name: 'Money Heist', genre: 'Aksiyon', logo: '/logos/series/moneyheist.jpg', rating: '8.2', seasons: '5 Sezon', episodes: '48 Bolum' },
  { name: 'Narcos', genre: 'Suc', logo: '/logos/series/narcos.jpg', rating: '8.8', seasons: '3 Sezon', episodes: '30 Bolum' },
]

// Genre colors for fallback
const GENRE_COLORS = {
  'Aksiyon': '#E50914',
  'Dram': '#7c3aed',
  'Bilim Kurgu': '#2563eb',
  'Animasyon': '#db2777',
  'Biyografi': '#d97706',
  'Korku': '#7c3aed',
  'Suc': '#dc2626',
  'Fantastik': '#059669',
  'Ulusal': '#E50914',
  'Spor': '#10b981'
}

// Skeleton Loader Component
const SkeletonCard = ({ type }) => (
  <div 
    className="flex-shrink-0 animate-pulse"
    style={{ width: type === 'live' ? '280px' : '200px', scrollSnapAlign: 'start' }}
  >
    <div 
      className="rounded-xl overflow-hidden"
      style={{
        aspectRatio: type === 'live' ? '16/9' : '2/3',
        backgroundColor: BG_CARD,
        border: `2px solid ${BORDER}`
      }}
    >
      <div className="w-full h-full bg-white/5" />
    </div>
    <div className="mt-2 space-y-1">
      <div className="h-4 bg-white/10 rounded w-3/4" />
      <div className="h-3 bg-white/5 rounded w-1/2" />
    </div>
  </div>
)

// Enhanced Content Card Component
const ContentCard = ({ item, type }) => {
  const [isHovered, setIsHovered] = useState(false)
  const [imgError, setImgError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const navigate = useNavigate()
  
  const handleClick = () => {
    if (type === 'live') navigate(`/live-tv`)
    else if (type === 'movie') navigate(`/movies`)
    else if (type === 'series') navigate(`/series`)
  }

  const getInitials = (name) => {
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  }
  
  const getGenreColor = (genre) => {
    return GENRE_COLORS[genre] || '#E50914'
  }

  const genreColor = getGenreColor(item.genre)
  const isLive = type === 'live'
  const isPoster = type === 'movie' || type === 'series'

  return (
    <div
      className="flex-shrink-0 cursor-pointer group"
      style={{ width: isLive ? '280px' : '200px', scrollSnapAlign: 'start' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
    >
      {/* Card Container */}
      <div 
        className="relative rounded-2xl overflow-hidden transition-all duration-300"
        style={{
          transform: isHovered ? 'scale(1.08)' : 'scale(1)',
          aspectRatio: isLive ? '16/9' : '2/3',
          backgroundColor: BG_CARD,
          border: `2px solid ${isHovered ? genreColor : BORDER}`,
          boxShadow: isHovered ? `0 20px 40px rgba(0,0,0,0.6), 0 0 30px ${genreColor}20` : 'none'
        }}
      >
        {/* Loading Skeleton */}
        {isLoading && !imgError && (
          <div className="absolute inset-0 bg-white/5 animate-pulse" />
        )}
        
        {/* Main Image */}
        {item.logo && !imgError ? (
          <img 
            src={item.logo} 
            alt={item.name}
            className={`w-full h-full transition-all duration-500 ${
              isPoster ? 'object-cover' : 'object-contain p-6'
            } ${isLoading ? 'opacity-0' : 'opacity-100'}`}
            loading="lazy"
            onLoad={() => setIsLoading(false)}
            onError={() => { setImgError(true); setIsLoading(false); }}
          />
        ) : null}
        
        {/* Fallback / Error State */}
        {(imgError || !item.logo) && (
          <div 
            className="absolute inset-0 flex flex-col items-center justify-center p-4"
            style={{ background: `linear-gradient(135deg, ${genreColor}20 0%, ${BG_CARD} 100%)` }}
          >
            {/* Colored Avatar */}
            <div 
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-3 shadow-lg"
              style={{ backgroundColor: genreColor }}
            >
              <span className="text-2xl font-black text-white">{getInitials(item.name)}</span>
            </div>
            {/* Type Icon */}
            {type === 'live' && <Tv className="w-6 h-6 text-white/30 absolute bottom-4 right-4" />}
            {type === 'movie' && <Film className="w-6 h-6 text-white/30 absolute bottom-4 right-4" />}
            {type === 'series' && <Clapperboard className="w-6 h-6 text-white/30 absolute bottom-4 right-4" />}
          </div>
        )}
        
        {/* Gradient Overlay for Posters */}
        {isPoster && !imgError && (
          <div 
            className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          />
        )}
        
        {/* Hover Overlay with Play Button */}
        {isHovered && (
          <div 
            className="absolute inset-0 flex items-center justify-center"
            style={{ backgroundColor: isPoster ? 'transparent' : 'rgba(0,0,0,0.6)' }}
          >
            <div 
              className="w-14 h-14 rounded-full flex items-center justify-center transform scale-0 group-hover:scale-100 transition-transform duration-300"
              style={{ backgroundColor: PRIMARY, boxShadow: `0 0 30px ${PRIMARY}60` }}
            >
              <Play className="w-7 h-7 text-white ml-1" fill="white" />
            </div>
          </div>
        )}
        
        {/* Live Badge */}
        {isLive && item.live && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 shadow-lg">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span className="text-xs font-bold text-white tracking-wide">CANLI</span>
          </div>
        )}
        
        {/* Rating Badge for Movies/Series */}
        {isPoster && item.rating && (
          <div 
            className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-lg bg-black/70 backdrop-blur-sm"
            style={{ opacity: isHovered ? 0 : 1, transition: 'opacity 0.3s' }}
          >
            <Star className="w-3 h-3 text-yellow-500" fill="currentColor" />
            <span className="text-xs font-bold text-white">{item.rating}</span>
          </div>
        )}
        
        {/* Info Overlay on Hover for Posters */}
        {isPoster && isHovered && (
          <div className="absolute bottom-0 left-0 right-0 p-4">
            <h4 className="text-white font-bold text-sm mb-1 line-clamp-2">{item.name}</h4>
            <div className="flex items-center gap-2 text-xs text-white/70">
              {item.year && <span>{item.year}</span>}
              {item.duration && <span>• {item.duration}</span>}
              {item.seasons && <span>{item.seasons}</span>}
            </div>
          </div>
        )}
      </div>
      
      {/* Card Info */}
      <div className="mt-3 px-1">
        <p className="text-white font-semibold text-sm truncate group-hover:text-white transition-colors">
          {item.name}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span 
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ 
              backgroundColor: `${genreColor}20`,
              color: genreColor
            }}
          >
            {item.genre}
          </span>
          {item.viewers && (
            <span className="text-xs text-white/40 flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-green-500" />
              {item.viewers}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// Enhanced Content Row Component
const ContentRow = ({ title, items, type, viewAllLink, icon: Icon, loading = false }) => {
  const sliderRef = useRef(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)

  const scroll = (dir) => {
    if (sliderRef.current) {
      const scrollAmount = type === 'live' ? 900 : 700
      sliderRef.current.scrollBy({ left: dir === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' })
    }
  }

  const handleScroll = () => {
    if (sliderRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = sliderRef.current
      setCanScrollLeft(scrollLeft > 0)
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10)
    }
  }

  return (
    <div className="mb-10 group/row">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 px-4 lg:px-12">
        <div className="flex items-center gap-3">
          {Icon && (
            <div 
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${PRIMARY}20` }}
            >
              <Icon className="w-4 h-4" style={{ color: PRIMARY }} />
            </div>
          )}
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <span className="text-sm text-white/40">({items.length})</span>
        </div>
        <Link 
          to={viewAllLink} 
          className="text-sm font-semibold hover:text-white transition-colors flex items-center gap-1 group/link"
          style={{ color: PRIMARY }}
        >
          Tümünü Gör
          <ChevronRight className="w-4 h-4 transform group-hover/link:translate-x-1 transition-transform" />
        </Link>
      </div>

      {/* Slider */}
      <div className="relative">
        {/* Left Arrow */}
        {canScrollLeft && (
          <button
            onClick={() => scroll('left')}
            className="absolute left-0 top-0 bottom-8 z-20 w-20 flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-all duration-300"
            style={{ background: 'linear-gradient(to right, rgba(10,10,10,1) 0%, rgba(10,10,10,0.8) 50%, transparent 100%)' }}
          >
            <div 
              className="w-12 h-12 rounded-full flex items-center justify-center transition-transform hover:scale-110"
              style={{ backgroundColor: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)' }}
            >
              <ChevronLeft className="w-6 h-6 text-white" />
            </div>
          </button>
        )}

        {/* Cards Container */}
        <div
          ref={sliderRef}
          onScroll={handleScroll}
          className="flex gap-5 overflow-x-auto px-4 lg:px-12 pb-6 hide-scrollbar"
          style={{ scrollSnapType: 'x mandatory' }}
        >
          {loading ? (
            // Skeleton Loading State
            [...Array(6)].map((_, i) => <SkeletonCard key={i} type={type} />)
          ) : (
            items.map((item, i) => (
              <ContentCard key={`${item.name}-${i}`} item={item} type={type} />
            ))
          )}
        </div>

        {/* Right Arrow */}
        {canScrollRight && (
          <button
            onClick={() => scroll('right')}
            className="absolute right-0 top-0 bottom-8 z-20 w-20 flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-all duration-300"
            style={{ background: 'linear-gradient(to left, rgba(10,10,10,1) 0%, rgba(10,10,10,0.8) 50%, transparent 100%)' }}
          >
            <div 
              className="w-12 h-12 rounded-full flex items-center justify-center transition-transform hover:scale-110"
              style={{ backgroundColor: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)' }}
            >
              <ChevronRight className="w-6 h-6 text-white" />
            </div>
          </button>
        )}
      </div>
    </div>
  )
}

function HomePage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(false)
  const [showPurchaseModal, setShowPurchaseModal] = useState(false)
  
  // Check subscription status
  useEffect(() => {
    if (user) {
      const hasSubscription = user.expiresAt && new Date(user.expiresAt) > new Date()
      if (!hasSubscription) {
        setShowPurchaseModal(true)
      }
    }
  }, [user])

  const categories = [
    { id: 'live', title: 'Canlı TV', icon: Radio, count: '1000+ Kanal', link: '/live-tv', color: PRIMARY },
    { id: 'movies', title: 'Filmler', icon: Film, count: 'Yüzlerce Film', link: '/movies', color: '#7c3aed' },
    { id: 'series', title: 'Diziler', icon: Clapperboard, count: 'Tüm Sezonlar', link: '/series', color: '#2563eb' },
    { id: 'sports', title: 'Spor', icon: Trophy, count: 'Canlı Maçlar', link: '/live-tv', color: '#dc2626' },
  ]

  return (
    <div style={{ backgroundColor: BG_DARK, minHeight: '100vh' }}>
      {/* Hero Section - Enhanced */}
      <section className="relative h-[70vh] min-h-[500px] flex items-end overflow-hidden">
        {/* Animated Background */}
        <div className="absolute inset-0">
          <div 
            className="absolute inset-0"
            style={{ 
              background: 'linear-gradient(135deg, rgba(229,9,20,0.4) 0%, rgba(124,58,237,0.2) 50%, rgba(10,10,10,0.9) 100%)' 
            }}
          />
          <div 
            className="absolute inset-0" 
            style={{ background: 'linear-gradient(to top, #0a0a0a 0%, rgba(10,10,10,0.3) 50%, transparent 100%)' }} 
          />
          {/* Subtle Pattern */}
          <div 
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: `radial-gradient(circle at 2px 2px, rgba(255,255,255,0.15) 1px, transparent 0)`,
              backgroundSize: '40px 40px'
            }}
          />
        </div>

        <div className="relative z-10 w-full pb-20">
          <div className="max-w-7xl mx-auto px-4 lg:px-12">
            <div className="max-w-2xl">
              {/* Badges */}
              <div className="flex items-center gap-3 mb-5">
                <div 
                  className="flex items-center gap-2 px-4 py-1.5 rounded-full"
                  style={{ backgroundColor: PRIMARY }}
                >
                  <Flame className="w-4 h-4 text-white" />
                  <span className="text-sm font-bold text-white">Trend</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm">
                  <Star className="w-3.5 h-3.5 text-yellow-500" fill="currentColor" />
                  <span className="text-sm text-white/80">8.9</span>
                </div>
                <span className="text-white/60">Spor</span>
              </div>

              <h1 className="text-5xl md:text-6xl font-black text-white mb-5 leading-tight">
                TRT Spor
              </h1>

              <p className="text-lg text-white/80 mb-8 leading-relaxed max-w-xl">
                Binlerce kanal, yüzlerce film ve dizi tek bir platformda. 
                HD kalitede kesintisiz izleme deneyimi.
              </p>

              <div className="flex items-center gap-4">
                <button 
                  onClick={() => navigate('/live-tv')}
                  className="flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-lg transition-all hover:scale-105 hover:shadow-lg"
                  style={{ 
                    backgroundColor: PRIMARY, 
                    color: 'white',
                    boxShadow: '0 10px 30px rgba(229,9,20,0.4)'
                  }}
                >
                  <Play className="w-5 h-5" fill="white" />
                  Hemen İzle
                </button>
                
                <button 
                  onClick={() => navigate('/movies')}
                  className="flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-lg text-white transition-all hover:scale-105 hover:bg-white/20"
                  style={{ backgroundColor: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)' }}
                >
                  <Info className="w-5 h-5" />
                  Keşfet
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Content Rows - Enhanced with Posters */}
      <section className="relative z-20 -mt-16 pb-12">
        <ContentRow 
          title="Canlı TV - Popüler Kanallar" 
          items={POPULAR_CHANNELS} 
          type="live"
          viewAllLink="/live-tv"
          icon={Radio}
          loading={isLoading}
        />
        
        <ContentRow 
          title="Güncel Filmler" 
          items={POPULAR_MOVIES} 
          type="movie"
          viewAllLink="/movies"
          icon={Film}
          loading={isLoading}
        />
        
        <ContentRow 
          title="Popüler Diziler" 
          items={POPULAR_SERIES} 
          type="series"
          viewAllLink="/series"
          icon={Clapperboard}
          loading={isLoading}
        />
      </section>

      {/* Categories - Enhanced */}
      <section className="py-16" style={{ backgroundColor: BG_SURFACE }}>
        <div className="max-w-7xl mx-auto px-4 lg:px-12">
          <div className="flex items-center gap-3 mb-8">
            <div 
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${PRIMARY}20` }}
            >
              <Star className="w-5 h-5" style={{ color: PRIMARY }} />
            </div>
            <h2 className="text-2xl font-bold text-white">Kategoriler</h2>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {categories.map((cat) => (
              <Link
                key={cat.id}
                to={cat.link}
                className="group relative h-36 rounded-2xl overflow-hidden transition-all duration-300 hover:scale-105"
                style={{ backgroundColor: BG_CARD, border: `1px solid ${BORDER}` }}
              >
                {/* Gradient Background */}
                <div 
                  className="absolute inset-0 opacity-30 group-hover:opacity-50 transition-opacity"
                  style={{ background: `linear-gradient(135deg, ${cat.color} 0%, transparent 70%)` }}
                />
                
                {/* Hover Glow */}
                <div 
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ 
                    background: `radial-gradient(circle at 50% 50%, ${cat.color}30 0%, transparent 70%)`
                  }}
                />
                
                <div className="relative h-full p-6 flex flex-col justify-between">
                  <cat.icon className="w-12 h-12" style={{ color: cat.color }} />
                  <div>
                    <h3 className="text-xl font-bold text-white mb-1">{cat.title}</h3>
                    <p className="text-sm text-white/50">{cat.count}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Quick Access - Enhanced */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 lg:px-12">
          <div className="flex items-center gap-3 mb-8">
            <div 
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${PRIMARY}20` }}
            >
              <Clock className="w-5 h-5" style={{ color: PRIMARY }} />
            </div>
            <h2 className="text-2xl font-bold text-white">Hızlı Erişim</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <Link 
              to="/live-tv"
              className="flex items-center gap-5 p-6 rounded-2xl transition-all hover:scale-[1.02] group"
              style={{ backgroundColor: BG_CARD, border: `1px solid ${BORDER}` }}
            >
              <div 
                className="w-16 h-16 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110"
                style={{ backgroundColor: PRIMARY }}
              >
                <Tv className="w-8 h-8 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white mb-1">Canlı TV</h3>
                <p className="text-sm text-white/50">Tüm kanallar</p>
              </div>
              <ChevronRight className="w-6 h-6 text-white/30 ml-auto group-hover:text-white transition-colors" />
            </Link>
            
            <Link 
              to="/movies"
              className="flex items-center gap-5 p-6 rounded-2xl transition-all hover:scale-[1.02] group"
              style={{ backgroundColor: BG_CARD, border: `1px solid ${BORDER}` }}
            >
              <div 
                className="w-16 h-16 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110"
                style={{ backgroundColor: '#7c3aed' }}
              >
                <Film className="w-8 h-8 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white mb-1">Filmler</h3>
                <p className="text-sm text-white/50">VOD arşivi</p>
              </div>
              <ChevronRight className="w-6 h-6 text-white/30 ml-auto group-hover:text-white transition-colors" />
            </Link>
            
            <Link 
              to="/series"
              className="flex items-center gap-5 p-6 rounded-2xl transition-all hover:scale-[1.02] group"
              style={{ backgroundColor: BG_CARD, border: `1px solid ${BORDER}` }}
            >
              <div 
                className="w-16 h-16 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110"
                style={{ backgroundColor: '#2563eb' }}
              >
                <Clapperboard className="w-8 h-8 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white mb-1">Diziler</h3>
                <p className="text-sm text-white/50">Tüm sezonlar</p>
              </div>
              <ChevronRight className="w-6 h-6 text-white/30 ml-auto group-hover:text-white transition-colors" />
            </Link>
          </div>
        </div>
      </section>

      <div className="h-20" />

      {/* Purchase Modal - Show when no valid subscription */}
      {user && !hasValidSubscription(user) && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.95)' }}
        >
          <div 
            className="w-full max-w-md rounded-3xl p-8 text-center"
            style={{ backgroundColor: BG_SURFACE, border: `2px solid ${PRIMARY}` }}
          >
            {/* Icon */}
            <div 
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
              style={{ backgroundColor: `${PRIMARY}20` }}
            >
              <Sparkles className="w-8 h-8" style={{ color: PRIMARY }} />
            </div>
            
            {/* Title */}
            <h2 className="text-xl font-bold text-white mb-2">
              Henüz Aktif Değilsiniz
            </h2>
            
            {/* Description */}
            <p className="text-gray-400 text-sm mb-6">
              Sınırsız içeriğe erişmek için paketinizi aktif edin veya destek ekibimizle iletişime geçin.
            </p>

            {/* Action Buttons - Side by Side */}
            <div className="flex gap-3 mb-3">
              <button
                onClick={() => window.open('https://wa.me/905xxxxxxxxx', '_blank')}
                className="flex-1 py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all hover:opacity-90"
                style={{ backgroundColor: '#25d366', color: '#fff' }}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                İletişime Geç
              </button>
              
              <button
                onClick={() => navigate('/profil/paketler')}
                className="flex-1 py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all hover:opacity-90"
                style={{ backgroundColor: PRIMARY, color: '#fff' }}
              >
                <Sparkles className="w-4 h-4" />
                Paket Satın Al
              </button>
            </div>
            
            {/* Profile Link */}
            <button
              onClick={() => navigate('/profil')}
              className="w-full py-3 rounded-xl font-medium text-sm text-white/60 hover:text-white transition-colors"
              style={{ backgroundColor: 'transparent' }}
            >
              Profilime Git →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default HomePage
