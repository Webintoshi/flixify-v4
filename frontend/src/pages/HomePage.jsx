import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import {
  Play,
  Info,
  ChevronLeft,
  ChevronRight,
  Radio,
  Clapperboard,
  Film,
  Trophy,
  Tv,
  Flame,
  Star,
  Clock,
  Sparkles
} from 'lucide-react'
import { fetchUserPlaylist, hasValidSubscription } from '../services/playlist'

const PRIMARY = '#E50914'
const BG_DARK = '#0a0a0a'
const BG_SURFACE = '#141414'
const BG_CARD = '#1a1a1a'
const BORDER = '#2a2a2a'

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
  { name: 'Eurosport', genre: 'Spor', logo: '/logos/channels/eurosport.png', viewers: '180K' }
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
  { name: 'Thor: Love and Thunder', genre: 'Aksiyon', logo: '/logos/movies/thor.jpg', rating: '6.7', year: '2022', duration: '1h 58m' }
]

const POPULAR_SERIES = [
  { name: 'Game of Thrones', genre: 'Fantastik', logo: '/logos/series/got.jpg', rating: '9.2', seasons: '8 Sezon', episodes: '73 Bolum' },
  { name: 'Breaking Bad', genre: 'Dram', logo: '/logos/series/breakingbad.jpg', rating: '9.5', seasons: '5 Sezon', episodes: '62 Bolum' },
  { name: 'Stranger Things', genre: 'Bilim Kurgu', logo: '/logos/series/strangerthings.jpg', rating: '8.7', seasons: '4 Sezon', episodes: '34 Bolum' },
  { name: 'The Walking Dead', genre: 'Korku', logo: '/logos/series/walkingdead.jpg', rating: '8.1', seasons: '11 Sezon', episodes: '177 Bolum' },
  { name: 'Peaky Blinders', genre: 'Dram', logo: '/logos/series/peakyblinders.jpg', rating: '8.8', seasons: '6 Sezon', episodes: '36 Bolum' },
  { name: 'The Witcher', genre: 'Fantastik', logo: '/logos/series/witcher.jpg', rating: '8.0', seasons: '3 Sezon', episodes: '24 Bolum' },
  { name: 'Money Heist', genre: 'Aksiyon', logo: '/logos/series/moneyheist.jpg', rating: '8.2', seasons: '5 Sezon', episodes: '48 Bolum' },
  { name: 'Narcos', genre: 'Suc', logo: '/logos/series/narcos.jpg', rating: '8.8', seasons: '3 Sezon', episodes: '30 Bolum' }
]

const GENRE_COLORS = {
  Aksiyon: '#E50914',
  Dram: '#7c3aed',
  'Bilim Kurgu': '#2563eb',
  Animasyon: '#db2777',
  Biyografi: '#d97706',
  Korku: '#7c3aed',
  Suc: '#dc2626',
  Fantastik: '#059669',
  Ulusal: '#E50914',
  Spor: '#10b981'
}

const HERO_SHOWCASE = [
  {
    title: 'Canli TV Paketi',
    subtitle: 'Ulusal, spor ve premium yayinlari tek akista yonet.',
    meta: '1000+ kanal',
    route: '/live-tv',
    accent: '#E50914',
    image: '/logos/channels/trtspor.png',
    type: 'live'
  },
  {
    title: 'Film Arsivi',
    subtitle: 'Guncel seckiler ve premium VOD katalogu.',
    meta: 'Yuzlerce film',
    route: '/movies',
    accent: '#7c3aed',
    image: '/logos/movies/topgun.jpg',
    type: 'movie'
  },
  {
    title: 'Dizi Kutuphanesi',
    subtitle: 'Tum sezonlar, premium platform hissiyle siralanir.',
    meta: 'Tum sezonlar',
    route: '/series',
    accent: '#2563eb',
    image: '/logos/series/strangerthings.jpg',
    type: 'series'
  }
]

