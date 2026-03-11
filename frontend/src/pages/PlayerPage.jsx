import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { Search, Tv, Volume2, VolumeX, Maximize, AlertCircle, RefreshCw, ChevronUp, ChevronDown } from 'lucide-react'
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
  const searchInputRef = useRef(null)
  
  const { user, token } = useAuthStore()
  const mediaType = String(searchParams.get('type') || '').trim().toLowerCase()
  const videoUrl = searchParams.get('url') || ''
  const videoTitle = searchParams.get('title') || ''
  const isVodMode = ['movie', 'series'].includes(mediaType) && Boolean(videoUrl)
  
  const [channels, setChannels] = useState([])
  const [currentChannel, setCurrentChannel] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const staticLiveCountries = useMemo(() => buildStaticLiveCountries(), [])
  const [selectedCountry, setSelectedCountry] = useState(DEFAULT_LIVE_COUNTRY_CODE)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [showControls, setShowControls] = useState(true)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [brokenLogoKeys, setBrokenLogoKeys] = useState(() => new Set())
  const [liveCountries, setLiveCountries] = useState(() => staticLiveCountries)
  
  const [channelPage, setChannelPage] = useState(0)
  const CHANNELS_PER_PAGE = 12
  
  const debouncedSearch = useDebounce(searchQuery, 300)

  useEffect(() => {
    if (searchQuery !== debouncedSearch) {
      setIsSearching(true)
    } else {
      setIsSearching(false)
    }
  }, [searchQuery, debouncedSearch])

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

        if (cancelled) return

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
    setChannelPage(0)
  }, [filteredChannels.length, selectedCategory, selectedCountry])

  const visibleChannels = useMemo(() => {
    const start = channelPage * CHANNELS_PER_PAGE
    return filteredChannels.slice(start, start + CHANNELS_PER_PAGE)
  }, [filteredChannels, channelPage])

  const totalPages = Math.max(1, Math.ceil(filteredChannels.length / CHANNELS_PER_PAGE))

  const handlePrevPage = () => {
    setChannelPage((prev) => Math.max(0, prev - 1))
  }

  const handleNextPage = () => {
    setChannelPage((prev) => Math.min(totalPages - 1, prev + 1))
  }

  useEffect(() => {
    if (!currentChannel || filteredChannels.length === 0) return
    
    const currentIndex = filteredChannels.findIndex(
      (ch) => buildChannelIdentity(ch) === buildChannelIdentity(currentChannel)
    )
    
    if (currentIndex !== -1) {
      const newPage = Math.floor(currentIndex / CHANNELS_PER_PAGE)
      setChannelPage(newPage)
    }
  }, [currentChannel, filteredChannels])

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
    if (isVodMode) return
    if (!currentChannel || !videoRef.current) return
    
    const video = videoRef.current
    const url = currentChannel.url
    setError(null)
    setLoading(true)
    
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
        .then(() => setLoading(false))
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

  const handleMouseMove = useCallback(() => {
    setShowControls(true)
    clearTimeout(controlsTimeoutRef.current)
    controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000)
  }, [])

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
    const handleKeyDown = (e) => {
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault()
        searchInputRef.current?.focus()
        return
      }
      
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
      if (e.key === 'PageUp') {
        e.preventDefault()
        handlePrevPage()
      }
      if (e.key === 'PageDown') {
        e.preventDefault()
        handleNextPage()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [filteredChannels, currentChannel])

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
      {/* ========== HEADER - Container Style ========== */}
      <header 
        className="flex-shrink-0"
        style={{ backgroundColor: BG_SURFACE, borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div className="max-w-[1600px] mx-auto px-4 lg:px-6">
          <div className="flex items-center gap-4 py-3">
            {/* Logo */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <div 
                className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: PRIMARY }}
              >
                <Tv className="w-4 h-4 text-white" />
              </div>
              <span className="text-sm font-bold text-white hidden sm:block">Canlı TV</span>
            </div>

            {/* Countries */}
            <div className="flex-1 overflow-x-auto hide-scrollbar">
              <div className="flex gap-1.5 min-w-max">
                {liveCountries.map((country) => (
                  <button
                    key={country.code}
                    onClick={() => setSelectedCountry(country.code)}
                    className="px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap"
                    style={{
                      backgroundColor: selectedCountry === country.code ? PRIMARY : 'rgba(255,255,255,0.08)',
                      color: 'white',
                      opacity: country.count > 0 ? 1 : 0.5,
                    }}
                  >
                    {country.name}
                    <span className="ml-1 opacity-60">{country.count}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          
          {/* Categories - Second Row */}
          <div className="flex items-center gap-3 pb-3 overflow-x-auto hide-scrollbar">
            {liveCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap"
                style={{
                  backgroundColor: selectedCategory === cat.id ? PRIMARY : 'transparent',
                  color: selectedCategory === cat.id ? 'white' : 'rgba(255,255,255,0.7)',
                  border: `1px solid ${selectedCategory === cat.id ? PRIMARY : 'rgba(255,255,255,0.1)'}`,
                }}
              >
                <span className="font-bold">{cat.icon}</span>
                <span>{cat.name}</span>
                <span className="opacity-50 ml-0.5">{cat.count}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ========== MAIN CONTENT - Container ========== */}
      <main className="flex-1 overflow-hidden">
        <div className="max-w-[1600px] mx-auto px-4 lg:px-6 h-full py-4">
          <div className="flex gap-4 h-full">
            
            {/* ========== LEFT - Player ========== */}
            <div className="flex-1 flex flex-col min-w-0">
              {/* Video Container */}
              <div 
                id="video-container"
                className="relative flex-1 rounded-xl overflow-hidden"
                style={{ 
                  backgroundColor: '#000',
                  minHeight: '400px'
                }}
                onMouseMove={handleMouseMove}
                onClick={() => setShowControls(true)}
              >
                {loading && (
                  <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/50">
                    <div className="text-center">
                      <div 
                        className="w-10 h-10 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-2"
                        style={{ borderColor: PRIMARY, borderTopColor: 'transparent' }}
                      />
                      <p className="text-white/70 text-xs">Yükleniyor...</p>
                    </div>
                  </div>
                )}
                
                {error && (
                  <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/80">
                    <div className="text-center p-4">
                      <AlertCircle className="w-10 h-10 mx-auto mb-2" style={{ color: PRIMARY }} />
                      <p className="text-white text-sm mb-2">{error}</p>
                      <button 
                        onClick={() => window.location.reload()}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg mx-auto text-xs font-medium"
                        style={{ backgroundColor: PRIMARY, color: 'white' }}
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Yeniden Dene
                      </button>
                    </div>
                  </div>
                )}
                
                <video 
                  ref={videoRef}
                  className="w-full h-full object-contain"
                  autoPlay
                  playsInline
                />
                
                <div 
                  className={`absolute bottom-0 left-0 right-0 p-4 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}
                  style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 100%)' }}
                >
                  <div className="mb-2">
                    <h2 className="text-lg font-bold text-white">{currentChannel?.name}</h2>
                    <p className="text-xs text-white/60">{currentChannel?.group}</p>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={toggleMute}
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors"
                    >
                      {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={isMuted ? 0 : volume}
                      onChange={handleVolumeChange}
                      className="w-20 h-1 rounded-lg appearance-none cursor-pointer"
                      style={{ backgroundColor: 'rgba(255,255,255,0.3)' }}
                    />
                    <button 
                      onClick={toggleFullscreen}
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors ml-auto"
                    >
                      <Maximize className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Info Bar */}
              <div 
                className="mt-3 px-4 py-3 rounded-xl flex items-center justify-between"
                style={{ backgroundColor: BG_SURFACE }}
              >
                <div className="flex items-center gap-3">
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
                  >
                    {isChannelLogoVisible(currentChannel) ? (
                      <img
                        src={currentChannel?.logo}
                        alt=""
                        className="w-8 h-8 object-contain"
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
                
                <div className="flex items-center gap-3 text-xs text-white/40">
                  <span className="hidden md:inline">↑↓ Kanal • S: Ara</span>
                  <span className="px-2 py-1 rounded bg-white/5">{filteredChannels.length} kanal</span>
                </div>
              </div>
            </div>

            {/* ========== RIGHT SIDEBAR ========== */}
            <aside 
              className="flex-shrink-0 w-72 lg:w-80 flex flex-col rounded-xl overflow-hidden"
              style={{ backgroundColor: BG_SURFACE }}
            >
              {/* Search */}
              <div className="p-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="relative">
                  <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors ${isSearching ? 'animate-pulse' : 'text-white/40'}`} style={{ color: isSearching ? PRIMARY : undefined }} />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Kanal ara... (S tuşu)"
                    className="w-full pl-10 pr-8 py-2.5 rounded-lg text-sm text-white placeholder-white/40 outline-none transition-all"
                    style={{ 
                      backgroundColor: BG_CARD, 
                      border: `1px solid ${isSearching ? PRIMARY : 'rgba(255,255,255,0.08)'}`,
                    }}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>
                {isSearching && (
                  <div className="mt-1.5 text-[10px] text-white/40 flex items-center gap-1.5">
                    <div className="w-3 h-3 border border-t-transparent rounded-full animate-spin" style={{ borderColor: `${PRIMARY} transparent transparent transparent` }} />
                    Aranıyor...
                  </div>
                )}
              </div>

              {/* Header */}
              <div 
                className="px-3 py-2 flex items-center justify-between"
                style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}
              >
                <h3 className="text-xs font-semibold text-white/90">Kanallar</h3>
                <span className="text-[10px] text-white/40 font-mono px-1.5 py-0.5 rounded bg-white/5">
                  {channelPage + 1}/{totalPages}
                </span>
              </div>

              {/* Up Button */}
              <button
                onClick={handlePrevPage}
                disabled={channelPage === 0}
                className="flex-shrink-0 w-full py-2 flex items-center justify-center transition-all"
                style={{ 
                  backgroundColor: channelPage === 0 ? 'transparent' : 'rgba(255,255,255,0.05)',
                  opacity: channelPage === 0 ? 0.2 : 1,
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  cursor: channelPage === 0 ? 'not-allowed' : 'pointer'
                }}
              >
                <ChevronUp className="w-5 h-5 text-white" />
              </button>
              
              {/* Channel List - 12 Channels */}
              <div className="flex-1 overflow-hidden">
                <div className="h-full flex flex-col">
                  {visibleChannels.map((channel, index) => {
                    const isActive = buildChannelIdentity(currentChannel) === buildChannelIdentity(channel)
                    const showLogo = isChannelLogoVisible(channel)
                    const channelNumber = (channelPage * CHANNELS_PER_PAGE) + index + 1
                    
                    return (
                      <button
                        key={channel.name + index}
                        onClick={() => setCurrentChannel(channel)}
                        className="flex items-center gap-2.5 px-3 py-2.5 transition-all text-left flex-1 min-h-0"
                        style={{
                          backgroundColor: isActive ? PRIMARY : 'transparent',
                          borderBottom: '1px solid rgba(255,255,255,0.03)',
                        }}
                      >
                        <span 
                          className="text-[11px] font-mono w-5 text-center flex-shrink-0"
                          style={{ color: isActive ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)' }}
                        >
                          {channelNumber}
                        </span>
                        
                        <div 
                          className="w-8 h-8 rounded flex-shrink-0 flex items-center justify-center"
                          style={{ backgroundColor: isActive ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)' }}
                        >
                          {showLogo ? (
                            <img
                              src={channel.logo}
                              alt=""
                              loading="lazy"
                              onError={() => handleChannelLogoError(channel)}
                              className="w-6 h-6 object-contain"
                            />
                          ) : (
                            <span className="text-[9px] font-bold text-white/40">TV</span>
                          )}
                        </div>
                        
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <h4 className={`text-xs truncate ${isActive ? 'text-white font-medium' : 'text-white/80'}`}>
                            {channel.name}
                          </h4>
                        </div>
                        
                        {isActive && (
                          <div className="w-2 h-2 rounded-full bg-white animate-pulse flex-shrink-0" />
                        )}
                      </button>
                    )
                  })}
                  
                  {visibleChannels.length < CHANNELS_PER_PAGE && (
                    Array.from({ length: CHANNELS_PER_PAGE - visibleChannels.length }).map((_, i) => (
                      <div 
                        key={`empty-${i}`}
                        className="flex-1 min-h-0"
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}
                      />
                    ))
                  )}
                </div>
              </div>

              {/* Down Button */}
              <button
                onClick={handleNextPage}
                disabled={channelPage >= totalPages - 1}
                className="flex-shrink-0 w-full py-2 flex items-center justify-center transition-all"
                style={{ 
                  backgroundColor: channelPage >= totalPages - 1 ? 'transparent' : 'rgba(255,255,255,0.05)',
                  opacity: channelPage >= totalPages - 1 ? 0.2 : 1,
                  borderTop: '1px solid rgba(255,255,255,0.05)',
                  cursor: channelPage >= totalPages - 1 ? 'not-allowed' : 'pointer'
                }}
              >
                <ChevronDown className="w-5 h-5 text-white" />
              </button>

              {/* Footer */}
              <div 
                className="px-3 py-2 text-center text-[10px] text-white/30"
                style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
              >
                {filteredChannels.length} kanal
              </div>
            </aside>
          </div>
        </div>
      </main>
    </div>
  )
}
