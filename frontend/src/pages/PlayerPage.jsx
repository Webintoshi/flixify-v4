import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { Search, Tv, Volume2, VolumeX, Maximize, AlertCircle, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'
import mpegts from 'mpegts.js'
import Hls from 'hls.js'
import { fetchLiveCatalog, hasAssignedPlaylist, hasValidSubscription } from '../services/playlist'
import { DEFAULT_LIVE_COUNTRY_CODE, LIVE_TV_COUNTRIES } from '../config/liveTvTaxonomy'
import VodPlayer from '../components/player/VodPlayer'

const PRIMARY = '#E50914'
const BG_DARK = '#0a0a0a'
const BG_SURFACE = '#141414'
const BG_CARD = '#1a1a1a'

const normalizeLiveGroupLabel = (value) => {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim()
  return normalized || 'Diger'
}

const normalizeLiveGroupKey = (value) => normalizeLiveGroupLabel(value).toLocaleUpperCase('tr-TR')

const buildLiveCategoryIcon = (value) => {
  const cleaned = normalizeLiveGroupLabel(value).replace(/[^0-9A-Za-z/&\s-]/g, ' ')
  const tokens = cleaned.split(/\s+/).filter(Boolean)

  if (tokens.length === 0) return 'TV'
  if (tokens.length === 1) return tokens[0].slice(0, 2).toLocaleUpperCase('tr-TR')
  return `${tokens[0][0] || ''}${tokens[1][0] || ''}`.toLocaleUpperCase('tr-TR')
}

// Debounce hook
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debouncedValue
}

function buildChannelIdentity(channel = {}) {
  return [
    String(channel?.id || '').trim(),
    String(channel?.name || '').trim(),
    String(channel?.group || '').trim()
  ].join('|')
}

function buildStaticLiveCountries() {
  return LIVE_TV_COUNTRIES.map((country) => ({
    code: country.code,
    name: country.name,
    defaultSelected: Boolean(country.defaultSelected),
    count: 0,
    categories: (Array.isArray(country.categories) ? country.categories : []).map((category) => ({
      id: `group:${normalizeLiveGroupKey(category)}`,
      name: normalizeLiveGroupLabel(category),
      count: 0
    }))
  }))
}