const TRUST_METRICS = [
  { value: '1000+', label: 'Canli kanal' },
  { value: 'HD/4K', label: 'Goruntu kalitesi' },
  { value: 'Anlik', label: 'Hizli gecis' }
]

const HOME_BADGES = [
  { label: 'Premium vitrin', icon: Sparkles },
  { label: 'Kesintisiz akis', icon: Flame },
  { label: 'Hizli erisim', icon: Clock }
]

const QUICK_LINKS = [
  { title: 'Canli TV', subtitle: 'Tum kanallar', to: '/live-tv', icon: Tv, color: PRIMARY },
  { title: 'Filmler', subtitle: 'VOD arsivi', to: '/movies', icon: Film, color: '#7c3aed' },
  { title: 'Diziler', subtitle: 'Tum sezonlar', to: '/series', icon: Clapperboard, color: '#2563eb' }
]

const CATEGORY_TILES = [
  { id: 'live', title: 'Canli TV', icon: Radio, count: '1000+ Kanal', link: '/live-tv', color: PRIMARY },
  { id: 'movies', title: 'Filmler', icon: Film, count: 'Yuzlerce Film', link: '/movies', color: '#7c3aed' },
  { id: 'series', title: 'Diziler', icon: Clapperboard, count: 'Tum Sezonlar', link: '/series', color: '#2563eb' },
  { id: 'sports', title: 'Spor', icon: Trophy, count: 'Canli Maclar', link: '/live-tv', color: '#dc2626' }
]

const TYPE_LABELS = {
  live: 'Canli',
  movie: 'Film',
  series: 'Dizi'
}

const getInitials = (name) => name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
const getGenreColor = (genre) => GENRE_COLORS[genre] || PRIMARY

const SkeletonCard = ({ type }) => (
  <div className="flex-shrink-0 animate-pulse" style={{ width: type === 'live' ? '280px' : '200px', scrollSnapAlign: 'start' }}>
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        aspectRatio: type === 'live' ? '16/9' : '2/3',
        backgroundColor: BG_CARD,
        border: `1px solid ${BORDER}`
      }}
    >
      <div className="w-full h-full bg-white/5" />
    </div>
    <div className="mt-3 space-y-2 px-1">
      <div className="h-4 bg-white/10 rounded w-3/4" />
      <div className="h-3 bg-white/5 rounded w-1/2" />
    </div>
  </div>
)

const FallbackArtwork = ({ item, type, accent }) => (
  <div
    className="absolute inset-0 overflow-hidden"
    style={{
      background: `radial-gradient(circle at top left, ${accent}55 0%, transparent 38%), linear-gradient(145deg, rgba(255,255,255,0.06) 0%, rgba(8,8,8,0.96) 72%)`
    }}
  >
    <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full blur-3xl" style={{ backgroundColor: `${accent}55` }} />
    <div className="absolute left-0 right-0 bottom-0 h-1/2" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, transparent 100%)' }} />
    <div className="relative z-10 h-full flex flex-col justify-between p-5">
      <div className="flex items-start justify-between gap-3">
        <div
          className="px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-[0.18em] text-white/80 border"
          style={{ borderColor: `${accent}55`, backgroundColor: 'rgba(0,0,0,0.28)' }}
        >
          {TYPE_LABELS[type] || 'Icerik'}
        </div>
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl text-white shadow-2xl" style={{ backgroundColor: accent }}>
          {getInitials(item.name)}
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-2xl font-black text-white leading-tight line-clamp-2">{item.name}</div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-white/70">
          <span className="px-2.5 py-1 rounded-full font-semibold" style={{ backgroundColor: `${accent}22`, color: accent }}>
            {item.genre}
          </span>
          {item.year && <span>{item.year}</span>}
          {item.duration && <span>{item.duration}</span>}
          {item.seasons && <span>{item.seasons}</span>}
          {item.viewers && <span>{item.viewers} izleyici</span>}
        </div>
      </div>
    </div>
  </div>
)

