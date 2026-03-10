import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { 
  Play, Plus, Info, Search, X, Star, TrendingUp, 
  ChevronLeft, ChevronRight, Film
} from 'lucide-react'
import { fetchMoviesCatalog, hasValidSubscription } from '../services/playlist'

const PRIMARY = '#E50914'
const BG_DARK = '#0a0a0a'
const BG_SURFACE = '#141414'
const BG_CARD = '#1a1a1a'
const BORDER = '#2a2a2a'
const POSTER_FAILURE_RATIO_THRESHOLD = 0.25
const POSTER_FAILURE_MIN_SAMPLE = 24

// Genres with color coding
const GENRES = [
  { id: 'all', name: 'Tumu', color: '#E50914', icon: '*' },
  { id: 'Netflix', name: 'Netflix', color: '#E50914', icon: 'NF' },
  { id: 'Dram & Romantik', name: 'Dram & Romantik', color: '#e91e63', icon: 'DR' },
  { id: 'Aksiyon & Macera', name: 'Aksiyon & Macera', color: '#ff5722', icon: 'AK' },
  { id: 'Komedi', name: 'Komedi', color: '#ffeb3b', icon: 'KM' },
  { id: 'Korku & Gerilim', name: 'Korku & Gerilim', color: '#9c27b0', icon: 'KG' },
  { id: 'Animasyon & Cizgi Film', name: 'Animasyon', color: '#00bcd4', icon: 'AN' },
  { id: 'Bilim Kurgu & Fantastik', name: 'Bilim Kurgu', color: '#3f51b5', icon: 'BK' },
  { id: 'Yerli Filmler', name: 'Yerli Filmler', color: '#4caf50', icon: 'YR' },
  { id: '4K / UHD Filmler', name: '4K / UHD', color: '#2196f3', icon: '4K' },
  { id: 'Belgesel & Biyografi', name: 'Belgesel', color: '#795548', icon: 'BG' },
  { id: 'Suc & Polisiye', name: 'Suc', color: '#607d8b', icon: 'SP' },
]

const MOVIE_POSTERS = {
  'Dram & Romantik': 'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=500&h=750&fit=crop',
  'Aksiyon & Macera': 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=500&h=750&fit=crop',
  Komedi: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&h=750&fit=crop',
  'Korku & Gerilim': 'https://images.unsplash.com/photo-1509248961158-e54f6934749c?w=500&h=750&fit=crop',
  'Animasyon & Cizgi Film': 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=500&h=750&fit=crop',
  'Bilim Kurgu & Fantastik': 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=500&h=750&fit=crop',
  'Yerli Filmler': 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500&h=750&fit=crop',
  '4K / UHD Filmler': 'https://images.unsplash.com/photo-1535016120720-40c646be5580?w=500&h=750&fit=crop',
  default: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500&h=750&fit=crop'
}

const getMovieDefaultPoster = (genre) => MOVIE_POSTERS[genre] || MOVIE_POSTERS.default

const collectMoviePosterCandidates = (movie) => {
  const candidates = []
  const seen = new Set()

  const push = (value) => {
    if (!value || typeof value !== 'string') {
      return
    }

    const normalized = value.trim()
    if (!normalized || seen.has(normalized)) {
      return
    }

    seen.add(normalized)
    candidates.push(normalized)
  }

  push(movie?.logo)
  if (Array.isArray(movie?.logoCandidates)) {
    movie.logoCandidates.forEach(push)
  }

  return candidates
}

const toAsciiLower = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()

const normalizeMovieGenreId = (genre) => {
  const value = String(genre || '')
  const lowered = toAsciiLower(value)

  if (lowered.includes('animasyon') && lowered.includes('cizgi')) {
    return 'Animasyon & Cizgi Film'
  }

  if (lowered.includes('suc')) {
    return 'Suc & Polisiye'
  }

  return value
}

const getMovieTurkishPriority = (movie) => {
  const title = toAsciiLower(movie?.title)
  const genre = toAsciiLower(movie?.genre)
  const text = `${title} ${genre}`

  let score = 0

  if (genre.includes('yerli')) {
    score += 6
  }

  if (genre.includes('suc') || genre.includes('polisiye')) {
    score += 2
  }

  if (/\b(tr|turk|turkiye|turkce|dublaj)\b/.test(text)) {
    score += 3
  }

  return score
}

const sortMoviesWithTurkishPriority = (items = []) => {
  return [...items].sort((left, right) => {
    const scoreDiff = getMovieTurkishPriority(right) - getMovieTurkishPriority(left)
    if (scoreDiff !== 0) {
      return scoreDiff
    }

    return String(left?.title || '').localeCompare(String(right?.title || ''), 'tr')
  })
}

