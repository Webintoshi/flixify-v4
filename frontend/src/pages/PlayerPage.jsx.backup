import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { 
  Play, Pause, Volume2, VolumeX, Maximize, Search,
  Tv, X, ArrowLeft, SkipBack, SkipForward, AlertCircle,
  Volume1, Volume, Loader2, Radio, Sparkles, RefreshCw
} from 'lucide-react'
import mpegts from 'mpegts.js'

const PRIMARY = '#E50914'
const BG_DARK = '#0a0a0a'
const BG_SURFACE = '#141414'
const BG_CARD = '#1a1a1a'
const BORDER = '#2a2a2a'

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

// M3U Cache Manager - sessionStorage ile sayfa oturumu boyunca cache
class M3UCache {
  static CACHE_KEY = 'iptv_m3u_cache'
  static TTL_MS = 5 * 60 * 1000 // 5 dakika

  static get(userCode) {
    try {
      const cached = sessionStorage.getItem(`${this.CACHE_KEY}_${userCode}`)
      if (!cached) return null
      
      const { data, timestamp } = JSON.parse(cached)
      const age = Date.now() - timestamp
      
      // Cache süresi dolmuşsa temizle
      if (age > this.TTL_MS) {
        sessionStorage.removeItem(`${this.CACHE_KEY}_${userCode}`)
        return null
      }
      
      return { data, age }
    } catch {
      return null
    }
  }

  static set(userCode, channels) {
    try {
      const cacheData = {
        data: channels,
        timestamp: Date.now()
      }
      sessionStorage.setItem(`${this.CACHE_KEY}_${userCode}`, JSON.stringify(cacheData))
    } catch (error) {
      console.warn('M3U cache write failed:', error)
    }
  }

  static clear(userCode) {
    try {
      sessionStorage.removeItem(`${this.CACHE_KEY}_${userCode}`)
    } catch {
      // ignore
    }
  }

  static clearAll() {
    try {
      Object.keys(sessionStorage)
        .filter(key => key.startsWith(this.CACHE_KEY))
        .forEach(key => sessionStorage.removeItem(key))
    } catch {
      // ignore
    }
  }
}

// Ulkeler - Bayraklar ile
const COUNTRIES = [
  { id: 'ALL', name: 'Tumu', flag: '🌍' },
  { id: 'TR', name: 'Turkiye', flag: '🇹🇷' },
  { id: 'DE', name: 'Almanya', flag: '🇩🇪' },
  { id: 'GB', name: 'Ingiltere', flag: '🇬🇧' },
  { id: 'US', name: 'ABD', flag: '🇺🇸' },
  { id: 'FR', name: 'Fransa', flag: '🇫🇷' },
  { id: 'IT', name: 'Italya', flag: '🇮🇹' },
  { id: 'NL', name: 'Hollanda', flag: '🇳🇱' },
  { id: 'RU', name: 'Rusya', flag: '🇷🇺' },
  { id: 'AR', name: 'Arap', flag: '🇸🇦' },
]

// Kategoriler - Renkler ile
const CATEGORIES = [
  { id: 'all', name: 'Tumu', color: '#E50914', icon: '✨' },
  { id: 'news', name: 'Haber', color: '#3b82f6', icon: '📰' },
  { id: 'sports', name: 'Spor', color: '#10b981', icon: '⚽' },
  { id: 'movies', name: 'Film', color: '#8b5cf6', icon: '🎬' },
  { id: 'entertainment', name: 'Eglence', color: '#f59e0b', icon: '🎪' },
  { id: 'documentary', name: 'Belgesel', color: '#06b6d4', icon: '🌍' },
  { id: 'kids', name: 'Cocuk', color: '#ec4899', icon: '🎈' },
  { id: 'music', name: 'Muzik', color: '#a855f7', icon: '🎵' },
]

// Helper: Check if user has valid subscription
const hasValidSubscription = (user) => {
  if (!user) return false
  const hasExpiry = user.expiresAt && new Date(user.expiresAt) > new Date()
  const hasM3U = !!user.m3uUrl
  return hasExpiry && hasM3U
}

function PlayerPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const videoRef = useRef(null)
  const playerRef = useRef(null)
  const observerRef = useRef(null)
  
  const type = searchParams.get('type')
  const videoUrl = searchParams.get('url')
  const videoTitle = searchParams.get('title')
  
  // Get user and token from auth store - MUST BE BEFORE any useEffect that uses user
  const { user, token } = useAuthStore()
  
  // Check subscription for live TV
  useEffect(() => {
    if (!type && user && !hasValidSubscription(user)) {
      // Live TV mode without subscription
      navigate('/profil/paketler', { 
        state: { 
          message: 'Canlı TV izlemek için aktif bir paket satın almalısınız.' 
        } 
      })
    }
  }, [type, user, navigate])
  
  const [videoMode, setVideoMode] = useState('loading')
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [showControls, setShowControls] = useState(true)
  const controlsTimeoutRef = useRef(null)
  const [volume, setVolume] = useState(1)
  const [audioError, setAudioError] = useState(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  
  // Live TV states
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [channels, setChannels] = useState([])
  const [currentChannel, setCurrentChannel] = useState(null)
  const [selectedCountry, setSelectedCountry] = useState('ALL')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [displayedChannels, setDisplayedChannels] = useState([])
  const [hasMore, setHasMore] = useState(true)
  const [page, setPage] = useState(1)
  const [showFilters, setShowFilters] = useState(false)
  const ITEMS_PER_PAGE = 20

  // Debounce search query - 300ms gecikme
  const debouncedSearchQuery = useDebounce(searchQuery, 300)

  // Determine video mode
  useEffect(() => {
    if (type === 'movie' && videoUrl) {
      setVideoMode('movie')
      setLoading(false)
    } else if (type === 'series' && videoUrl) {
      setVideoMode('series')
      setLoading(false)
    } else {
      setVideoMode('live')
    }
  }, [type, videoUrl])
  
  // Fetch channels when in live mode and user is available
  useEffect(() => {
    if (videoMode === 'live') {
      if (!user) {
        // User henüz yüklenmedi, bekle
        setLoading(true)
        return
      }
      if (!user?.m3uUrl) {
        setError('M3U URL bulunamadı. Lütfen yönetici ile iletişime geçin.')
        setLoading(false)
        return
      }
      // Önce cache kontrolü
      const cached = M3UCache.get(user.code)
      if (cached) {
        console.log(`[M3U Cache] Using cached data (${Math.round(cached.age / 1000)}s old)`)
        setChannels(cached.data)
        if (cached.data.length > 0 && !currentChannel) {
          setCurrentChannel(cached.data[0])
        }
        setLoading(false)
        // Arka planda yenile (stale-while-revalidate pattern)
        fetchChannels(true)
      } else {
        fetchChannels()
      }
    }
  }, [videoMode, user, user?.m3uUrl, user?.code])

  // Video Player (Movie/Series)
  useEffect(() => {
    if (videoMode === 'live' || !videoRef.current || !videoUrl) return

    const video = videoRef.current
    video.crossOrigin = 'anonymous'
    video.src = videoUrl
    video.volume = volume
    video.muted = isMuted
    video.load()
    
    const handleLoadedMetadata = () => {
      setDuration(video.duration)
      setLoading(false)
    }
    
    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime)
      if (video.duration) {
        setProgress((video.currentTime / video.duration) * 100)
      }
    }
    
    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    
    const handleError = () => {
      const errorCode = video.error?.code
      let errorMsg = 'Video yuklenirken hata olustu'
      if (errorCode === 3) {
        errorMsg = 'Video formati desteklenmiyor'
        setAudioError('Ses codec i desteklenmiyor. Baska tarayici deneyin.')
      } else if (errorCode === 2) {
        errorMsg = 'Internet baglantinizi kontrol edin'
      }
      setError(errorMsg)
      setLoading(false)
    }
    
    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)
    video.addEventListener('error', handleError)
    
    const attemptPlay = async () => {
      try {
        await video.play()
        if (video.muted) {
          video.muted = false
          setIsMuted(false)
        }
      } catch (err) {
        setIsPlaying(false)
      }
    }
    
    const playTimeout = setTimeout(attemptPlay, 100)
    
    return () => {
      clearTimeout(playTimeout)
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
      video.removeEventListener('error', handleError)
    }
  }, [videoMode, videoUrl])

  // Controls visibility
  const handleMouseMove = () => {
    setShowControls(true)
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false)
    }, 3000)
  }

  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return
    if (isPlaying) video.pause()
    else video.play()
  }

  const toggleMute = () => {
    const video = videoRef.current
    if (!video) return
    video.muted = !isMuted
    setIsMuted(!isMuted)
  }

  const handleVolumeChange = (e) => {
    const video = videoRef.current
    if (!video) return
    const newVolume = parseFloat(e.target.value)
    video.volume = newVolume
    setVolume(newVolume)
    setIsMuted(newVolume === 0)
  }

  const handleSeek = (e) => {
    const video = videoRef.current
    if (!video || !video.duration) return
    const seekTime = (e.target.value / 100) * video.duration
    video.currentTime = seekTime
  }

  const skip = (seconds) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = Math.max(0, Math.min(duration, video.currentTime + seconds))
  }

  const toggleFullscreen = () => {
    const videoContainer = document.getElementById('video-player-wrapper')
    if (!videoContainer) return
    if (!document.fullscreenElement) {
      videoContainer.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const formatTime = (seconds) => {
    if (!seconds) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Live TV
  // silent = true: Arka plan yenilemesi, loading UI gösterme
  const fetchChannels = async (silent = false) => {
    try {
      // Kullanıcinin M3U URL'sini kontrol et
      if (!user?.m3uUrl) {
        if (!silent) {
          setError('M3U URL bulunamadı. Lütfen yönetici ile iletişime geçin.')
          setLoading(false)
        }
        return
      }
      
      if (!silent) setLoading(true)
      
      // CORS UNBLOCK EKLENTISI GEREKLI - Dogrudan provider'dan cek
      console.log('[Player] Fetching M3U DIRECT from provider:', user.m3uUrl.substring(0, 60))
      
      const response = await fetch(user.m3uUrl, {
        headers: {
          'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18'
        }
      })
      
      if (!response.ok) {
        let errorMsg = `M3U erisim hatasi: ${response.status}`
        if (response.status === 404) {
          errorMsg = 'M3U playlist bulunamadi (404). Lütfen CORS Unblock eklentisinin kurulu ve aktif oldugundan emin olun.'
        } else if (response.status === 403) {
          errorMsg = 'M3U erisim izni reddedildi (403). CORS eklentisi aktif mi kontrol edin.'
        }
        throw new Error(errorMsg)
      }
      
      const text = await response.text()
      
      // M3U icerigi bos mu kontrol et
      if (!text || text.trim().length === 0) {
        throw new Error('M3U playlist bos veya gecersiz icerik')
      }
      
      const parsed = parseM3U(text)
      
      // Cache'e kaydet
      M3UCache.set(user.code, parsed)
      
      setChannels(parsed)
      if (parsed.length > 0 && (!currentChannel || !silent)) {
        setCurrentChannel(parsed[0])
      }
      
      if (!silent) setLoading(false)
    } catch (err) {
      console.error('M3U fetch error:', err)
      if (!silent) {
        setError('Kanallar yüklenemedi: ' + err.message)
        setLoading(false)
      }
    }
  }

  const parseM3U = (content) => {
    const lines = content.split('\n')
    const channels = []
    let current = null

    for (const line of lines) {
      const t = line.trim()
      if (t.startsWith('#EXTINF:')) {
        const nameMatch = t.match(/tvg-name="([^"]+)"/)
        const logoMatch = t.match(/tvg-logo="([^"]+)"/)
        const groupMatch = t.match(/group-title="([^"]+)"/)
        const countryMatch = t.match(/tvg-country="([^"]+)"/)
        const commaIdx = t.lastIndexOf(',')
        const name = commaIdx > -1 ? t.substring(commaIdx + 1).trim() : nameMatch?.[1] || 'Bilinmiyor'
        const rawGroup = groupMatch?.[1] || 'Diger'
        
        let country = countryMatch?.[1] || ''
        if (!country) {
          const groupCodeMatch = rawGroup.match(/^([A-Z]{2}):/)
          if (groupCodeMatch) {
            const code = groupCodeMatch[1]
            const validCountries = ['TR', 'DE', 'GB', 'US', 'FR', 'IT', 'NL', 'RU', 'AR']
            if (validCountries.includes(code)) country = code
          }
        }
        
        if (!country) {
          const groupLower = rawGroup.toLowerCase()
          const nameLower = name.toLowerCase()
          if (groupLower.includes('turkiye') || groupLower.includes('turkey') || /^tr[ |.]/.test(nameLower)) country = 'TR'
          else if (groupLower.includes('almanya') || groupLower.includes('germany')) country = 'DE'
          else if (groupLower.includes('ingiltere') || groupLower.includes('uk')) country = 'GB'
          else if (groupLower.includes('amerika') || groupLower.includes('usa')) country = 'US'
          else if (groupLower.includes('fransa') || groupLower.includes('france')) country = 'FR'
          else if (groupLower.includes('italya') || groupLower.includes('italy')) country = 'IT'
          else if (groupLower.includes('hollanda') || groupLower.includes('netherlands')) country = 'NL'
          else if (groupLower.includes('rusya') || groupLower.includes('russia')) country = 'RU'
          else if (groupLower.includes('arap') || groupLower.includes('arab')) country = 'AR'
        }
        
        let group = rawGroup.replace(/^[A-Z]{2}:/, '').replace('INT:', '').trim()
        if (!group) group = 'Diger'
        
        current = { name, logo: logoMatch?.[1] || '', group, country: country || 'TR' }
      } else if (t && !t.startsWith('#') && current) {
        current.url = t
        channels.push(current)
        current = null
      }
    }
    return channels
  }

  // Filtreleme - Debounced arama kullanarak
  const filteredChannels = useMemo(() => {
    let filtered = channels
    
    // Arama filtresi (debounced)
    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.toLowerCase()
      filtered = filtered.filter(ch => ch.name?.toLowerCase().includes(query))
    }
    
    // Ulke filtresi
    if (selectedCountry !== 'ALL') {
      filtered = filtered.filter(ch => (ch.country || 'TR').toUpperCase() === selectedCountry)
    }
    
    // Kategori filtresi
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(ch => {
        const group = ch.group?.toLowerCase() || ''
        const name = ch.name?.toLowerCase() || ''
        switch (selectedCategory) {
          case 'news': return group.includes('haber') || name.includes('haber') || group.includes('news')
          case 'sports': return group.includes('spor') || name.includes('spor') || group.includes('sport')
          case 'movies': return group.includes('sinema') || name.includes('sinema') || group.includes('movie')
          case 'entertainment': return group.includes('eglence') || group.includes('entertainment') || group.includes('ulusal')
          case 'documentary': return group.includes('belgesel') || group.includes('documentary')
          case 'kids': return group.includes('cocuk') || group.includes('kids') || name.includes('cizgi')
          case 'music': return group.includes('muzik') || group.includes('music')
          default: return true
        }
      })
    }
    
    return filtered
  }, [channels, selectedCategory, selectedCountry, debouncedSearchQuery])

  // Lazy loading
  useEffect(() => {
    setPage(1)
    setDisplayedChannels(filteredChannels.slice(0, ITEMS_PER_PAGE))
    setHasMore(filteredChannels.length > ITEMS_PER_PAGE)
  }, [filteredChannels])

  const loadMore = useCallback(() => {
    const nextPage = page + 1
    const start = (nextPage - 1) * ITEMS_PER_PAGE
    const end = start + ITEMS_PER_PAGE
    const newChannels = filteredChannels.slice(0, end)
    setDisplayedChannels(newChannels)
    setPage(nextPage)
    setHasMore(end < filteredChannels.length)
  }, [filteredChannels, page])

  const lastChannelRef = useCallback(node => {
    if (loading) return
    if (observerRef.current) observerRef.current.disconnect()
    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) loadMore()
    })
    if (node) observerRef.current.observe(node)
  }, [loading, hasMore, loadMore])

  // Keyboard controls
  useEffect(() => {
    if (videoMode === 'live') return
    const handleKeyDown = (e) => {
      const video = videoRef.current
      if (!video) return
      if (videoMode !== 'movie' && videoMode !== 'series') return
      
      switch(e.code) {
        case 'Space':
          e.preventDefault()
          isPlaying ? video.pause() : video.play().catch(() => {})
          break
        case 'ArrowRight':
          e.preventDefault()
          video.currentTime = Math.min(video.duration || 0, video.currentTime + 10)
          break
        case 'ArrowLeft':
          e.preventDefault()
          video.currentTime = Math.max(0, video.currentTime - 10)
          break
        case 'ArrowUp':
          e.preventDefault()
          video.volume = Math.min(1, video.volume + 0.1)
          setVolume(video.volume)
          break
        case 'ArrowDown':
          e.preventDefault()
          video.volume = Math.max(0, video.volume - 0.1)
          setVolume(video.volume)
          break
        case 'KeyF':
          e.preventDefault()
          toggleFullscreen()
          break
        case 'KeyM':
          e.preventDefault()
          video.muted = !video.muted
          setIsMuted(video.muted)
          break
        case 'Escape':
          if (document.fullscreenElement) document.exitFullscreen()
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [videoMode, isPlaying])

  // Live TV Player
  useEffect(() => {
    if (videoMode !== 'live' || !currentChannel || !videoRef.current) return

    const video = videoRef.current
    const streamUrl = currentChannel.url

    video.muted = false
    setIsMuted(false)

    if (mpegts.getFeatureList().mseLivePlayback) {
      if (playerRef.current) {
        playerRef.current.pause()
        playerRef.current.unload()
        playerRef.current.detachMediaElement()
        playerRef.current.destroy()
        playerRef.current = null
      }

      try {
        // ⚠️ LOW LATENCY MODE - Gecikmeyi minimize et
        playerRef.current = mpegts.createPlayer({
          type: 'mpegts',
          url: streamUrl,
          isLive: true,
          enableWorker: true,        // Performans için worker thread
          enableStashBuffer: true,   // Buffer gerekli
          stashInitialSize: 64,      // Küçük initial buffer
          lazyLoad: false,           // Anında yükleme
          
          // 🎯 DÜŞÜK GECİKME AYARLARI
          liveBufferLatencyChasing: true,   // Gecikmeyi kovalama
          liveBufferLatencyMaxLatency: 1.0,  // Max 1 saniye buffer (düşürüldü)
          liveBufferLatencyMinRemain: 0.3,   // Min 0.3 saniye
          
          // Ek optimizasyonlar
          autoCleanupSourceBuffer: true,     // Bellek yönetimi
          fixAudioTimestampGap: false        // Gereksiz sync önleme
        })

        playerRef.current.attachMediaElement(video)
        playerRef.current.load()
        playerRef.current.play().catch(() => {})

        playerRef.current.on(mpegts.Events.ERROR, (errorType, errorDetail, errorInfo) => {
          console.error('[Player Error]', { errorType, errorDetail, errorInfo })
          
          // URL geçersizse veya 404 alındıysa cache'i temizle
          if (errorDetail?.code === 404 || errorDetail?.status === 404) {
            console.warn('[Player] Stream 404 - Clearing cache')
            M3UCache.clear(user?.code)
            setError('Kanal bağlantısı eskimiş. Listeyi yenileyin.')
          } else {
            setError('Kanal yuklenemedi')
          }
          
          setLoading(false)
        })

        playerRef.current.on(mpegts.Events.MEDIA_INFO, () => {
          setLoading(false)
        })
      } catch {
        setError('Player hatasi')
        setLoading(false)
      }
    }

    return () => {
      if (playerRef.current) {
        playerRef.current.pause()
        playerRef.current.unload()
        playerRef.current.detachMediaElement()
        playerRef.current.destroy()
        playerRef.current = null
      }
    }
  }, [currentChannel, videoMode])

  // Loading
  if (videoMode === 'loading') {
    return (
      <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-4" style={{ borderColor: PRIMARY }} />
          <p className="text-white text-lg">Yukleniyor...</p>
        </div>
      </div>
    )
  }

  // Movie/Series Player
  if (videoMode === 'movie' || videoMode === 'series') {
    return (
      <div 
        className="fixed inset-0 bg-black z-50"
        onMouseMove={handleMouseMove}
        onClick={() => !showControls && setShowControls(true)}
      >
        <div id="video-player-wrapper" className="relative w-full h-full">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black z-20">
              <div className="w-16 h-16 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: PRIMARY }} />
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black z-20">
              <div className="text-center text-white p-8 max-w-md">
                <AlertCircle className="w-16 h-16 mx-auto mb-4" style={{ color: PRIMARY }} />
                <p className="mb-4">{error}</p>
                {audioError && (
                  <div className="mb-4 p-4 rounded-xl" style={{ backgroundColor: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}>
                    <p className="text-sm">{audioError}</p>
                  </div>
                )}
                <button 
                  onClick={() => navigate(-1)}
                  className="px-6 py-3 rounded-xl font-bold text-white"
                  style={{ backgroundColor: PRIMARY }}
                >
                  Geri Don
                </button>
              </div>
            </div>
          )}

          <video ref={videoRef} className="w-full h-full object-contain" playsInline />
          
          {showControls && !error && (
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40">
              {/* Top Bar */}
              <div className="absolute top-0 left-0 right-0 p-6 flex items-center gap-4">
                <button 
                  onClick={() => navigate(-1)}
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors"
                  style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
                >
                  <ArrowLeft className="w-6 h-6" />
                </button>
                <div>
                  <h1 className="text-white text-xl font-bold">{videoTitle || 'Video'}</h1>
                </div>
              </div>

              {/* Center Play */}
              {!isPlaying && !loading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <button 
                    onClick={togglePlay}
                    className="w-24 h-24 rounded-full flex items-center justify-center text-white transition-transform hover:scale-110"
                    style={{ backgroundColor: PRIMARY }}
                  >
                    <Play className="w-12 h-12 ml-1" fill="currentColor" />
                  </button>
                </div>
              )}

              {/* Bottom Controls */}
              <div className="absolute bottom-0 left-0 right-0 p-6">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={progress}
                  onChange={handleSeek}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer mb-4"
                  style={{ 
                    background: `linear-gradient(to right, ${PRIMARY} ${progress}%, rgba(255,255,255,0.2) ${progress}%)`
                  }}
                />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <button onClick={togglePlay} className="text-white hover:opacity-70">
                      {isPlaying ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8" />}
                    </button>
                    <button onClick={() => skip(-10)} className="text-white hover:opacity-70">
                      <SkipBack className="w-6 h-6" />
                    </button>
                    <button onClick={() => skip(10)} className="text-white hover:opacity-70">
                      <SkipForward className="w-6 h-6" />
                    </button>
                    
                    <div className="flex items-center gap-2 group">
                      <button onClick={toggleMute} className="text-white hover:opacity-70">
                        {isMuted || volume === 0 ? <VolumeX className="w-6 h-6" /> : 
                         volume < 0.3 ? <Volume className="w-6 h-6" /> : 
                         volume < 0.7 ? <Volume1 className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
                      </button>
                      <div className="w-0 overflow-hidden group-hover:w-24 transition-all duration-300">
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={isMuted ? 0 : volume}
                          onChange={handleVolumeChange}
                          className="w-20 h-1 rounded-full appearance-none cursor-pointer"
                          style={{ 
                            background: `linear-gradient(to right, ${PRIMARY} ${(isMuted ? 0 : volume) * 100}%, rgba(255,255,255,0.2) ${(isMuted ? 0 : volume) * 100}%)` 
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  
                  <button onClick={toggleFullscreen} className="text-white hover:opacity-70">
                    <Maximize className="w-6 h-6" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ===== LIVE TV - YARATICI TASARIM =====
  return (
    <div className="min-h-screen" style={{ backgroundColor: BG_DARK }}>
      {/* Hero Header - Gradient Background ile */}
      <header className="relative overflow-hidden">
        {/* Gradient Background */}
        <div 
          className="absolute inset-0"
          style={{ 
            background: 'linear-gradient(135deg, rgba(229,9,20,0.3) 0%, rgba(10,10,10,0) 50%, rgba(229,9,20,0.1) 100%)'
          }}
        />
        
        <div className="relative max-w-7xl mx-auto px-4 py-6">
          {/* Ust Bar */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div 
                className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ backgroundColor: PRIMARY }}
              >
                <Radio className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-white tracking-tight">Canli TV</h1>
                <p className="text-sm text-white/50 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  Dunyanin her yerinden kanallar
                </p>
              </div>
            </div>
            
            {/* Arama - Modern */}
            <div className="flex-1 max-w-md ml-8">
              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40 group-focus-within:text-white transition-colors" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Kanal ara..."
                  className="w-full pl-12 pr-4 py-3.5 rounded-2xl text-white placeholder-white/40 focus:outline-none transition-all"
                  style={{ 
                    backgroundColor: BG_SURFACE, 
                    border: `2px solid ${searchQuery ? PRIMARY : BORDER}`,
                  }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full hover:bg-white/10 transition-colors"
                  >
                    <X className="w-4 h-4 text-white/60" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Ulke Filtreleri - Buyuk Bayrakli */}
          <div className="flex items-center gap-3 overflow-x-auto pb-2 hide-scrollbar">
            {COUNTRIES.map(country => (
              <button
                key={country.id}
                onClick={() => setSelectedCountry(country.id)}
                className="flex items-center gap-2.5 px-5 py-3.5 rounded-2xl whitespace-nowrap transition-all hover:scale-105"
                style={{
                  backgroundColor: selectedCountry === country.id ? PRIMARY : BG_SURFACE,
                  color: 'white',
                  border: `2px solid ${selectedCountry === country.id ? PRIMARY : BORDER}`,
                  boxShadow: selectedCountry === country.id ? `0 4px 20px rgba(229,9,20,0.4)` : 'none'
                }}
              >
                <span className="text-2xl">{country.flag}</span>
                <span className="font-bold">{country.name}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Kategori Pills - Renkli ve Ikonlu */}
      <div className="sticky top-0 z-30 border-b" style={{ backgroundColor: BG_DARK, borderColor: BORDER }}>
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar">
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all hover:scale-105"
                style={{
                  backgroundColor: selectedCategory === cat.id ? cat.color : BG_SURFACE,
                  color: 'white',
                  border: `2px solid ${selectedCategory === cat.id ? cat.color : BORDER}`,
                  boxShadow: selectedCategory === cat.id ? `0 4px 15px ${cat.color}40` : 'none'
                }}
              >
                <span>{cat.icon}</span>
                <span>{cat.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Ana Icerik */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Video ve Kanal Listesi - Yatay Layout */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Video Player - Sinematik */}
          <div className={`${isFullscreen ? 'fixed inset-0 z-50 bg-black' : 'lg:col-span-2'}`}>
            <div 
              id="video-player-wrapper"
              className={`${isFullscreen ? 'w-full h-screen bg-black' : 'rounded-3xl overflow-hidden shadow-2xl'}`}
              style={!isFullscreen ? { 
                backgroundColor: BG_CARD, 
                border: `2px solid ${BORDER}`,
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
              } : {}}
            >
              <div 
                className={`bg-black relative ${isFullscreen ? 'fixed inset-0 z-50' : 'aspect-video rounded-3xl overflow-hidden'}`}
                onMouseMove={handleMouseMove}
                onClick={toggleFullscreen}
              >
                {loading && (
                  <div className="absolute inset-0 flex items-center justify-center z-10">
                    <div className="text-center">
                      <div className="w-16 h-16 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-3" style={{ borderColor: PRIMARY }} />
                      <p className="text-white/70">Yukleniyor...</p>
                    </div>
                  </div>
                )}
                
                {error && (
                  <div className="absolute inset-0 flex items-center justify-center z-10">
                    <div className="text-center p-8">
                      <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: 'rgba(229,9,20,0.2)' }}>
                        <AlertCircle className="w-10 h-10" style={{ color: PRIMARY }} />
                      </div>
                      <p className="text-white mb-4">{error}</p>
                      <button 
                        onClick={() => { setError(null); setLoading(true) }}
                        className="px-6 py-3 rounded-xl text-white font-bold transition-transform hover:scale-105"
                        style={{ backgroundColor: PRIMARY }}
                      >
                        Tekrar Dene
                      </button>
                    </div>
                  </div>
                )}
                
                <video 
                  ref={videoRef} 
                  className={`${isFullscreen ? 'w-full h-full object-cover' : 'w-full h-full object-contain'}`}
                  autoPlay 
                  playsInline 
                />
                
                {/* Controls - Auto-hide in fullscreen */}
                <div 
                  id="video-container"
                  className={`absolute bottom-0 left-0 right-0 p-6 transition-opacity duration-500 ${showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
                  style={{ 
                    background: showControls ? 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.7) 40%, transparent 100%)' : 'none',
                  }}
                >
                  {/* Kanal Bilgisi - Tam Ekranda Üstte */}
                  {isFullscreen && currentChannel && (
                    <div className="flex items-center gap-4 mb-6">
                      {currentChannel.logo ? (
                        <img 
                          src={currentChannel.logo} 
                          alt="" 
                          className="w-12 h-12 object-contain rounded-xl p-1"
                          style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
                        />
                      ) : (
                        <div 
                          className="w-12 h-12 rounded-xl flex items-center justify-center"
                          style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
                        >
                          <Tv className="w-6 h-6 text-white/50" />
                        </div>
                      )}
                      <div>
                        <h2 className="text-xl font-bold text-white">{currentChannel.name}</h2>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-white/60">{currentChannel.group}</span>
                          <span className="text-xs font-bold" style={{ color: '#46d369' }}>● CANLI</span>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={toggleMute}
                        className="w-12 h-12 rounded-xl flex items-center justify-center transition-all hover:scale-110"
                        style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
                      >
                        {isMuted ? <VolumeX className="w-5 h-5 text-white" /> : <Volume2 className="w-5 h-5 text-white" />}
                      </button>
                      
                      {/* Volume Slider */}
                      <div className="flex items-center gap-2 group">
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={isMuted ? 0 : volume}
                          onChange={handleVolumeChange}
                          className="w-24 h-1 rounded-full appearance-none cursor-pointer"
                          style={{ 
                            background: `linear-gradient(to right, ${PRIMARY} ${(isMuted ? 0 : volume) * 100}%, rgba(255,255,255,0.3) ${(isMuted ? 0 : volume) * 100}%)` 
                          }}
                        />
                      </div>
                    </div>
                    
                    <button 
                      onClick={toggleFullscreen}
                      className="w-12 h-12 rounded-xl flex items-center justify-center transition-all hover:scale-110"
                      style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
                    >
                      {isFullscreen ? (
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      ) : (
                        <Maximize className="w-5 h-5 text-white" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
              
              {/* Kanal Bilgisi - Normal Mod (Fullscreen'de gizli) */}
              {!isFullscreen && currentChannel && (
                <div className="p-5 flex items-center gap-5">
                  {currentChannel.logo ? (
                    <div className="relative">
                      <img 
                        src={currentChannel.logo} 
                        alt="" 
                        className="w-20 h-20 object-contain rounded-2xl p-2"
                        style={{ backgroundColor: BG_DARK, border: `2px solid ${BORDER}` }}
                      />
                      <div 
                        className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2"
                        style={{ backgroundColor: '#46d369', borderColor: BG_CARD }}
                      />
                    </div>
                  ) : (
                    <div 
                      className="w-20 h-20 rounded-2xl flex items-center justify-center"
                      style={{ backgroundColor: BG_DARK, border: `2px solid ${BORDER}` }}
                    >
                      <Tv className="w-10 h-10 text-white/30" />
                    </div>
                  )}
                  <div className="flex-1">
                    <h2 className="text-2xl font-black text-white mb-1">{currentChannel.name}</h2>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-white/50">{currentChannel.group}</span>
                      <span className="w-1 h-1 rounded-full bg-white/30" />
                      <span className="text-sm font-bold" style={{ color: '#46d369' }}>● CANLI YAYIN</span>
                    </div>
                  </div>
                  <div 
                    className="px-4 py-2 rounded-xl font-bold text-sm"
                    style={{ backgroundColor: 'rgba(229,9,20,0.2)', color: PRIMARY, border: `1px solid ${PRIMARY}` }}
                  >
                    HD
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Kanal Listesi - Grid */}
          {!isFullscreen && (
            <div className="lg:col-span-1">
              <div 
                className="rounded-3xl overflow-hidden"
                style={{ backgroundColor: BG_CARD, border: `2px solid ${BORDER}` }}
              >
                {/* Header */}
                <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: BORDER }}>
                  <div>
                    <h3 className="font-black text-white text-lg">Kanallar</h3>
                    <p className="text-sm text-white/50">{filteredChannels.length} kanal bulundu</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Yenile Butonu */}
                    <button
                      onClick={() => {
                        M3UCache.clear(user?.code)
                        fetchChannels()
                      }}
                      disabled={loading}
                      className="w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:scale-110 disabled:opacity-50"
                      style={{ backgroundColor: BG_DARK }}
                      title="Kanalları Yenile"
                    >
                      <RefreshCw className={`w-5 h-5 text-white/70 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    <div 
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: BG_DARK }}
                    >
                      <Tv className="w-5 h-5 text-white/50" />
                    </div>
                  </div>
                </div>
                
                {/* Channel Grid */}
                <div className="overflow-y-auto p-3" style={{ maxHeight: 'calc(100vh - 350px)' }}>
                  <div className="grid grid-cols-1 gap-2">
                    {displayedChannels.map((ch, index) => {
                      const isLast = index === displayedChannels.length - 1
                      const isActive = currentChannel?.name === ch.name
                      return (
                        <button
                          key={index}
                          ref={isLast ? lastChannelRef : null}
                          onClick={() => { setCurrentChannel(ch); setLoading(true); setError(null) }}
                          className="flex items-center gap-4 p-3 rounded-2xl text-left transition-all hover:scale-[1.02]"
                          style={{
                            backgroundColor: isActive ? 'rgba(229,9,20,0.15)' : BG_DARK,
                            border: `2px solid ${isActive ? PRIMARY : 'transparent'}`
                          }}
                        >
                          {ch.logo ? (
                            <img 
                              src={ch.logo} 
                              alt="" 
                              className="w-14 h-14 object-contain rounded-xl p-1 flex-shrink-0"
                              style={{ backgroundColor: isActive ? 'rgba(255,255,255,0.1)' : BG_SURFACE }}
                              loading="lazy"
                            />
                          ) : (
                            <div 
                              className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
                              style={{ backgroundColor: BG_SURFACE }}
                            >
                              <Tv className="w-7 h-7 text-white/30" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className={`font-bold truncate ${isActive ? 'text-white' : 'text-white/90'}`}>
                              {ch.name}
                            </p>
                            <p className="text-xs text-white/40 truncate">{ch.group}</p>
                          </div>
                          {isActive && (
                            <div 
                              className="w-3 h-3 rounded-full flex-shrink-0 animate-pulse"
                              style={{ backgroundColor: PRIMARY }}
                            />
                          )}
                        </button>
                      )
                    })}
                  </div>
                  
                  {hasMore && (
                    <div className="p-4 text-center">
                      <div className="w-8 h-8 border-3 border-t-transparent rounded-full animate-spin mx-auto" style={{ borderColor: PRIMARY }} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default PlayerPage