const ContentCard = ({ item, type }) => {
  const navigate = useNavigate()
  const [isHovered, setIsHovered] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)

  const accent = getGenreColor(item.genre)
  const isPoster = type !== 'live'
  const width = type === 'live' ? '280px' : '200px'

  const handleClick = () => {
    if (type === 'live') navigate('/live-tv')
    if (type === 'movie') navigate('/movies')
    if (type === 'series') navigate('/series')
  }

  return (
    <div
      className="flex-shrink-0 cursor-pointer group"
      style={{ width, scrollSnapAlign: 'start' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
    >
      <div
        className="relative rounded-[24px] overflow-hidden transition-all duration-300"
        style={{
          transform: isHovered ? 'translateY(-6px)' : 'translateY(0)',
          aspectRatio: type === 'live' ? '16/9' : '2/3',
          backgroundColor: BG_CARD,
          border: `1px solid ${isHovered ? `${accent}66` : BORDER}`,
          boxShadow: isHovered ? `0 28px 60px -32px ${accent}` : '0 12px 32px -24px rgba(0,0,0,0.9)'
        }}
      >
        {!imageLoaded && !imageError && <div className="absolute inset-0 bg-white/5 animate-pulse" />}

        {item.logo && !imageError ? (
          <img
            src={item.logo}
            alt={item.name}
            className={`w-full h-full transition-all duration-500 ${isPoster ? 'object-cover' : 'object-contain p-6'} ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
            loading="lazy"
            decoding="async"
            onLoad={() => setImageLoaded(true)}
            onError={() => {
              setImageError(true)
              setImageLoaded(false)
            }}
          />
        ) : null}

        {(imageError || !item.logo) && <FallbackArtwork item={item} type={type} accent={accent} />}

        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/10" />

        {type === 'live' && item.live && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-600 shadow-lg">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span className="text-xs font-bold text-white tracking-wide">CANLI</span>
          </div>
        )}

        {item.rating && (
          <div className="absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/55 backdrop-blur-sm">
            <Star className="w-3 h-3 text-yellow-500" fill="currentColor" />
            <span className="text-xs font-bold text-white">{item.rating}</span>
          </div>
        )}

        <div className={`absolute inset-x-0 bottom-0 p-4 transition-all duration-300 ${isHovered ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-95'}`}>
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="text-white font-bold text-base line-clamp-2">{item.name}</div>
              <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-white/70">
                <span className="px-2.5 py-1 rounded-full font-semibold" style={{ backgroundColor: `${accent}22`, color: accent }}>
                  {item.genre}
                </span>
                {item.year && <span>{item.year}</span>}
                {item.duration && <span>{item.duration}</span>}
                {item.seasons && <span>{item.seasons}</span>}
                {item.viewers && <span>{item.viewers}</span>}
              </div>
            </div>
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
              style={{ backgroundColor: PRIMARY, boxShadow: '0 0 30px rgba(229,9,20,0.45)' }}
            >
              <Play className="w-5 h-5 text-white ml-0.5" fill="currentColor" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const ContentRow = ({ title, items, type, viewAllLink, icon: Icon, loading = false }) => {
  const sliderRef = useRef(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)

  const scroll = (direction) => {
    if (!sliderRef.current) return
    const amount = type === 'live' ? 900 : 720
    sliderRef.current.scrollBy({
      left: direction === 'left' ? -amount : amount,
      behavior: 'smooth'
    })
  }

  const handleScroll = () => {
    if (!sliderRef.current) return
    const { scrollLeft, scrollWidth, clientWidth } = sliderRef.current
    setCanScrollLeft(scrollLeft > 0)
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10)
  }

  return (
    <div className="mb-12 group/row">
      <div className="flex items-center justify-between mb-5 px-4 lg:px-12">
        <div className="flex items-center gap-3">
          {Icon && (
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ backgroundColor: `${PRIMARY}18` }}>
              <Icon className="w-5 h-5" style={{ color: PRIMARY }} />
            </div>
          )}
          <div>
            <h2 className="text-xl font-black text-white">{title}</h2>
            <div className="text-sm text-white/45">{items.length} secili icerik</div>
          </div>
        </div>
        <Link to={viewAllLink} className="text-sm font-semibold hover:text-white transition-colors flex items-center gap-1 group/link" style={{ color: PRIMARY }}>
          Tumunu Gor
          <ChevronRight className="w-4 h-4 transform group-hover/link:translate-x-1 transition-transform" />
        </Link>
      </div>

      <div className="relative">
        {canScrollLeft && (
          <button
            onClick={() => scroll('left')}
            className="absolute left-0 top-0 bottom-8 z-20 w-20 flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-all duration-300"
            style={{ background: 'linear-gradient(to right, rgba(10,10,10,1) 0%, rgba(10,10,10,0.8) 50%, transparent 100%)' }}
          >
            <div className="w-12 h-12 rounded-full flex items-center justify-center transition-transform hover:scale-110" style={{ backgroundColor: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)' }}>
              <ChevronLeft className="w-6 h-6 text-white" />
            </div>
          </button>
        )}

        <div
          ref={sliderRef}
          onScroll={handleScroll}
          className="flex gap-5 overflow-x-auto px-4 lg:px-12 pb-6 hide-scrollbar"
          style={{ scrollSnapType: 'x mandatory' }}
        >
          {loading
            ? [...Array(6)].map((_, index) => <SkeletonCard key={index} type={type} />)
            : items.map((item, index) => <ContentCard key={`${item.name}-${index}`} item={item} type={type} />)}
        </div>

        {canScrollRight && (
          <button
            onClick={() => scroll('right')}
            className="absolute right-0 top-0 bottom-8 z-20 w-20 flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-all duration-300"
            style={{ background: 'linear-gradient(to left, rgba(10,10,10,1) 0%, rgba(10,10,10,0.8) 50%, transparent 100%)' }}
          >
            <div className="w-12 h-12 rounded-full flex items-center justify-center transition-transform hover:scale-110" style={{ backgroundColor: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)' }}>
              <ChevronRight className="w-6 h-6 text-white" />
            </div>
          </button>
        )}
      </div>
    </div>
  )
}

const ShowcaseCard = ({ item, compact = false }) => (
  <Link
    to={item.route}
    className="group relative block h-full rounded-[28px] overflow-hidden border transition-all duration-300 hover:-translate-y-1"
    style={{
      backgroundColor: 'rgba(255,255,255,0.03)',
      borderColor: `${item.accent}40`,
      boxShadow: `0 24px 60px -28px ${item.accent}55`
    }}
  >
    {item.image ? (
      <img
        src={item.image}
        alt={item.title}
        className={`w-full h-full transition-transform duration-500 group-hover:scale-105 ${compact ? 'object-cover' : 'object-cover'}`}
        loading="lazy"
      />
    ) : null}
    <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.82) 100%)' }} />
    <div className="absolute inset-0 p-5 flex flex-col justify-between">
      <div className="flex items-center justify-between gap-3">
        <span
          className="px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-[0.18em] text-white/80 border"
          style={{ borderColor: `${item.accent}55`, backgroundColor: 'rgba(0,0,0,0.35)' }}
        >
          {TYPE_LABELS[item.type]}
        </span>
        <span className="text-xs text-white/70">{item.meta}</span>
      </div>
      <div>
        <h3 className={`${compact ? 'text-xl' : 'text-2xl'} font-black text-white mb-2`}>{item.title}</h3>
        <p className="text-sm text-white/72 leading-relaxed max-w-sm">{item.subtitle}</p>
      </div>
    </div>
  </Link>
)

function HomePage() {
  const { user, token } = useAuthStore()
  const navigate = useNavigate()
  const [isLoading] = useState(false)
  const [showPurchaseModal, setShowPurchaseModal] = useState(false)

  useEffect(() => {
    if (!user) return
    const hasSubscription = user.expiresAt && new Date(user.expiresAt) > new Date()
    setShowPurchaseModal(!hasSubscription)
  }, [user])

  useEffect(() => {
    if (!user?.code || !token || !(user?.hasM3U ?? user?.m3uUrl)) {
      return
    }

    const warmPlaylist = () => {
      fetchUserPlaylist(user, token).catch(() => {})
    }

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(warmPlaylist, { timeout: 1500 })
      return () => window.cancelIdleCallback(idleId)
    }

    const timer = setTimeout(warmPlaylist, 300)
    return () => clearTimeout(timer)
  }, [user, token])

  return (
    <div style={{ backgroundColor: BG_DARK, minHeight: '100vh' }}>
      <section className="relative overflow-hidden px-4 pt-8 pb-8 lg:px-12 lg:pt-10">
        <div className="absolute inset-0">
          <div
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(circle at top left, rgba(229,9,20,0.28) 0%, transparent 30%), radial-gradient(circle at 80% 20%, rgba(37,99,235,0.18) 0%, transparent 28%), linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(10,10,10,0) 32%, rgba(10,10,10,1) 100%)'
            }}
          />
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
              backgroundSize: '42px 42px'
            }}
          />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto">
          <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] items-stretch">
            <div
              className="rounded-[32px] p-7 md:p-9 border backdrop-blur-xl"
              style={{
                background: 'linear-gradient(145deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 100%)',
                borderColor: 'rgba(255,255,255,0.08)',
                boxShadow: '0 24px 80px -40px rgba(0,0,0,0.9)'
              }}
            >
              <div className="flex flex-wrap items-center gap-3 mb-5">
                {HOME_BADGES.map((badge) => (
                  <div
                    key={badge.label}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-white/85 border"
                    style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.08)' }}
                  >
                    <badge.icon className="w-4 h-4" style={{ color: PRIMARY }} />
                    {badge.label}
                  </div>
                ))}
              </div>

              <div className="mb-3 text-sm uppercase tracking-[0.32em] text-white/45 font-bold">
                Flixify V4 Arayuzu
              </div>

              <h1 className="text-4xl md:text-6xl font-black text-white mb-5 leading-[0.95] max-w-3xl">
                Afiş olmasa bile ucuz gormeyen bir vitrin.
              </h1>

              <p className="text-base md:text-lg text-white/74 mb-8 leading-relaxed max-w-2xl">
                Giris sonrasi deneyim artik bos kutular ve kotu fallback yerine premium kartlar,
                guclu bolum ayrimlari ve daha guven veren bir katalog diliyle sunuluyor.
              </p>

              <div className="flex flex-wrap items-center gap-4 mb-8">
                <button
                  onClick={() => navigate('/live-tv')}
                  className="flex items-center gap-2 px-8 py-4 rounded-2xl font-bold text-lg transition-all hover:scale-105 hover:shadow-lg"
                  style={{ backgroundColor: PRIMARY, color: 'white', boxShadow: '0 10px 30px rgba(229,9,20,0.4)' }}
                >
                  <Play className="w-5 h-5" fill="white" />
                  Canli TV'ye Git
                </button>

                <button
                  onClick={() => navigate('/movies')}
                  className="flex items-center gap-2 px-8 py-4 rounded-2xl font-bold text-lg text-white transition-all hover:scale-105 hover:bg-white/20"
                  style={{ backgroundColor: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)' }}
                >
                  <Info className="w-5 h-5" />
                  Katalogu Kesfet
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {TRUST_METRICS.map((metric) => (
                  <div
                    key={metric.label}
                    className="rounded-2xl p-4 border"
                    style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.06)' }}
                  >
                    <div className="text-2xl font-black text-white">{metric.value}</div>
                    <div className="text-sm text-white/55 mt-1">{metric.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
              <div className="min-h-[260px]">
                <ShowcaseCard item={HERO_SHOWCASE[0]} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="min-h-[210px]">
                  <ShowcaseCard item={HERO_SHOWCASE[1]} compact />
                </div>
                <div className="min-h-[210px]">
                  <ShowcaseCard item={HERO_SHOWCASE[2]} compact />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-20 pt-6 pb-12">
        <ContentRow title="Canli TV Seckisi" items={POPULAR_CHANNELS} type="live" viewAllLink="/live-tv" icon={Radio} loading={isLoading} />
        <ContentRow title="One Cikan Filmler" items={POPULAR_MOVIES} type="movie" viewAllLink="/movies" icon={Film} loading={isLoading} />
        <ContentRow title="Dizi Seckisi" items={POPULAR_SERIES} type="series" viewAllLink="/series" icon={Clapperboard} loading={isLoading} />
      </section>

      <section className="py-16" style={{ backgroundColor: BG_SURFACE }}>
        <div className="max-w-7xl mx-auto px-4 lg:px-12">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${PRIMARY}20` }}>
              <Star className="w-5 h-5" style={{ color: PRIMARY }} />
            </div>
            <h2 className="text-2xl font-bold text-white">Kategoriler</h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {CATEGORY_TILES.map((cat) => (
              <Link
                key={cat.id}
                to={cat.link}
                className="group relative h-36 rounded-2xl overflow-hidden transition-all duration-300 hover:scale-105"
                style={{ backgroundColor: BG_CARD, border: `1px solid ${BORDER}` }}
              >
                <div className="absolute inset-0 opacity-30 group-hover:opacity-50 transition-opacity" style={{ background: `linear-gradient(135deg, ${cat.color} 0%, transparent 70%)` }} />
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: `radial-gradient(circle at 50% 50%, ${cat.color}30 0%, transparent 70%)` }} />
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

      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 lg:px-12">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${PRIMARY}20` }}>
              <Clock className="w-5 h-5" style={{ color: PRIMARY }} />
            </div>
            <h2 className="text-2xl font-bold text-white">Hizli Erisim</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {QUICK_LINKS.map((link) => (
              <Link
                key={link.title}
                to={link.to}
                className="flex items-center gap-5 p-6 rounded-2xl transition-all hover:scale-[1.02] group"
                style={{ backgroundColor: BG_CARD, border: `1px solid ${BORDER}` }}
              >
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110" style={{ backgroundColor: link.color }}>
                  <link.icon className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-1">{link.title}</h3>
                  <p className="text-sm text-white/50">{link.subtitle}</p>
                </div>
                <ChevronRight className="w-6 h-6 text-white/30 ml-auto group-hover:text-white transition-colors" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <div className="h-20" />

      {user && showPurchaseModal && !hasValidSubscription(user) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.95)' }}>
          <div className="w-full max-w-md rounded-3xl p-8 text-center" style={{ backgroundColor: BG_SURFACE, border: `2px solid ${PRIMARY}` }}>
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{ backgroundColor: `${PRIMARY}20` }}>
              <Sparkles className="w-8 h-8" style={{ color: PRIMARY }} />
            </div>

            <h2 className="text-xl font-bold text-white mb-2">Henuz aktif degilsiniz</h2>
            <p className="text-gray-400 text-sm mb-6">
              Sinirsiz icerige erismek icin paketinizi aktif edin veya destek ekibiyle iletisime gecin.
            </p>

            <div className="flex gap-3 mb-3">
              <button
                onClick={() => window.open('https://wa.me/905xxxxxxxxx', '_blank')}
                className="flex-1 py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all hover:opacity-90"
                style={{ backgroundColor: '#25d366', color: '#fff' }}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                Iletisime Gec
              </button>

              <button
                onClick={() => navigate('/profil/paketler')}
                className="flex-1 py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all hover:opacity-90"
                style={{ backgroundColor: PRIMARY, color: '#fff' }}
              >
                <Sparkles className="w-4 h-4" />
                Paket Satin Al
              </button>
            </div>

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