// Movie Card - Modern
const MovieCard = ({ movie, onClick, onPosterStatus }) => {
  const [isHovered, setIsHovered] = useState(false)
  const [posterIndex, setPosterIndex] = useState(0)
  const posterReportedRef = useRef(false)

  const extractYear = (title) => {
    const match = title.match(/\((\d{4})\)/)
    return match ? match[1] : ''
  }

  const cleanTitle = movie.title.replace(/\s*\(\d{4}\)\s*$/, '')
  const year = extractYear(movie.title)
  const genre = GENRES.find(g => g.id === movie.genre) || GENRES[0]
  const posterCandidates = useMemo(() => collectMoviePosterCandidates(movie), [movie])
  const providerPosterUrl = posterCandidates[posterIndex] || ''
  const usingFallbackPoster = !providerPosterUrl
  const posterUrl = providerPosterUrl || getMovieDefaultPoster(movie.genre)

  useEffect(() => {
    setPosterIndex(0)
    posterReportedRef.current = false
  }, [movie.id, movie.title, movie.logo, movie.genre, posterCandidates.length])

  const reportPosterResult = useCallback((success) => {
    if (posterReportedRef.current) {
      return
    }

    posterReportedRef.current = true
    onPosterStatus?.(movie.title, success)
  }, [movie.title, onPosterStatus])

  const handlePosterError = useCallback(() => {
    if (!usingFallbackPoster && posterIndex < posterCandidates.length - 1) {
      setPosterIndex((current) => current + 1)
      return
    }

    setPosterIndex(posterCandidates.length)
    reportPosterResult(false)
  }, [posterCandidates.length, posterIndex, reportPosterResult, usingFallbackPoster])

  const handlePosterLoad = useCallback(() => {
    reportPosterResult(!usingFallbackPoster)
  }, [reportPosterResult, usingFallbackPoster])

  return (
    <div
      className="relative cursor-pointer transition-all duration-300"
      style={{ transform: isHovered ? 'scale(1.05)' : 'scale(1)', zIndex: isHovered ? 10 : 1 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onClick(movie)}
    >
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          backgroundColor: BG_CARD,
          border: `2px solid ${isHovered ? genre.color : BORDER}`,
          boxShadow: isHovered ? `0 20px 40px rgba(0,0,0,0.5), 0 0 30px ${genre.color}30` : 'none'
        }}
      >
        <div className="relative aspect-[2/3]">
          <img
            src={posterUrl}
            alt={cleanTitle}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={handlePosterError}
            onLoad={handlePosterLoad}
          />

          {/* Tur Badge */}
          <div
            className="absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-bold"
            style={{ backgroundColor: genre.color, color: 'white' }}
          >
            {genre.name}
          </div>

          {/* Yil Badge */}
          {year && (
            <div
              className="absolute top-3 right-3 px-2 py-1 rounded-lg text-xs font-bold bg-black/60 text-white"
            >
              {year}
            </div>
          )}

          {/* Hover Overlay */}
          {isHovered && (
            <div
              className="absolute inset-0 flex flex-col justify-end p-4"
              style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.5) 50%, transparent 100%)' }}
            >
              <h4 className="text-white font-bold text-lg mb-2 line-clamp-2">{cleanTitle}</h4>

              <div className="flex items-center gap-3 text-sm text-white/70 mb-3">
                <span className="flex items-center gap-1">
                  <Star className="w-4 h-4 text-yellow-500" fill="currentColor" />
                  8.7
                </span>
                {year && <span>{year}</span>}
                <span>HD</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  className="flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2"
                  style={{ backgroundColor: PRIMARY, color: 'white' }}
                  onClick={(e) => { e.stopPropagation(); onClick(movie); }}
                >
                  <Play className="w-4 h-4" fill="currentColor" />
                  Izle
                </button>
                <button
                  className="p-2.5 rounded-xl"
                  style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
                >
                  <Plus className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
// Movie Row - Yatay kaydirma
const MovieRow = ({ title, movies, onMovieClick, onPosterStatus }) => {
  const sliderRef = useRef(null)
  const [showLeft, setShowLeft] = useState(false)
  const [showRight, setShowRight] = useState(true)

  if (!movies || movies.length === 0) return null

  const scroll = (dir) => {
    if (sliderRef.current) {
      sliderRef.current.scrollBy({ left: dir === 'left' ? -1000 : 1000, behavior: 'smooth' })
    }
  }

  const handleScroll = (e) => {
    const { scrollLeft, scrollWidth, clientWidth } = e.target
    setShowLeft(scrollLeft > 10)
    setShowRight(scrollLeft < scrollWidth - clientWidth - 10)
  }

  return (
    <div className="mb-10">
      <h2 className="text-xl font-black text-white mb-4 flex items-center gap-2">
        {title}
        <span className="text-sm font-normal text-white/50">({movies.length})</span>
      </h2>
      
      <div className="relative group">
        {showLeft && (
          <button 
            onClick={() => scroll('left')}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(10px)' }}
          >
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>
        )}
        
        <div 
          ref={sliderRef}
          className="flex gap-4 overflow-x-auto hide-scrollbar pb-4"
          onScroll={handleScroll}
          style={{ scrollSnapType: 'x mandatory' }}
        >
          {movies.map((movie, index) => (
            <div key={`${movie.id}-${index}`} style={{ scrollSnapAlign: 'start', minWidth: '200px' }}>
              <MovieCard movie={movie} onClick={onMovieClick} onPosterStatus={onPosterStatus} />
            </div>
          ))}
        </div>
        
        {showRight && (
          <button 
            onClick={() => scroll('right')}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(10px)' }}
          >
            <ChevronRight className="w-6 h-6 text-white" />
          </button>
        )}
      </div>
    </div>
  )
}

// Hero Section - Sinematik
const HeroSection = ({ movie, onPlay }) => {
  if (!movie) return null
  
  const cleanTitle = movie.title.replace(/\s*\(\d{4}\)\s*$/, '')
  const year = movie.title.match(/\((\d{4})\)/)?.[1] || ''
  const genre = GENRES.find(g => g.id === movie.genre) || GENRES[0]
  
  const getBackdrop = (movieItem) => {
    const providerBackdrop = collectMoviePosterCandidates(movieItem)[0]
    return providerBackdrop || getMovieDefaultPoster(movieItem?.genre)
  }
  
  return (
    <div 
      className="relative rounded-3xl overflow-hidden mb-10"
      style={{ 
        backgroundImage: `linear-gradient(to right, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.4) 50%, transparent 100%), url(${getBackdrop(movie)})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        minHeight: '500px'
      }}
    >
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, #0a0a0a 0%, transparent 50%)' }} />
      
      <div className="relative p-8 md:p-12 flex flex-col justify-end h-full min-h-[500px]">
        <div 
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full w-fit mb-4"
          style={{ backgroundColor: genre.color }}
        >
          <span className="text-lg">{genre.icon}</span>
          <span className="font-bold text-white">{genre.name}</span>
          {year && <span className="text-white/80 ml-2">| {year}</span>}
        </div>
        
        <h1 className="text-5xl md:text-6xl font-black text-white mb-4 max-w-2xl">
          {cleanTitle}
        </h1>
        
        <div className="flex items-center gap-4 text-white/80 mb-6">
          <span className="flex items-center gap-1 text-green-400 font-bold">
            <TrendingUp className="w-5 h-5" />
            Populer
          </span>
          {year && <span>{year}</span>}
          <span className="px-2 py-0.5 rounded bg-white/20 text-sm">HD</span>
          <span className="px-2 py-0.5 rounded bg-white/20 text-sm">5.1</span>
        </div>
        
        <p className="text-white/70 text-lg mb-8 max-w-xl">
          Film izlemek icin tiklayin. VOD arsivinden yuksek kalitede sunulmaktadir.
        </p>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={() => onPlay(movie)}
            className="px-8 py-4 rounded-2xl font-bold text-lg flex items-center gap-3 transition-transform hover:scale-105"
            style={{ backgroundColor: PRIMARY, color: 'white' }}
          >
            <Play className="w-6 h-6" fill="currentColor" />
            Simdi Izle
          </button>
          <button 
            className="px-8 py-4 rounded-2xl font-bold text-lg flex items-center gap-3 text-white transition-transform hover:scale-105"
            style={{ backgroundColor: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(10px)' }}
          >
            <Info className="w-6 h-6" />
            Detaylar
          </button>
        </div>
      </div>
    </div>
  )
}

// Custom hook for debounce
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value)
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)
    
    return () => clearTimeout(timer)
  }, [value, delay])
  
  return debouncedValue
}

function MoviesPage() {
  const navigate = useNavigate()
  const { user, token } = useAuthStore()
  
  // Redirect to package purchase if no subscription
  useEffect(() => {
    if (user && !hasValidSubscription(user)) {
      navigate('/profil/paketler', { 
        state: { 
          message: 'Filmleri izlemek icin aktif bir paket satin almalisiniz.'
        } 
      })
    }
  }, [user, navigate])
  
  const [movies, setMovies] = useState([])
  const [heroMovie, setHeroMovie] = useState(null)
  const [activeGenre, setActiveGenre] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  
  // Debounce search query - 300ms gecikme
  const debouncedSearchQuery = useDebounce(searchQuery, 300)
  const posterStatusRef = useRef(new Map())
  const forcedPosterRefreshRef = useRef(false)

  const resetPosterTracking = useCallback(() => {
    posterStatusRef.current = new Map()
  }, [])

  const fetchMovies = useCallback(async ({ forceRefresh = false } = {}) => {
    try {
      setLoading(true)
      setError(null)

      if (!user) {
        return
      }

      if (!(user?.hasM3U ?? user?.m3uUrl)) {
        setLoading(false)
        setError('M3U URL bulunamadi. Lutfen yonetici ile iletisime gecin.')
        return
      }
      
      const catalogMovies = await fetchMoviesCatalog(user, token, { forceRefresh })
      const normalizedMovies = catalogMovies.map((movie) => ({
        ...movie,
        genre: normalizeMovieGenreId(movie.genre)
      }))
      const sortedMovies = sortMoviesWithTurkishPriority(normalizedMovies)

      if (sortedMovies.length === 0) {
        throw new Error('Katalogda gosterilecek film kaydi bulunamadi.')
      }

      setMovies(sortedMovies)

      const featuredMovie = sortedMovies.find((item) => getMovieTurkishPriority(item) > 0) ||
                           sortedMovies.find(m => m.genre.includes('Netflix')) || 
                           sortedMovies.find(m => m.genre.includes('4K')) || 
                           sortedMovies[0]
      setHeroMovie(featuredMovie)
      resetPosterTracking()

      setLoading(false)
    } catch (err) {
      console.error('Movies catalog fetch error:', err)
      setError('Filmler yuklenirken hata olustu: ' + err.message)
      setLoading(false)
    }
  }, [resetPosterTracking, token, user])

  const handlePosterStatus = useCallback((movieTitle, success) => {
    if (!movieTitle || forcedPosterRefreshRef.current) {
      return
    }

    const map = posterStatusRef.current
    if (map.has(movieTitle)) {
      return
    }

    map.set(movieTitle, Boolean(success))

    if (map.size < POSTER_FAILURE_MIN_SAMPLE) {
      return
    }

    const failures = Array.from(map.values()).filter((value) => !value).length
    const failureRatio = failures / map.size

    if (failureRatio >= POSTER_FAILURE_RATIO_THRESHOLD) {
      forcedPosterRefreshRef.current = true
      fetchMovies({ forceRefresh: true }).catch(() => {})
    }
  }, [fetchMovies])

  useEffect(() => {
    forcedPosterRefreshRef.current = false
    resetPosterTracking()
    fetchMovies()
  }, [fetchMovies, resetPosterTracking])

  // Memoized filtered movies - sadece debounced query veya tur degistiginde calisir
  const filteredMovies = useMemo(() => {
    let result = movies
    
    // Once tur filtresi uygula
    if (activeGenre !== 'all') {
      result = result.filter(m => m.genre === activeGenre)
    }
    
    // Sonra arama filtresi uygula (debounced)
    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.toLowerCase()
      result = result.filter(m => m.title.toLowerCase().includes(query))
    }
    
    return result
  }, [movies, activeGenre, debouncedSearchQuery])
  
  // Tur bazli filtrelenmis filmler (hero ve satirlar icin)
  const moviesByGenre = useMemo(() => {
    const map = {}
    GENRES.forEach(g => {
      if (g.id !== 'all') {
        map[g.id] = movies.filter(m => m.genre === g.id)
      }
    })
    return map
  }, [movies])

  const handleMovieClick = (movie) => {
    navigate(`/player?type=movie&url=${encodeURIComponent(movie.url)}&title=${encodeURIComponent(movie.title)}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: BG_DARK }}>
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-4" style={{ borderColor: PRIMARY }} />
          <p className="text-white text-lg">Filmler Yukleniyor...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: BG_DARK }}>
        <div className="text-center">
          <p className="text-white mb-4">{error}</p>
          <button 
            onClick={() => fetchMovies({ forceRefresh: true })}
            className="px-6 py-3 rounded-xl font-bold text-white"
            style={{ backgroundColor: PRIMARY }}
          >
            Tekrar Dene
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-20" style={{ backgroundColor: BG_DARK }}>
      {/* Header - Gradient Background */}
      <header className="relative overflow-hidden">
        <div 
          className="absolute inset-0"
          style={{ 
            background: 'linear-gradient(135deg, rgba(229,9,20,0.2) 0%, rgba(10,10,10,0) 50%, rgba(229,9,20,0.1) 100%)'
          }}
        />
        
        <div className="relative max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div 
                className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ backgroundColor: PRIMARY }}
              >
                <Film className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-white">Filmler</h1>
                <p className="text-sm text-white/50">Tum sinema arsivi</p>
              </div>
            </div>
            
            {/* Search */}
            <div className="flex-1 max-w-md ml-8">
              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40 group-focus-within:text-white transition-colors" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Film ara..."
                  className="w-full pl-12 pr-4 py-3.5 rounded-2xl text-white placeholder-white/40 focus:outline-none transition-all"
                  style={{ 
                    backgroundColor: BG_SURFACE, 
                    border: `2px solid ${searchQuery ? PRIMARY : BORDER}`,
                  }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full hover:bg-white/10"
                  >
                    <X className="w-4 h-4 text-white/60" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Genre Filters */}
          <div className="flex items-center gap-3 overflow-x-auto pb-2 hide-scrollbar">
            {GENRES.map(genre => (
              <button
                key={genre.id}
                onClick={() => setActiveGenre(genre.id)}
                className="flex items-center gap-2.5 px-5 py-3 rounded-2xl whitespace-nowrap transition-all hover:scale-105"
                style={{
                  backgroundColor: activeGenre === genre.id ? genre.color : BG_SURFACE,
                  color: 'white',
                  border: `2px solid ${activeGenre === genre.id ? genre.color : BORDER}`,
                  boxShadow: activeGenre === genre.id ? `0 4px 20px ${genre.color}40` : 'none'
                }}
              >
                <span className="text-xl">{genre.icon}</span>
                <span className="font-bold">{genre.name}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Hero */}
        {!searchQuery && activeGenre === 'all' && (
          <HeroSection movie={heroMovie} onPlay={handleMovieClick} />
        )}

        {/* Movie Rows */}
        {activeGenre === 'all' && !searchQuery && (
          <>
            <MovieRow title="Yerli Filmler" movies={moviesByGenre['Yerli Filmler'] || []} onMovieClick={handleMovieClick} onPosterStatus={handlePosterStatus} />
            <MovieRow title="Netflix Yapimlari" movies={moviesByGenre['Netflix'] || []} onMovieClick={handleMovieClick} onPosterStatus={handlePosterStatus} />
            <MovieRow title="4K / UHD Filmler" movies={moviesByGenre['4K / UHD Filmler'] || []} onMovieClick={handleMovieClick} onPosterStatus={handlePosterStatus} />
            <MovieRow title="Dram & Romantik" movies={moviesByGenre['Dram & Romantik'] || []} onMovieClick={handleMovieClick} onPosterStatus={handlePosterStatus} />
            <MovieRow title="Aksiyon & Macera" movies={moviesByGenre['Aksiyon & Macera'] || []} onMovieClick={handleMovieClick} onPosterStatus={handlePosterStatus} />
            <MovieRow title="Komedi" movies={moviesByGenre['Komedi'] || []} onMovieClick={handleMovieClick} onPosterStatus={handlePosterStatus} />
            <MovieRow title="Korku & Gerilim" movies={moviesByGenre['Korku & Gerilim'] || []} onMovieClick={handleMovieClick} onPosterStatus={handlePosterStatus} />
            <MovieRow title="Animasyon" movies={moviesByGenre['Animasyon & Cizgi Film'] || []} onMovieClick={handleMovieClick} onPosterStatus={handlePosterStatus} />
          </>
        )}
        
        {/* Grid View for Category */}
        {(activeGenre !== 'all' || debouncedSearchQuery) && (
          <div>
            <h2 className="text-2xl font-black text-white mb-6">
              {debouncedSearchQuery ? `Arama: "${debouncedSearchQuery}"` : GENRES.find(g => g.id === activeGenre)?.name}
              <span className="text-lg font-normal text-white/50 ml-2">({filteredMovies.length})</span>
            </h2>
            {filteredMovies.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-white/50 text-lg">Sonuc bulunamadi</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {filteredMovies.map((movie, index) => (
                  <MovieCard key={`${movie.id}-${index}`} movie={movie} onClick={handleMovieClick} onPosterStatus={handlePosterStatus} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default MoviesPage