export default function PlayerPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const videoRef = useRef(null)
  const hlsPlayerRef = useRef(null)
  const playerRef = useRef(null)
  const controlsTimeoutRef = useRef(null)
  const observerRef = useRef(null)
  const channelListRef = useRef(null)
  const countryScrollRef = useRef(null)
  const categoryScrollRef = useRef(null)
  
  const { user, token } = useAuthStore()
  const mediaType = String(searchParams.get('type') || '').trim().toLowerCase()
  const videoUrl = searchParams.get('url') || ''
  const videoTitle = searchParams.get('title') || ''
  const isVodMode = ['movie', 'series'].includes(mediaType) && Boolean(videoUrl)
  
  // States
  const [channels, setChannels] = useState([])
  const [currentChannel, setCurrentChannel] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const staticLiveCountries = useMemo(() => buildStaticLiveCountries(), [])
  const [selectedCountry, setSelectedCountry] = useState(DEFAULT_LIVE_COUNTRY_CODE)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [showControls, setShowControls] = useState(true)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [displayedChannels, setDisplayedChannels] = useState([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [brokenLogoKeys, setBrokenLogoKeys] = useState(() => new Set())
  const [liveCountries, setLiveCountries] = useState(() => staticLiveCountries)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  
  const ITEMS_PER_PAGE = 50
  const debouncedSearch = useDebounce(searchQuery, 200)

  // Paket kontrolü
  useEffect(() => {
    if (user && !hasValidSubscription(user)) {
      navigate('/profil/paketler', { 
        state: { message: 'Canlı TV izlemek için aktif paket gerekli.' }
      })
    }
  }, [user, navigate])

  useEffect(() => {
    setSelectedCategory('all')
  }, [selectedCountry])

  const liveCategories = useMemo(() => {
    const activeCountry = liveCountries.find((country) => country.code === selectedCountry)
      || staticLiveCountries.find((country) => country.code === selectedCountry)
      || staticLiveCountries.find((country) => country.defaultSelected)
      || staticLiveCountries[0]
      || null

    const categoryItems = Array.isArray(activeCountry?.categories) ? activeCountry.categories : []

    return [
      {
        id: 'all',
        name: 'Tümü',
        icon: 'TV',
        count: channels.length
      },
      ...categoryItems.map((category) => ({
        id: category?.id || `group:${normalizeLiveGroupKey(category?.name)}`,
        name: normalizeLiveGroupLabel(category?.name),
        icon: buildLiveCategoryIcon(category?.name),
        count: Number(category?.count || 0)
      }))
    ]
  }, [channels.length, liveCountries, selectedCountry, staticLiveCountries])

  // Kanallari cek
  useEffect(() => {
    if (isVodMode) return
    if (!hasAssignedPlaylist(user) || !token) return

    let cancelled = false

    const applyChannels = (nextChannels = []) => {
      setChannels(nextChannels)

      if (nextChannels.length === 0) {
        setCurrentChannel(null)
        setError('Canli kanal bulunamadi. Statik canli TV katalogu kontrol edilmeli.')
        return
      }

      setCurrentChannel((previous) => {
        if (!previous) {
          return nextChannels[0]
        }

        const previousKey = buildChannelIdentity(previous)
        return nextChannels.find((channel) => buildChannelIdentity(channel) === previousKey) || nextChannels[0]
      })
    }

    const loadChannels = async ({ forceRefresh = false } = {}) => {
      try {
        setLoading(true)
        setError(null)
        setBrokenLogoKeys(new Set())

        const payload = await fetchLiveCatalog(user, token, {
          country: selectedCountry,
          forceRefresh
        })

        if (cancelled) {
          return
        }

        const nextChannels = Array.isArray(payload?.items) ? payload.items : []
        const nextCountries = Array.isArray(payload?.countries) && payload.countries.length > 0
          ? payload.countries
          : staticLiveCountries
        const resolvedCountry = String(payload?.country || selectedCountry).trim().toUpperCase() || selectedCountry

        setLiveCountries(nextCountries)

        if (resolvedCountry !== selectedCountry) {
          setSelectedCountry(resolvedCountry)
        }

        applyChannels(nextChannels)
      } catch {
        if (!cancelled) {
          setChannels([])
          setCurrentChannel(null)
          setError('Canli TV katalogu yuklenemedi')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadChannels()

    return () => {
      cancelled = true
    }
  }, [isVodMode, selectedCountry, staticLiveCountries, token, user])

  useEffect(() => {
    if (selectedCategory === 'all') return
    if (!liveCategories.some((category) => category.id === selectedCategory)) {
      setSelectedCategory('all')
    }
  }, [liveCategories, selectedCategory])

  // Filtreleme
  const filteredChannels = useMemo(() => {
    let filtered = channels

    if (selectedCategory !== 'all') {
      filtered = filtered.filter((channel) => (
        `group:${normalizeLiveGroupKey(channel?.group)}` === selectedCategory
      ))
    }

    if (debouncedSearch.trim()) {
      const query = debouncedSearch.toLowerCase()
      filtered = filtered.filter((channel) => channel.name?.toLowerCase().includes(query))
    }

    return filtered
  }, [channels, selectedCategory, debouncedSearch])

  useEffect(() => {
    setPage(1)
    setDisplayedChannels(filteredChannels.slice(0, ITEMS_PER_PAGE))
    setHasMore(filteredChannels.length > ITEMS_PER_PAGE)
  }, [filteredChannels])

  useEffect(() => {
    if (filteredChannels.length === 0) {
      setCurrentChannel(null)
      return
    }

    const currentKey = buildChannelIdentity(currentChannel)
    if (!currentKey || !filteredChannels.some((channel) => buildChannelIdentity(channel) === currentKey)) {
      setCurrentChannel(filteredChannels[0])
    }
  }, [filteredChannels, currentChannel])

  const loadMoreChannels = useCallback(() => {
    if (!hasMore) return

    const nextPage = page + 1
    const nextVisibleCount = nextPage * ITEMS_PER_PAGE
    setDisplayedChannels(filteredChannels.slice(0, nextVisibleCount))
    setPage(nextPage)
    setHasMore(nextVisibleCount < filteredChannels.length)
  }, [filteredChannels, hasMore, page])

  const lastChannelRef = useCallback((node) => {
    if (observerRef.current) {
      observerRef.current.disconnect()
    }

    if (!node || !hasMore) {
      return
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMoreChannels()
        }
      },
      {
        root: channelListRef.current || null,
        rootMargin: '120px'
      }
    )

    observerRef.current.observe(node)
  }, [hasMore, loadMoreChannels])

  const buildChannelLogoKey = useCallback(
    (channel) => `${channel?.name || ''}|${channel?.logo || ''}`,
    []
  )

  const isChannelLogoVisible = useCallback(
    (channel) => {
      const logo = String(channel?.logo || '').trim()
      if (!logo) return false
      return !brokenLogoKeys.has(buildChannelLogoKey(channel))
    },
    [brokenLogoKeys, buildChannelLogoKey]
  )

  const handleChannelLogoError = useCallback(
    (channel) => {
      const key = buildChannelLogoKey(channel)
      setBrokenLogoKeys((prev) => {
        if (prev.has(key)) return prev
        const next = new Set(prev)
        next.add(key)
        return next
      })
    },
    [buildChannelLogoKey]
  )

  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [])

  // Player - Kanal değişimi
  useEffect(() => {
    if (isVodMode) return
    if (!currentChannel || !videoRef.current) return
    
    const video = videoRef.current
    const url = currentChannel.url
    setError(null)
    setLoading(true)
    
    // Cleanup önceki player
    if (hlsPlayerRef.current) {
      hlsPlayerRef.current.destroy()
      hlsPlayerRef.current = null
    }
    if (playerRef.current) {
      playerRef.current.destroy()
      playerRef.current = null
    }
    
    video.pause()
    video.removeAttribute('src')
    video.load()
    
    // HLS stream
    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        maxBufferLength: 30,
        liveSyncDurationCount: 3,
      })
      hlsPlayerRef.current = hls
      hls.loadSource(url)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLoading(false)
        video.play().catch(() => {})
      })
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data?.fatal) {
          setLoading(false)
          setError('Yayin yuklenemedi')
          return
        }
        if (data.fatal) setError('Yayın yüklenemedi')
      })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      const handleNativeError = () => {
        setLoading(false)
        setError('Yayin yuklenemedi')
      }

      video.src = url
      video.addEventListener('loadedmetadata', () => {
        setLoading(false)
        video.play().catch(() => {})
      }, { once: true })
      video.addEventListener('error', handleNativeError, { once: true })
    } else if (mpegts.getFeatureList().mseLivePlayback) {
      const player = mpegts.createPlayer({
        type: 'mpegts',
        url: url,
        isLive: true,
      })
      playerRef.current = player
      player.attachMediaElement(video)
      player.on(mpegts.Events.ERROR, () => {
        setLoading(false)
        setError('Yayin yuklenemedi')
      })
      player.load()
      player.play()
        .then(() => {
          setLoading(false)
        })
        .catch(() => {
          setLoading(false)
          setError('Yayin yuklenemedi')
        })
    } else {
      setLoading(false)
      setError('Tarayici bu yayin formatini desteklemiyor')
    }
    
    return () => {
      hlsPlayerRef.current?.destroy()
      playerRef.current?.destroy()
    }
  }, [currentChannel, isVodMode])

  // Kontrolleri gizle/göster
  const handleMouseMove = useCallback(() => {
    setShowControls(true)
    clearTimeout(controlsTimeoutRef.current)
    controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000)
  }, [])

  // Ses kontrolü
  const toggleMute = () => {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    setIsMuted(video.muted)
  }

  const handleVolumeChange = (e) => {
    const video = videoRef.current
    if (!video) return
    const newVol = parseFloat(e.target.value)
    video.volume = newVol
    setVolume(newVol)
    setIsMuted(newVol === 0)
  }

  // Fullscreen
  const toggleFullscreen = () => {
    const container = document.getElementById('video-container')
    if (!container) return
    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  // Kanal değiştir (ok tuşları)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault()
        const currentIndex = filteredChannels.findIndex((channel) => (
          buildChannelIdentity(channel) === buildChannelIdentity(currentChannel)
        ))
        if (e.key === 'ArrowUp' && currentIndex > 0) {
          setCurrentChannel(filteredChannels[currentIndex - 1])
        } else if (e.key === 'ArrowDown' && currentIndex < filteredChannels.length - 1) {
          setCurrentChannel(filteredChannels[currentIndex + 1])
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [filteredChannels, currentChannel])

  // Scroll controls for filters
  const scrollCountries = (direction) => {
    if (countryScrollRef.current) {
      const scrollAmount = direction === 'left' ? -200 : 200
      countryScrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' })
    }
  }

  const scrollCategories = (direction) => {
    if (categoryScrollRef.current) {
      const scrollAmount = direction === 'left' ? -200 : 200
      categoryScrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' })
    }
  }

  // Aktif kanalı sidebar'da görünür alana getir
  useEffect(() => {
    if (!currentChannel || !channelListRef.current) return
    
    const activeElement = document.getElementById(`channel-${buildChannelIdentity(currentChannel)}`)
    if (activeElement) {
      activeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [currentChannel])

  if (isVodMode) {
    return (
      <VodPlayer
        mode={mediaType}
        videoUrl={videoUrl}
        videoTitle={videoTitle}
        onBack={() => navigate(mediaType === 'series' ? '/series' : '/movies')}
      />
    )
  }

  if (!hasAssignedPlaylist(user)) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: BG_DARK }}>
        <div className="text-center p-8">
          <AlertCircle className="w-16 h-16 mx-auto mb-4" style={{ color: PRIMARY }} />
          <h2 className="text-2xl font-bold text-white mb-2">M3U URL Bulunamadı</h2>
          <p className="text-white/60">Yönetici ile iletişime geçin</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: BG_DARK }}>
      {/* ========== HEADER - Minimal & Clean ========== */}
      <header 
        className="flex-shrink-0 px-4 py-3 flex items-center justify-between gap-4"
        style={{ backgroundColor: BG_SURFACE, borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div 
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: PRIMARY }}
          >
            <Tv className="w-5 h-5 text-white" />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-lg font-bold text-white leading-tight">Canlı TV</h1>
            <p className="text-xs text-white/40">{filteredChannels.length} kanal</p>
          </div>
        </div>

        {/* Ülke Seçimi - Compact */}
        <div className="flex-1 max-w-xl flex items-center gap-2">
          <button 
            onClick={() => scrollCountries('left')}
            className="hidden md:flex w-7 h-7 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors flex-shrink-0"
          >
            <ChevronLeft className="w-4 h-4 text-white" />
          </button>
          
          <div 
            ref={countryScrollRef}
            className="flex-1 overflow-x-auto hide-scrollbar"
          >
            <div className="flex gap-2 min-w-max">
              {liveCountries.map((country) => (
                <button
                  key={country.code}
                  onClick={() => setSelectedCountry(country.code)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap"
                  style={{
                    backgroundColor: selectedCountry === country.code ? PRIMARY : 'rgba(255,255,255,0.08)',
                    color: 'white',
                    opacity: country.count > 0 ? 1 : 0.5,
                  }}
                >
                  {country.name}
                  <span className="ml-1.5 text-xs opacity-60">{country.count}</span>
                </button>
              ))}
            </div>
          </div>
          
          <button 
            onClick={() => scrollCountries('right')}
            className="hidden md:flex w-7 h-7 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors flex-shrink-0"
          >
            <ChevronRight className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Arama */}
        <div className="w-48 sm:w-56">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Kanal ara..."
              className="w-full pl-9 pr-3 py-2 rounded-xl text-sm text-white placeholder-white/40 outline-none transition-all"
              style={{ 
                backgroundColor: BG_CARD, 
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            />
          </div>
        </div>
      </header>

      {/* Kategoriler - Second Row */}
      <div 
        className="flex-shrink-0 px-4 py-2 flex items-center gap-2"
        style={{ backgroundColor: BG_DARK, borderBottom: '1px solid rgba(255,255,255,0.05)' }}
      >
        <button 
          onClick={() => scrollCategories('left')}
          className="hidden md:flex w-6 h-6 items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors flex-shrink-0"
        >
          <ChevronLeft className="w-3 h-3 text-white/60" />
        </button>
        
        <div 
          ref={categoryScrollRef}
          className="flex-1 overflow-x-auto hide-scrollbar"
        >
          <div className="flex gap-2 min-w-max">
            {liveCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all whitespace-nowrap"
                style={{
                  backgroundColor: selectedCategory === cat.id ? PRIMARY : 'transparent',
                  color: selectedCategory === cat.id ? 'white' : 'rgba(255,255,255,0.7)',
                  border: `1px solid ${selectedCategory === cat.id ? PRIMARY : 'rgba(255,255,255,0.1)'}`,
                }}
              >
                <span className="text-xs font-bold opacity-80">{cat.icon}</span>
                <span>{cat.name}</span>
                <span className="text-xs opacity-50 ml-0.5">{cat.count}</span>
              </button>
            ))}
          </div>
        </div>
        
        <button 
          onClick={() => scrollCategories('right')}
          className="hidden md:flex w-6 h-6 items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors flex-shrink-0"
        >
          <ChevronRight className="w-3 h-3 text-white/60" />
        </button>

        {/* Sidebar Toggle */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="hidden lg:flex ml-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ 
            backgroundColor: sidebarCollapsed ? PRIMARY : 'rgba(255,255,255,0.08)',
            color: 'white'
          }}
        >
          {sidebarCollapsed ? 'Kanalları Göster' : 'Kanalları Gizle'}
        </button>
      </div>

      {/* ========== ANA İÇERİK - Split Layout ========== */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* ========== SOL SIDEBAR - Kanal Listesi ========== */}
        <aside 
          className={`flex-shrink-0 transition-all duration-300 ease-in-out ${sidebarCollapsed ? 'w-0 opacity-0' : 'w-72 opacity-100'} hidden lg:block`}
          style={{ 
            backgroundColor: BG_SURFACE,
            borderRight: '1px solid rgba(255,255,255,0.05)'
          }}
        >
          {/* Sidebar Header */}
          <div 
            className="sticky top-0 px-4 py-3 flex items-center justify-between z-10"
            style={{ backgroundColor: BG_SURFACE, borderBottom: '1px solid rgba(255,255,255,0.05)' }}
          >
            <h3 className="text-sm font-semibold text-white/90">Kanallar</h3>
            <span className="text-xs text-white/40 px-2 py-0.5 rounded-full bg-white/5">{filteredChannels.length}</span>
          </div>
          
          {/* Kanal Listesi */}
          <div
            ref={channelListRef}
            className="overflow-y-auto p-2 space-y-1"
            style={{ height: 'calc(100% - 50px)' }}
          >
            {displayedChannels.map((channel, index) => {
              const isActive = buildChannelIdentity(currentChannel) === buildChannelIdentity(channel)
              const isLastVisible = index === displayedChannels.length - 1
              const showLogo = isChannelLogoVisible(channel)
              const channelId = `channel-${buildChannelIdentity(channel)}`
              
              return (
                <button
                  key={channel.name + index}
                  id={channelId}
                  ref={isLastVisible ? lastChannelRef : null}
                  onClick={() => setCurrentChannel(channel)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl transition-all text-left group"
                  style={{
                    backgroundColor: isActive ? PRIMARY : 'transparent',
                  }}
                >
                  {/* Logo / Placeholder */}
                  <div 
                    className="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center transition-colors"
                    style={{ 
                      backgroundColor: isActive ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
                    }}
                  >
                    {showLogo ? (
                      <img
                        src={channel.logo}
                        alt=""
                        loading="lazy"
                        onError={() => handleChannelLogoError(channel)}
                        className="w-8 h-8 object-contain"
                      />
                    ) : (
                      <span className="text-xs font-bold text-white/40">TV</span>
                    )}
                  </div>
                  
                  {/* Kanal Bilgisi */}
                  <div className="flex-1 min-w-0">
                    <h4 className={`text-sm font-medium truncate ${isActive ? 'text-white' : 'text-white/90 group-hover:text-white'}`}>
                      {channel.name}
                    </h4>
                    <p className={`text-xs truncate ${isActive ? 'text-white/70' : 'text-white/40 group-hover:text-white/60'}`}>
                      {channel.group}
                    </p>
                  </div>
                  
                  {/* Aktif İndikatör */}
                  {isActive && (
                    <div className="w-2 h-2 rounded-full bg-white animate-pulse flex-shrink-0" />
                  )}
                </button>
              )
            })}

            {hasMore && (
              <div className="py-3 text-center text-xs text-white/40">
                Daha fazla yükleniyor...
              </div>
            )}
          </div>
        </aside>

        {/* ========== ANA ALAN - Player ========== */}
        <main className="flex-1 flex flex-col min-w-0">
          
          {/* Video Container */}
          <div 
            id="video-container"
            className="relative flex-1 overflow-hidden"
            style={{ 
              backgroundColor: '#000',
              minHeight: '50vh'
            }}
            onMouseMove={handleMouseMove}
            onClick={() => setShowControls(true)}
          >
            {/* Loading */}
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/50">
                <div className="text-center">
                  <div 
                    className="w-12 h-12 border-3 border-t-transparent rounded-full animate-spin mx-auto mb-3"
                    style={{ borderColor: PRIMARY, borderTopColor: 'transparent' }}
                  />
                  <p className="text-white/70 text-sm">Yükleniyor...</p>
                </div>
              </div>
            )}
            
            {/* Error */}
            {error && (
              <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/80">
                <div className="text-center p-6">
                  <AlertCircle className="w-12 h-12 mx-auto mb-3" style={{ color: PRIMARY }} />
                  <p className="text-white text-sm mb-3">{error}</p>
                  <button 
                    onClick={() => window.location.reload()}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg mx-auto text-sm font-medium"
                    style={{ backgroundColor: PRIMARY, color: 'white' }}
                  >
                    <RefreshCw className="w-4 h-4" />
                    Yeniden Dene
                  </button>
                </div>
              </div>
            )}
            
            {/* Video */}
            <video 
              ref={videoRef}
              className="w-full h-full object-contain"
              autoPlay
              playsInline
            />
            
            {/* Kontroller */}
            <div 
              className={`absolute bottom-0 left-0 right-0 p-4 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}
              style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 100%)' }}
            >
              {/* Kanal Bilgisi */}
              <div className="mb-3">
                <h2 className="text-xl font-bold text-white">{currentChannel?.name}</h2>
                <p className="text-sm text-white/60">{currentChannel?.group}</p>
              </div>
              
              {/* Kontrol Butonları */}
              <div className="flex items-center gap-4">
                {/* Ses */}
                <div className="flex items-center gap-2">
                  <button 
                    onClick={toggleMute}
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors"
                  >
                    {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-24 h-1.5 rounded-lg appearance-none cursor-pointer"
                    style={{ backgroundColor: 'rgba(255,255,255,0.3)' }}
                  />
                </div>
                
                {/* Fullscreen */}
                <button 
                  onClick={toggleFullscreen}
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors ml-auto"
                >
                  <Maximize className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Sidebar Toggle (Floating) - Mobile/Desktop when collapsed */}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="absolute top-4 right-4 lg:hidden w-10 h-10 rounded-full flex items-center justify-center transition-colors z-20"
              style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            >
              <ChevronLeft className={`w-5 h-5 text-white transition-transform ${sidebarCollapsed ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Mobile/Tablet Kanal Listesi - Bottom Sheet Style */}
          <div 
            className={`lg:hidden flex-shrink-0 transition-all duration-300 ${sidebarCollapsed ? 'h-0' : 'h-48'}`}
            style={{ 
              backgroundColor: BG_SURFACE,
              borderTop: '1px solid rgba(255,255,255,0.05)',
              overflow: 'hidden'
            }}
          >
            <div className="h-full overflow-x-auto hide-scrollbar">
              <div className="flex gap-2 p-3 min-w-max">
                {displayedChannels.map((channel, index) => {
                  const isActive = buildChannelIdentity(currentChannel) === buildChannelIdentity(channel)
                  const showLogo = isChannelLogoVisible(channel)
                  
                  return (
                    <button
                      key={channel.name + index}
                      onClick={() => setCurrentChannel(channel)}
                      className="flex flex-col items-center gap-2 p-3 rounded-xl transition-all flex-shrink-0 w-24"
                      style={{
                        backgroundColor: isActive ? PRIMARY : BG_CARD,
                      }}
                    >
                      <div 
                        className="w-12 h-12 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: isActive ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)' }}
                      >
                        {showLogo ? (
                          <img
                            src={channel.logo}
                            alt=""
                            loading="lazy"
                            onError={() => handleChannelLogoError(channel)}
                            className="w-10 h-10 object-contain"
                          />
                        ) : (
                          <span className="text-xs font-bold text-white/40">TV</span>
                        )}
                      </div>
                      <span className={`text-xs text-center line-clamp-2 ${isActive ? 'text-white font-medium' : 'text-white/70'}`}>
                        {channel.name}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Info Bar */}
          <div 
            className="flex-shrink-0 px-4 py-3 flex items-center justify-between"
            style={{ backgroundColor: BG_SURFACE, borderTop: '1px solid rgba(255,255,255,0.05)' }}
          >
            <div className="flex items-center gap-3">
              <div 
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
              >
                {isChannelLogoVisible(currentChannel) ? (
                  <img
                    src={currentChannel?.logo}
                    alt=""
                    className="w-6 h-6 object-contain"
                  />
                ) : (
                  <Tv className="w-4 h-4 text-white/40" />
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">{currentChannel?.name}</h3>
                <p className="text-xs text-white/50">{currentChannel?.group}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4 text-xs text-white/40">
              <span className="hidden sm:inline">↑↓ Kanal değiştir</span>
              <span className="hidden sm:inline">•</span>
              <span>{filteredChannels.length} kanal</span>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
