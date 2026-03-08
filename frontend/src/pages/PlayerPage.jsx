import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { 
  Play, Pause, Volume2, VolumeX, Maximize, Search,
  Tv, X, ArrowLeft, SkipBack, SkipForward, AlertCircle,
  Volume1, Volume, Loader2, Radio, Sparkles, RefreshCw
} from 'lucide-react'
import mpegts from 'mpegts.js'
import { fetchParsedPlaylist, hasValidSubscription } from '../services/playlist'
import { parseLiveChannels } from '../utils/playlistParser'

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
  static MAX_CACHE_BYTES = 1024 * 1024 // 1 MB

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
      const serialized = JSON.stringify(cacheData)

      // Large IPTV lists easily exceed browser storage quotas.
      if (serialized.length > this.MAX_CACHE_BYTES) {
        return
      }

      sessionStorage.setItem(`${this.CACHE_KEY}_${userCode}`, serialized)
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

function PlayerPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const videoRef = useRef(null)
  const playerShellRef = useRef(null)
  const playerRef = useRef(null)
  const observerRef = useRef(null)
  const liveStartupTimeoutRef = useRef(null)
  
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

  const isVodMode = videoMode === 'movie' || videoMode === 'series'

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

  useEffect(() => {
    if (!isVodMode) return

    const focusTimer = setTimeout(() => {
      playerShellRef.current?.focus()
    }, 0)

    return () => clearTimeout(focusTimer)
  }, [isVodMode, videoUrl])
  
  // Fetch channels when in live mode and user is available
  useEffect(() => {
    if (videoMode === 'live') {
      if (!user) {
        // User henüz yüklenmedi, bekle
        setLoading(true)
        return
      }
      if (!(user?.hasM3U ?? user?.m3uUrl)) {
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
  }, [videoMode, user, token, user?.hasM3U, user?.code])

  // Video Player (Movie/Series)
  useEffect(() => {
    if (videoMode === 'live' || !videoRef.current || !videoUrl) return

    const video = videoRef.current
    setError(null)
    setAudioError(null)
    setLoading(true)
    setProgress(0)
    setCurrentTime(0)
    setDuration(0)
    setIsPlaying(false)
    video.crossOrigin = 'anonymous'
    video.src = videoUrl
    video.volume = volume
    video.muted = isMuted
    video.preload = 'metadata'
    video.load()

    const syncDuration = () => {
      const seekableEnd = video.seekable?.length ? video.seekable.end(video.seekable.length - 1) : 0
      const nextDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : seekableEnd
      setDuration(nextDuration || 0)
    }

    const handleLoadedMetadata = () => {
      syncDuration()
      setLoading(false)
    }

    const handleCanPlay = () => {
      syncDuration()
      setLoading(false)
    }

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime)
      const effectiveDuration = Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : (video.seekable?.length ? video.seekable.end(video.seekable.length - 1) : 0)

      if (effectiveDuration > 0) {
        setProgress((video.currentTime / effectiveDuration) * 100)
      }
    }

    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    const handleVolumeSync = () => {
      setVolume(video.volume)
      setIsMuted(video.muted || video.volume === 0)
    }
    const handleEnded = () => {
      setIsPlaying(false)
      setProgress(100)
    }

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
    video.addEventListener('durationchange', syncDuration)
    video.addEventListener('canplay', handleCanPlay)
    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)
    video.addEventListener('volumechange', handleVolumeSync)
    video.addEventListener('ended', handleEnded)
    video.addEventListener('error', handleError)

    const attemptPlay = async () => {
      try {
        await video.play()
      } catch (err) {
        setIsPlaying(false)
      }
    }

    const playTimeout = setTimeout(attemptPlay, 100)

    return () => {
      clearTimeout(playTimeout)
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('durationchange', syncDuration)
      video.removeEventListener('canplay', handleCanPlay)
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
      video.removeEventListener('volumechange', handleVolumeSync)
      video.removeEventListener('ended', handleEnded)
      video.removeEventListener('error', handleError)
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  }, [videoMode, videoUrl, volume, isMuted])

  // Controls visibility - 3 seconds auto-hide
  const handleMouseMove = () => {
    setShowControls(true)
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false)
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
    if (!video) return

    const seekableEnd = video.seekable?.length ? video.seekable.end(video.seekable.length - 1) : 0
    const effectiveDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : seekableEnd
    if (!effectiveDuration) return

    const nextProgress = Number(e.target.value)
    const seekTime = (nextProgress / 100) * effectiveDuration
    setProgress(nextProgress)
    video.currentTime = seekTime
  }

  const skip = (seconds) => {
    const video = videoRef.current
    if (!video) return
    const seekableEnd = video.seekable?.length ? video.seekable.end(video.seekable.length - 1) : 0
    const effectiveDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : seekableEnd
    const upperBound = effectiveDuration > 0 ? effectiveDuration : video.currentTime + seconds
    video.currentTime = Math.max(0, Math.min(upperBound, video.currentTime + seconds))
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
      if (!(user?.hasM3U ?? user?.m3uUrl)) {
        if (!silent) {
          setError('M3U URL bulunamadı. Lütfen yönetici ile iletişime geçin.')
          setLoading(false)
        }
        return
      }
      
      if (!silent) setLoading(true)

      const parsed = await fetchParsedPlaylist(user, token, {
        cacheKey: 'live-channels:v1',
        parser: parseLiveChannels,
        forceRefresh: silent === false && !M3UCache.get(user.code)
      })

      M3UCache.set(user.code, parsed)

      setChannels(parsed)
      if (parsed.length > 0 && (!currentChannel || !silent)) {
        setCurrentChannel(parsed[0])
      }

      if (!silent) setLoading(false)
      return
      
      /* Legacy direct-provider fallback removed in V4.
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
      
      const parsed = parseLiveChannels(text)
      
      // Cache'e kaydet
      M3UCache.set(user.code, parsed)
      
      setChannels(parsed)
      if (parsed.length > 0 && (!currentChannel || !silent)) {
        setCurrentChannel(parsed[0])
      }
      
      if (!silent) setLoading(false)
      */
    } catch (err) {
      console.error('M3U fetch error:', err)
      if (!silent) {
        setError('Kanallar yüklenemedi: ' + err.message)
        setLoading(false)
      }
    }
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
    const handleKeyDown = (e) => {
      const video = videoRef.current
      const activeTag = document.activeElement?.tagName
      const isTypingTarget = ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag) || document.activeElement?.isContentEditable
      
      // Live TV mode - Channel switching with arrow keys
      if (videoMode === 'live') {
        if (isTypingTarget) return
        if (e.code === 'ArrowRight') {
          e.preventDefault()
          // Next channel
          const currentIndex = channels.findIndex(ch => ch.name === currentChannel?.name)
          if (currentIndex < channels.length - 1) {
            setCurrentChannel(channels[currentIndex + 1])
            setLoading(true)
            setError(null)
          }
        } else if (e.code === 'ArrowLeft') {
          e.preventDefault()
          // Previous channel
          const currentIndex = channels.findIndex(ch => ch.name === currentChannel?.name)
          if (currentIndex > 0) {
            setCurrentChannel(channels[currentIndex - 1])
            setLoading(true)
            setError(null)
          }
        } else if (e.code === 'KeyF') {
          e.preventDefault()
          toggleFullscreen()
        } else if (e.code === 'KeyM' && video) {
          e.preventDefault()
          video.muted = !video.muted
          setIsMuted(video.muted)
        } else if (e.code === 'Escape') {
          if (document.fullscreenElement) document.exitFullscreen()
        }
        return
      }
      
      // Movie/Series mode
      if (!video) return
      if (videoMode !== 'movie' && videoMode !== 'series') return
      if (isTypingTarget) return

      handleMouseMove()

      switch(e.code) {
        case 'Space':
        case 'KeyK':
          e.preventDefault()
          isPlaying ? video.pause() : video.play().catch(() => {})
          break
        case 'ArrowRight':
        case 'KeyL':
          e.preventDefault()
          skip(10)
          break
        case 'ArrowLeft':
        case 'KeyJ':
          e.preventDefault()
          skip(-10)
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
        case 'Home':
          e.preventDefault()
          video.currentTime = 0
          break
        case 'End':
          if (Number.isFinite(video.duration) && video.duration > 0) {
            e.preventDefault()
            video.currentTime = video.duration
          } else if (video.seekable?.length) {
            e.preventDefault()
            video.currentTime = video.seekable.end(video.seekable.length - 1)
          }
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [videoMode, isPlaying, channels, currentChannel])

  // Live TV Player
  useEffect(() => {
    if (videoMode !== 'live' || !currentChannel || !videoRef.current) return

    const video = videoRef.current
    const streamUrl = currentChannel.url
    const clearStartupTimeout = () => {
      if (liveStartupTimeoutRef.current) {
        clearTimeout(liveStartupTimeoutRef.current)
        liveStartupTimeoutRef.current = null
      }
    }
    const finishLoading = () => {
      clearStartupTimeout()
      setLoading(false)
    }

    video.muted = false
    setIsMuted(false)
    setError(null)
    setLoading(true)

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

        liveStartupTimeoutRef.current = setTimeout(() => {
          if (!playerRef.current) return

          console.warn('[Player] Live stream startup timed out', {
            channel: currentChannel?.name,
            streamUrl
          })

          try {
            playerRef.current.pause()
            playerRef.current.unload()
            playerRef.current.detachMediaElement()
            playerRef.current.destroy()
          } catch {
            // ignore cleanup failures
          } finally {
            playerRef.current = null
          }

          setError('Yayin baslatilamadi. Bu kanal su an gecersiz veya yanit vermiyor.')
          setLoading(false)
        }, 8000)

        video.addEventListener('loadeddata', finishLoading)
        video.addEventListener('playing', finishLoading)

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
          
          finishLoading()
        })

        playerRef.current.on(mpegts.Events.MEDIA_INFO, () => {
          finishLoading()
        })
      } catch {
        setError('Player hatasi')
        finishLoading()
      }
    }

    return () => {
      clearStartupTimeout()
      video.removeEventListener('loadeddata', finishLoading)
      video.removeEventListener('playing', finishLoading)

      if (playerRef.current) {
        playerRef.current.pause()
        playerRef.current.unload()
        playerRef.current.detachMediaElement()
        playerRef.current.destroy()
        playerRef.current = null
      }
    }
  }, [currentChannel, videoMode, user?.code])

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
        ref={playerShellRef}
        className="fixed inset-0 bg-black z-50"
        tabIndex={-1}
        onMouseMove={handleMouseMove}
        onDoubleClick={toggleFullscreen}
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

          <video ref={videoRef} className="w-full h-full object-contain" playsInline preload="metadata" />
          
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
                  step="0.1"
                  value={progress}
                  onInput={handleSeek}
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

                    <div className="text-sm text-white/80 tabular-nums">
                      {formatTime(currentTime)} / {formatTime(duration)}
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
                onClick={() => setShowControls(true)}
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
                
                {/* Controls - Modern Minimal Design */}
                <div 
                  id="video-container"
                  className={`absolute bottom-0 left-0 right-0 p-4 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}
                  style={{ 
                    background: showControls ? 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)' : 'transparent',
                  }}
                >
                  <div className="flex items-center justify-center gap-6">
                    {/* Volume Control - Hover to expand */}
                    <div className="flex items-center group">
                      <button 
                        onClick={toggleMute}
                        className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:bg-white/20"
                      >
                        {isMuted ? <VolumeX className="w-5 h-5 text-white" /> : <Volume2 className="w-5 h-5 text-white" />}
                      </button>
                      
                      {/* Volume Slider - Hidden by default, shows on hover */}
                      <div className="w-0 overflow-hidden group-hover:w-24 transition-all duration-300 ease-out">
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={isMuted ? 0 : volume}
                          onChange={handleVolumeChange}
                          className="w-20 h-1 ml-2 rounded-full appearance-none cursor-pointer"
                          style={{ 
                            background: `linear-gradient(to right, ${PRIMARY} ${(isMuted ? 0 : volume) * 100}%, rgba(255,255,255,0.3) ${(isMuted ? 0 : volume) * 100}%)` 
                          }}
                        />
                      </div>
                    </div>
                    
                    {/* Fullscreen Toggle */}
                    <button 
                      onClick={toggleFullscreen}
                      className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:bg-white/20"
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
                
                {/* Kanal Arama - Kanal Listesi Ustu */}
                <div className="px-4 py-3 border-b" style={{ borderColor: BORDER, backgroundColor: BG_DARK }}>
                  <div className="relative group">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 group-focus-within:text-white/60 transition-colors" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Kanal ara..."
                      className="w-full pl-10 pr-9 py-2.5 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none transition-all"
                      style={{ 
                        backgroundColor: BG_SURFACE, 
                        border: `1px solid ${searchQuery ? PRIMARY : BORDER}`,
                      }}
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-white/10 transition-colors"
                      >
                        <X className="w-3.5 h-3.5 text-white/40" />
                      </button>
                    )}
                  </div>
                  {searchQuery && (
                    <p className="text-xs text-white/40 mt-2 ml-1">
                      {filteredChannels.length} sonuc bulundu
                    </p>
                  )}
                </div>

                {/* Channel Grid */}
                <div className="overflow-y-auto p-3" style={{ maxHeight: 'calc(100vh - 420px)' }}>
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
