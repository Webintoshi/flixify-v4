import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { Search, Tv, Play, Volume2, VolumeX, Maximize, AlertCircle, RefreshCw } from 'lucide-react'
import mpegts from 'mpegts.js'
import Hls from 'hls.js'
import { fetchParsedPlaylist, hasAssignedPlaylist, hasValidSubscription } from '../services/playlist'
import { parseLiveChannelsByCountry } from '../utils/playlistParser'

const PRIMARY = '#E50914'
const BG_DARK = '#0a0a0a'
const BG_SURFACE = '#141414'
const BG_CARD = '#1a1a1a'

// Basitleştirilmiş Kategoriler - Sadece en çok kullanılanlar
const CATEGORIES = [
  { id: 'all', name: 'Tümü', emoji: '📺' },
  { id: 'ulusal', name: 'Ulusal', emoji: '📡' },
  { id: 'haber', name: 'Haber', emoji: '📰' },
  { id: 'spor', name: 'Spor', emoji: '⚽' },
  { id: 'sinema', name: 'Sinema', emoji: '🎬' },
  { id: 'cocuk', name: 'Çocuk', emoji: '🧸' },
  { id: 'belgesel', name: 'Belgesel', emoji: '🌍' },
]

// Debounce hook
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debouncedValue
}

