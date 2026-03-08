import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { 
  Play, Plus, Info, Search, X, Star, TrendingUp, 
  ChevronLeft, ChevronRight, Film
} from 'lucide-react'
import { fetchUserPlaylist, hasValidSubscription } from '../services/playlist'

const PRIMARY = '#E50914'
const BG_DARK = '#0a0a0a'
const BG_SURFACE = '#141414'
const BG_CARD = '#1a1a1a'
const BORDER = '#2a2a2a'

// Turler - Renk kodlari ile
const GENRES = [
  { id: 'all', name: 'Tumu', color: '#E50914', icon: '✨' },
  { id: 'Netflix', name: 'Netflix', color: '#E50914', icon: '🎬' },
  { id: 'Dram & Romantik', name: 'Dram & Romantik', color: '#e91e63', icon: '💕' },
  { id: 'Aksiyon & Macera', name: 'Aksiyon & Macera', color: '#ff5722', icon: '💥' },
  { id: 'Komedi', name: 'Komedi', color: '#ffeb3b', icon: '😄' },
  { id: 'Korku & Gerilim', name: 'Korku & Gerilim', color: '#9c27b0', icon: '👻' },
  { id: 'Animasyon & Çizgi Film', name: 'Animasyon', color: '#00bcd4', icon: '🎨' },
  { id: 'Bilim Kurgu & Fantastik', name: 'Bilim Kurgu', color: '#3f51b5', icon: '🚀' },
  { id: 'Yerli Filmler', name: 'Yerli Filmler', color: '#4caf50', icon: '🌟' },
  { id: '4K / UHD Filmler', name: '4K / UHD', color: '#2196f3', icon: '💎' },
  { id: 'Belgesel & Biyografi', name: 'Belgesel', color: '#795548', icon: '📚' },
  { id: 'Suç & Polisiye', name: 'Suc', color: '#607d8b', icon: '🔍' },
]

// Parse M3U and extract VOD movies
const parseMoviesFromM3U = (content) => {
  const lines = content.split('\n')
  const movies = []
  let current = null

  for (const line of lines) {
    const t = line.trim()
    if (t.startsWith('#EXTINF:')) {
      const nameMatch = t.match(/tvg-name="([^"]+)"/)
      const logoMatch = t.match(/tvg-logo="([^"]+)"/)
      const groupMatch = t.match(/group-title="([^"]+)"/)
      const commaIdx = t.lastIndexOf(',')
      const title = commaIdx > -1 ? t.substring(commaIdx + 1).trim() : nameMatch?.[1] || 'Unknown'
      
      let genre = groupMatch?.[1] || 'Diger'
      genre = genre.replace('TR:', '').replace('TR | ', '').trim()
      
      current = { 
        title, 
        logo: logoMatch?.[1] || '', 
        genre,
        id: Math.random().toString(36).substr(2, 9)
      }
    } else if (t && !t.startsWith('#') && current) {
      if (t.includes('/movie/') || t.match(/\.(mkv|mp4|avi|mov)$/i)) {
        current.url = t
        if (!current.genre.toLowerCase().includes('xxx') && !current.genre.toLowerCase().includes('adult')) {
          movies.push(current)
        }
      }
      current = null
    }
  }
  return movies
}