export default function PlayerPage() {
  const navigate = useNavigate()
  const videoRef = useRef(null)
  const hlsPlayerRef = useRef(null)
  const playerRef = useRef(null)
  const controlsTimeoutRef = useRef(null)
  
  const { user, token } = useAuthStore()
  
  // States
  const [channels, setChannels] = useState([])
  const [currentChannel, setCurrentChannel] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [showControls, setShowControls] = useState(true)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  
  const debouncedSearch = useDebounce(searchQuery, 200)

  // Paket kontrolü
  useEffect(() => {
    if (user && !hasValidSubscription(user)) {
      navigate('/profil/paketler', { 
        state: { message: 'Canlı TV izlemek için aktif paket gerekli.' }
      })
    }
  }, [user, navigate])

  // Kanallari cek
  useEffect(() => {
    if (!hasAssignedPlaylist(user) || !token) return

    const loadChannels = async () => {
      try {
        setLoading(true)
        setError(null)

        const parsed = await fetchParsedPlaylist(user, token, {
          cacheKey: 'live-channels-tr-v1',
          parser: (text) => parseLiveChannelsByCountry(text, 'TR'),
          forceRefresh: true,
          disableCache: true,
          scope: 'live'
        })

        const nextChannels = Array.isArray(parsed) ? parsed : []
        setChannels(nextChannels)

        if (nextChannels.length > 0) {
          setCurrentChannel(nextChannels[0])
        } else {
          setCurrentChannel(null)
          setError('Canli kanal bulunamadi. M3U listesi veya grup filtreleri kontrol edilmeli.')
        }
      } catch (err) {
        setError('Kanallar yuklenemedi')
      } finally {
        setLoading(false)
      }
    }

    loadChannels()
  }, [user, token])

  // Filtreleme
  const filteredChannels = useMemo(() => {
    let filtered = channels
    
    // Kategori filtresi
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(ch => {
        const group = ch.group?.toLowerCase() || ''
        const name = ch.name?.toLowerCase() || ''
        switch(selectedCategory) {
          case 'ulusal': return group.includes('ulusal') || group.includes('ulusal')
          case 'haber': return group.includes('haber') || name.includes('haber')
          case 'spor': return group.includes('spor') || group.includes('sport') || name.includes('spor')
          case 'sinema': return group.includes('sinema') || group.includes('movie') || name.includes('sinema')
          case 'cocuk': return group.includes('cocuk') || group.includes('kids') || group.includes('cizgi')
          case 'belgesel': return group.includes('belgesel') || group.includes('documentary')
          default: return true
        }
      })
    }
    
    // Arama filtresi
    if (debouncedSearch.trim()) {
      const query = debouncedSearch.toLowerCase()
      filtered = filtered.filter(ch => ch.name?.toLowerCase().includes(query))
    }
    
    return filtered
  }, [channels, selectedCategory, debouncedSearch])

  // Player - Kanal değişimi
  useEffect(() => {
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
        if (data.fatal) setError('Yayın yüklenemedi')
      })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url
      video.addEventListener('loadedmetadata', () => {
        setLoading(false)
        video.play().catch(() => {})
      }, { once: true })
    } else if (mpegts.getFeatureList().mseLivePlayback) {
      const player = mpegts.createPlayer({
        type: 'mpegts',
        url: url,
        isLive: true,
      })
      playerRef.current = player
      player.attachMediaElement(video)
      player.load()
      player.play().catch(() => {})
      setLoading(false)
    }
    
    return () => {
      hlsPlayerRef.current?.destroy()
      playerRef.current?.destroy()
    }
  }, [currentChannel])

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
        const currentIndex = filteredChannels.findIndex(ch => ch.name === currentChannel?.name)
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
    <div className="min-h-screen" style={{ backgroundColor: BG_DARK }}>
      {/* ========== HEADER - Minimal ========== */}
      <header className="px-6 py-4" style={{ backgroundColor: BG_SURFACE, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div 
              className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: PRIMARY }}
            >
              <Tv className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white">Canlı TV</h1>
              <p className="text-xs text-white/50">{filteredChannels.length} kanal</p>
            </div>
          </div>
          
          {/* Arama - TV için büyük */}
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Kanal ara..."
                className="w-full pl-12 pr-4 py-3 rounded-2xl text-white placeholder-white/40 text-lg outline-none transition-all focus:ring-2"
                style={{ 
                  backgroundColor: BG_CARD, 
                  border: '2px solid rgba(255,255,255,0.1)',
                }}
              />
            </div>
          </div>
        </div>
      </header>

      {/* ========== KATEGORİLER - Büyük TV Dostu Butonlar ========== */}
      <div className="px-6 py-4 overflow-x-auto" style={{ backgroundColor: BG_DARK }}>
        <div className="max-w-7xl mx-auto">
          <div className="flex gap-3 min-w-max">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className="flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-lg transition-all whitespace-nowrap"
                style={{
                  backgroundColor: selectedCategory === cat.id ? PRIMARY : BG_CARD,
                  color: 'white',
                  border: `2px solid ${selectedCategory === cat.id ? PRIMARY : 'rgba(255,255,255,0.1)'}`,
                  transform: selectedCategory === cat.id ? 'scale(1.05)' : 'scale(1)',
                }}
              >
                <span className="text-2xl">{cat.emoji}</span>
                <span>{cat.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ========== ANA İÇERİK ========== */}
      <div className="px-6 py-4">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-[1fr_400px] gap-6">
          
          {/* ========== VIDEO PLAYER ========== */}
          <div 
            id="video-container"
            className="relative rounded-3xl overflow-hidden"
            style={{ 
              backgroundColor: BG_CARD, 
              border: '2px solid rgba(255,255,255,0.1)',
              aspectRatio: '16/9'
            }}
            onMouseMove={handleMouseMove}
            onClick={() => setShowControls(true)}
          >
            {/* Loading */}
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center z-10">
                <div className="text-center">
                  <div 
                    className="w-16 h-16 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-4"
                    style={{ borderColor: PRIMARY, borderTopColor: 'transparent' }}
                  />
                  <p className="text-white/70 text-lg">Yükleniyor...</p>
                </div>
              </div>
            )}
            
            {/* Error */}
            {error && (
              <div className="absolute inset-0 flex items-center justify-center z-10">
                <div className="text-center p-8">
                  <AlertCircle className="w-16 h-16 mx-auto mb-4" style={{ color: PRIMARY }} />
                  <p className="text-white mb-4">{error}</p>
                  <button 
                    onClick={() => window.location.reload()}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl mx-auto font-bold"
                    style={{ backgroundColor: PRIMARY, color: 'white' }}
                  >
                    <RefreshCw className="w-5 h-5" />
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
              className={`absolute bottom-0 left-0 right-0 p-6 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}
              style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 100%)' }}
            >
              {/* Kanal Bilgisi */}
              <div className="mb-4">
                <h2 className="text-2xl font-bold text-white">{currentChannel?.name}</h2>
                <p className="text-white/60">{currentChannel?.group}</p>
              </div>
              
              {/* Kontrol Butonları */}
              <div className="flex items-center gap-6">
                {/* Ses */}
                <div className="flex items-center gap-3">
                  <button 
                    onClick={toggleMute}
                    className="w-12 h-12 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors"
                  >
                    {isMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-32 h-2 rounded-lg appearance-none cursor-pointer"
                    style={{ backgroundColor: 'rgba(255,255,255,0.3)' }}
                  />
                </div>
                
                {/* Fullscreen */}
                <button 
                  onClick={toggleFullscreen}
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors ml-auto"
                >
                  <Maximize className="w-6 h-6" />
                </button>
              </div>
            </div>
          </div>

          {/* ========== KANAL LİSTESİ - TV Dostu Büyük Kartlar ========== */}
          <div 
            className="rounded-3xl overflow-hidden"
            style={{ 
              backgroundColor: BG_SURFACE, 
              border: '2px solid rgba(255,255,255,0.1)',
              maxHeight: 'calc(100vh - 250px)',
              overflowY: 'auto'
            }}
          >
            {/* Liste Başlığı */}
            <div 
              className="sticky top-0 px-6 py-4 flex items-center justify-between"
              style={{ backgroundColor: BG_SURFACE, borderBottom: '1px solid rgba(255,255,255,0.1)' }}
            >
              <h3 className="text-lg font-bold text-white">Kanallar</h3>
              <span className="text-sm text-white/50">{filteredChannels.length}</span>
            </div>
            
            {/* Kanal Kartları - Büyük ve TV Dostu */}
            <div className="p-4 space-y-3">
              {filteredChannels.map((channel, index) => {
                const isActive = currentChannel?.name === channel.name
                return (
                  <button
                    key={channel.name + index}
                    onClick={() => setCurrentChannel(channel)}
                    className="w-full flex items-center gap-4 p-4 rounded-2xl transition-all text-left"
                    style={{
                      backgroundColor: isActive ? PRIMARY : BG_CARD,
                      border: `2px solid ${isActive ? PRIMARY : 'transparent'}`,
                      transform: isActive ? 'scale(1.02)' : 'scale(1)',
                    }}
                  >
                    {/* Kanal Numarası */}
                    <span 
                      className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl"
                      style={{ backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.05)' }}
                    >
                      {index + 1}
                    </span>
                    
                    {/* Kanal Bilgisi */}
                    <div className="flex-1 min-w-0">
                      <h4 className={`font-bold text-lg truncate ${isActive ? 'text-white' : 'text-white/90'}`}>
                        {channel.name}
                      </h4>
                      <p className={`text-sm truncate ${isActive ? 'text-white/80' : 'text-white/50'}`}>
                        {channel.group}
                      </p>
                    </div>
                    
                    {/* Aktif İndikatör */}
                    {isActive && (
                      <div className="w-3 h-3 rounded-full bg-white animate-pulse" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
      
      {/* TV Kullanımı İçin Bilgi */}
      <div className="px-6 py-4 text-center">
        <p className="text-white/40 text-sm">
          📺 TV Kumandası: ↑↓ Kanal değiştir • Ses: Mute/Unmute
        </p>
      </div>
    </div>
  )
}