// Remove duplicate movies
const removeDuplicates = (movies) => {
  const seen = new Set()
  return movies.filter(movie => {
    const key = movie.title.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// Movie Card - Modern
const MovieCard = ({ movie, onClick }) => {
  const [isHovered, setIsHovered] = useState(false)
  const [imageError, setImageError] = useState(false)
  
  const extractYear = (title) => {
    const match = title.match(/\((\d{4})\)/)
    return match ? match[1] : ''
  }

  const cleanTitle = movie.title.replace(/\s*\(\d{4}\)\s*$/, '')
  const year = extractYear(movie.title)
  const genre = GENRES.find(g => g.id === movie.genre) || GENRES[0]
  
  const getDefaultPoster = (genreId) => {
    const images = {
      'Dram & Romantik': 'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=500&h=750&fit=crop',
      'Aksiyon & Macera': 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=500&h=750&fit=crop',
      'Komedi': 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&h=750&fit=crop',
      'Korku & Gerilim': 'https://images.unsplash.com/photo-1509248961158-e54f6934749c?w=500&h=750&fit=crop',
      'Animasyon & Çizgi Film': 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=500&h=750&fit=crop',
      'Bilim Kurgu & Fantastik': 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=500&h=750&fit=crop',
      'Yerli Filmler': 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500&h=750&fit=crop',
      '4K / UHD Filmler': 'https://images.unsplash.com/photo-1535016120720-40c646be5580?w=500&h=750&fit=crop',
      'default': 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500&h=750&fit=crop'
    }
    return images[genreId] || images['default']
  }

  const posterUrl = imageError || !movie.logo ? getDefaultPoster(movie.genre) : movie.logo
  
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
            onError={() => setImageError(true)}
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
const MovieRow = ({ title, movies, onMovieClick }) => {
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
              <MovieCard movie={movie} onClick={onMovieClick} />
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
  
  const getBackdrop = (genreId) => {
    const images = {
      'Dram & Romantik': 'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=1920&h=1080&fit=crop',
      'Aksiyon & Macera': 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=1920&h=1080&fit=crop',
      'Komedi': 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1920&h=1080&fit=crop',
      'Korku & Gerilim': 'https://images.unsplash.com/photo-1509248961158-e54f6934749c?w=1920&h=1080&fit=crop',
      'default': 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1920&h=1080&fit=crop'
    }
    return images[genreId] || images['default']
  }
  
  return (
    <div 
      className="relative rounded-3xl overflow-hidden mb-10"
      style={{ 
        backgroundImage: `linear-gradient(to right, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.4) 50%, transparent 100%), url(${getBackdrop(movie.genre)})`,
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
          {year && <span className="text-white/80 ml-2">• {year}</span>}
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
          message: 'Filmleri izlemek için aktif bir paket satın almalısınız.' 
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

  const fetchMovies = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // User yükleniyor, bekle
      if (!user) {
        return // Yükleniyor durumunda kal
      }

      // Kullanıcının kendi M3U URL'sini kullan
      if (!(user?.hasM3U ?? user?.m3uUrl)) {
        setLoading(false)
        setError('M3U URL bulunamadi. Lutfen yonetici ile iletisime gecin.')
        return
      }
      
      const text = await fetchUserPlaylist(user, token)

      if (!text || text.trim().length === 0) {
        throw new Error('M3U playlist bos veya gecersiz icerik')
      }

      let parsedMovies = parseMoviesFromM3U(text)
      parsedMovies = removeDuplicates(parsedMovies)

      setMovies(parsedMovies)

      const featuredMovie = parsedMovies.find(m => m.genre.includes('Netflix')) || 
                           parsedMovies.find(m => m.genre.includes('4K')) || 
                           parsedMovies[0]
      setHeroMovie(featuredMovie)

      setLoading(false)
      return;
      /*
        } else if (response.status === 401) {
          throw new Error('Oturum süresi dolmuş. Lütfen tekrar giriş yapın.')
        } else {
          throw new Error(`M3U yuklenemedi (HTTP ${response.status})`)
        }
      }
      
      const text = await response.text()
      
      // M3U icerigi bos mu kontrol et
      if (!text || text.trim().length === 0) {
        throw new Error('M3U playlist bos veya gecersiz icerik')
      }
      
      let parsedMovies = parseMoviesFromM3U(text)
      parsedMovies = removeDuplicates(parsedMovies)
      
      setMovies(parsedMovies)
      
      const featuredMovie = parsedMovies.find(m => m.genre.includes('Netflix')) || 
                           parsedMovies.find(m => m.genre.includes('4K')) || 
                           parsedMovies[0]
      setHeroMovie(featuredMovie)

      */
      setLoading(false)
    } catch (err) {
      console.error('M3U fetch error:', err)
      setError('Filmler yuklenirken hata olustu: ' + err.message)
      setLoading(false)
    }
  }, [user, token])

  useEffect(() => {
    fetchMovies()
  }, [fetchMovies])

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
            onClick={fetchMovies}
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
            <MovieRow title="Netflix Yapimlari" movies={moviesByGenre['Netflix'] || []} onMovieClick={handleMovieClick} />
            <MovieRow title="4K / UHD Filmler" movies={moviesByGenre['4K / UHD Filmler'] || []} onMovieClick={handleMovieClick} />
            <MovieRow title="Dram & Romantik" movies={moviesByGenre['Dram & Romantik'] || []} onMovieClick={handleMovieClick} />
            <MovieRow title="Aksiyon & Macera" movies={moviesByGenre['Aksiyon & Macera'] || []} onMovieClick={handleMovieClick} />
            <MovieRow title="Komedi" movies={moviesByGenre['Komedi'] || []} onMovieClick={handleMovieClick} />
            <MovieRow title="Korku & Gerilim" movies={moviesByGenre['Korku & Gerilim'] || []} onMovieClick={handleMovieClick} />
            <MovieRow title="Animasyon" movies={moviesByGenre['Animasyon & Çizgi Film'] || []} onMovieClick={handleMovieClick} />
            <MovieRow title="Yerli Filmler" movies={moviesByGenre['Yerli Filmler'] || []} onMovieClick={handleMovieClick} />
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
                  <MovieCard key={`${movie.id}-${index}`} movie={movie} onClick={handleMovieClick} />
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
