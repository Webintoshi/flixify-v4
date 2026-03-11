import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { Search, Tv, Volume2, VolumeX, Maximize, AlertCircle, RefreshCw } from 'lucide-react'
import mpegts from 'mpegts.js'
import Hls from 'hls.js'
import { fetchLiveCatalog, hasAssignedPlaylist, hasValidSubscription } from '../services/playlist'
import { DEFAULT_LIVE_COUNTRY_CODE, LIVE_TV_COUNTRIES } from '../config/liveTvTaxonomy'
import VodPlayer from '../components/player/VodPlayer'

const PRIMARY = '#E50914'
const BG_DARK = '#0a0a0a'
const BG_SURFACE = '#141414'
const BG_CARD = '#1a1a1a'
const LIVE_STARTUP_TIMEOUT_MS = 20000
const LIVE_RELOAD_DELAY_MS = 1200
const LIVE_MAX_NETWORK_RECOVERIES = 3
const LIVE_MAX_MEDIA_RECOVERIES = 2
const LIVE_MAX_RELOAD_ATTEMPTS = 2
const LIVE_QUALITY_STORAGE_KEY = 'flixify_live_quality_preference'
const LIVE_QUALITY_PREFERENCES = new Set(['auto', '4k', '1440', '1080', '720', '480'])

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

function inferLiveStreamMode(channel = {}) {
  const url = String(channel?.url || '').toLowerCase()

  if (url.includes('.m3u8') || url.includes('output=hls') || url.includes('output=m3u8')) {
    return 'hls'
  }

  if (url.includes('.ts') || url.includes('output=ts') || url.includes('output=mpegts')) {
    return 'mpegts'
  }

  const sourceType = String(channel?.sourceType || '').trim().toLowerCase()
  if (sourceType === 'mpegts' || sourceType === 'ts') {
    return 'mpegts'
  }

  return 'hls'
}

function getSeekableWindowStart(video) {
  if (!video?.seekable?.length) {
    return null
  }

  const start = video.seekable.start(0)
  return Number.isFinite(start) ? start : null
}

function getSeekableWindowEnd(video) {
  if (!video?.seekable?.length) {
    return null
  }

  const end = video.seekable.end(video.seekable.length - 1)
  return Number.isFinite(end) ? end : null
}

function nudgeToLiveEdge(video, edgeOffsetSeconds = 1.5) {
  const liveEdge = getSeekableWindowEnd(video)
  const windowStart = getSeekableWindowStart(video)

  if (!Number.isFinite(liveEdge) || !Number.isFinite(windowStart)) {
    return false
  }

  const targetTime = Math.max(windowStart, liveEdge - edgeOffsetSeconds)
  if (!Number.isFinite(targetTime) || Math.abs((video.currentTime || 0) - targetTime) < 0.5) {
    return false
  }

  try {
    video.currentTime = targetTime
    return true
  } catch {
    return false
  }
}

function readSavedLiveQualityPreference() {
  if (typeof window === 'undefined') {
    return 'auto'
  }

  try {
    const value = String(window.localStorage.getItem(LIVE_QUALITY_STORAGE_KEY) || '').trim().toLowerCase()
    if (value === '2160') return '4k'
    return LIVE_QUALITY_PREFERENCES.has(value) ? value : 'auto'
  } catch {
    return 'auto'
  }
}

function inferQualityHeight(value = '') {
  const lowered = String(value || '').toLowerCase()

  if (/\b8k\b/.test(lowered)) return 4320
  if (/\b4k\b|\buhd\b|\b2160\b/.test(lowered)) return 2160
  if (/\b1440\b|\b2k\b|\bqhd\b/.test(lowered)) return 1440
  if (/\bfhd\b|full\s*hd|\b1080\b/.test(lowered)) return 1080
  if (/\bhd\b|\b720\b/.test(lowered)) return 720
  if (/\bsd\b|\b480\b/.test(lowered)) return 480
  return 0
}

function resolveLevelHeight(level = {}) {
  const directHeight = Number.parseInt(level?.height, 10)
  if (Number.isFinite(directHeight) && directHeight > 0) {
    return directHeight
  }

  const directWidth = Number.parseInt(level?.width, 10)
  if (Number.isFinite(directWidth) && directWidth >= 3840) return 2160
  if (Number.isFinite(directWidth) && directWidth >= 2560) return 1440
  if (Number.isFinite(directWidth) && directWidth >= 1920) return 1080
  if (Number.isFinite(directWidth) && directWidth >= 1280) return 720
  return 0
}

function formatQualityLabel(height = 0) {
  if (height >= 4320) return '8K UHD'
  if (height >= 2160) return '4K UHD'
  if (height >= 1440) return '1440p QHD'
  if (height >= 1080) return '1080p FHD'
  if (height >= 720) return '720p HD'
  if (height >= 480) return '480p'
  return 'Kaynak'
}

function mapHeightToQualityPreference(height = 0) {
  if (height >= 2160) return '4k'
  if (height >= 1440) return '1440'
  if (height >= 1080) return '1080'
  if (height >= 720) return '720'
  return '480'
}

function inferChannelQualityLabel(channel = {}) {
  const inferredHeight = inferQualityHeight(
    `${channel?.name || ''} ${channel?.group || ''} ${channel?.sourceType || ''}`
  )

  return inferredHeight > 0 ? formatQualityLabel(inferredHeight) : 'Canli'
}

function buildActiveQualityLabel(channel = {}, level = null, isAuto = false) {
  const levelHeight = resolveLevelHeight(level)
  const baseLabel = levelHeight > 0 ? formatQualityLabel(levelHeight) : inferChannelQualityLabel(channel)

  if (!isAuto || baseLabel === 'Canli') {
    return baseLabel
  }

  return `Oto ${baseLabel}`
}

function buildHlsQualityOptions(levels = []) {
  const byHeight = new Map()

  levels.forEach((level, index) => {
    const height = resolveLevelHeight(level)
    if (!height) {
      return
    }

    const current = byHeight.get(height)
    const bitrate = Number(level?.bitrate || 0)
    if (!current || bitrate > current.bitrate) {
      byHeight.set(height, {
        value: mapHeightToQualityPreference(height),
        label: formatQualityLabel(height),
        index,
        bitrate
      })
    }
  })

  return [
    { value: 'auto', label: 'Otomatik' },
    ...Array.from(byHeight.values())
      .sort((left, right) => {
        const leftHeight = Number.parseInt(left.value, 10)
        const rightHeight = Number.parseInt(right.value, 10)
        return rightHeight - leftHeight
      })
      .filter((option, index, list) => (
        list.findIndex((candidate) => candidate.value === option.value) === index
      ))
      .map(({ value, label }) => ({ value, label }))
  ]
}

function pickHlsLevelIndex(levels = [], preference = 'auto') {
  if (preference === 'auto') {
    return -1
  }

  const targetHeight = preference === '4k'
    ? 2160
    : Number.parseInt(preference, 10)
  if (!Number.isFinite(targetHeight) || targetHeight <= 0) {
    return -1
  }

  const indexedLevels = levels
    .map((level, index) => ({
      index,
      height: resolveLevelHeight(level),
      bitrate: Number(level?.bitrate || 0)
    }))
    .filter((level) => level.height > 0)

  if (indexedLevels.length === 0) {
    return -1
  }

  const sortedByBestFit = [...indexedLevels].sort((left, right) => {
    if (left.height === right.height) {
      return right.bitrate - left.bitrate
    }

    return right.height - left.height
  })

  if (targetHeight >= 2160) {
    return sortedByBestFit[0]?.index ?? -1
  }

  const capped = sortedByBestFit.find((level) => level.height <= targetHeight)
  if (capped) {
    return capped.index
  }

  return sortedByBestFit[sortedByBestFit.length - 1]?.index ?? -1
}

export default function PlayerPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const videoRef = useRef(null)
  const hlsPlayerRef = useRef(null)
  const playerRef = useRef(null)
  const controlsTimeoutRef = useRef(null)
  const liveStartupTimeoutRef = useRef(null)
  const liveRetryTimeoutRef = useRef(null)
  const livePlaybackStartedRef = useRef(false)
  const liveRecoveryStateRef = useRef({
    key: '',
    networkRetries: 0,
    mediaRetries: 0,
    reloadRetries: 0
  })
  const volumeRef = useRef(1)
  const mutedRef = useRef(false)
  const observerRef = useRef(null)
  const channelListRef = useRef(null)
  
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
  const [displayedChannels, setDisplayedChannels] = useState([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [brokenLogoKeys, setBrokenLogoKeys] = useState(() => new Set())
  const [liveCountries, setLiveCountries] = useState(() => staticLiveCountries)
  const [playbackNonce, setPlaybackNonce] = useState(0)
  const [selectedQuality, setSelectedQuality] = useState(() => readSavedLiveQualityPreference())
  const [availableQualityOptions, setAvailableQualityOptions] = useState(() => [{ value: 'auto', label: 'Otomatik' }])
  const [activeQualityLabel, setActiveQualityLabel] = useState('Canli')
  
  const ITEMS_PER_PAGE = 40
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
        name: 'Tumu',
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
    volumeRef.current = volume
    mutedRef.current = isMuted

    const video = videoRef.current
    if (!video) {
      return
    }

    video.volume = volume
    video.muted = isMuted
  }, [isMuted, volume])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    try {
      window.localStorage.setItem(LIVE_QUALITY_STORAGE_KEY, selectedQuality)
    } catch {
      // ignore local preference write errors
    }
  }, [selectedQuality])

  const clearLiveStartupTimeout = useCallback(() => {
    if (liveStartupTimeoutRef.current) {
      clearTimeout(liveStartupTimeoutRef.current)
      liveStartupTimeoutRef.current = null
    }
  }, [])

  const clearLiveRetryTimeout = useCallback(() => {
    if (liveRetryTimeoutRef.current) {
      clearTimeout(liveRetryTimeoutRef.current)
      liveRetryTimeoutRef.current = null
    }
  }, [])

  const restartLivePlayback = useCallback((delayMs = 0) => {
    clearLiveStartupTimeout()
    clearLiveRetryTimeout()
    setLoading(true)
    setError(null)

    if (delayMs > 0) {
      liveRetryTimeoutRef.current = setTimeout(() => {
        setPlaybackNonce((current) => current + 1)
      }, delayMs)
      return
    }

    setPlaybackNonce((current) => current + 1)
  }, [clearLiveRetryTimeout, clearLiveStartupTimeout])

  const applySelectedLiveQuality = useCallback((hlsInstance, preference = selectedQuality) => {
    if (!hlsInstance) {
      return -1
    }

    const nextLevelIndex = pickHlsLevelIndex(hlsInstance.levels || [], preference)
    hlsInstance.currentLevel = nextLevelIndex

    hlsInstance.nextLevel = nextLevelIndex
    hlsInstance.loadLevel = nextLevelIndex

    return nextLevelIndex
  }, [selectedQuality])

  useEffect(() => {
    return () => {
      clearLiveStartupTimeout()
      clearLiveRetryTimeout()

      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current)
      }

      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [clearLiveRetryTimeout, clearLiveStartupTimeout])

  useEffect(() => {
    const hlsInstance = hlsPlayerRef.current

    if (!currentChannel) {
      setAvailableQualityOptions([{ value: 'auto', label: 'Otomatik' }])
      setActiveQualityLabel('Canli')
      return
    }

    if (!hlsInstance) {
      setAvailableQualityOptions([{ value: 'auto', label: 'Otomatik' }])
      setActiveQualityLabel(inferChannelQualityLabel(currentChannel))
      return
    }

    setAvailableQualityOptions(buildHlsQualityOptions(hlsInstance.levels || []))

    const nextLevelIndex = applySelectedLiveQuality(hlsInstance, selectedQuality)
    const activeLevel = nextLevelIndex >= 0
      ? hlsInstance.levels?.[nextLevelIndex]
      : hlsInstance.levels?.[hlsInstance.currentLevel] || null

    setActiveQualityLabel(buildActiveQualityLabel(currentChannel, activeLevel, selectedQuality === 'auto'))
  }, [applySelectedLiveQuality, currentChannel, selectedQuality])

  // Player - Kanal değişimi
  useEffect(() => {
    if (currentChannel) return
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

  useEffect(() => {
    if (isVodMode) return
    if (!currentChannel || !videoRef.current) return

    const video = videoRef.current
    const url = currentChannel.url
    const streamMode = inferLiveStreamMode(currentChannel)
    const playbackKey = `${buildChannelIdentity(currentChannel)}:${playbackNonce}`

    livePlaybackStartedRef.current = false
    liveRecoveryStateRef.current = {
      key: playbackKey,
      networkRetries: 0,
      mediaRetries: 0,
      reloadRetries: 0
    }

    setError(null)
    setLoading(true)
    setAvailableQualityOptions([{ value: 'auto', label: 'Otomatik' }])
    setActiveQualityLabel(inferChannelQualityLabel(currentChannel))
    clearLiveStartupTimeout()
    clearLiveRetryTimeout()

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
    video.preload = 'auto'
    video.playsInline = true
    video.crossOrigin = 'anonymous'
    video.volume = volumeRef.current
    video.muted = mutedRef.current

    const setReadyState = () => {
      livePlaybackStartedRef.current = true
      clearLiveStartupTimeout()
      setLoading(false)
    }

    const attemptPlay = () => {
      video.play().catch(() => {})
    }

    const scheduleSoftReload = (delayMs = LIVE_RELOAD_DELAY_MS) => {
      const recoveryState = liveRecoveryStateRef.current
      if (recoveryState.key !== playbackKey) {
        return true
      }

      if (recoveryState.reloadRetries >= LIVE_MAX_RELOAD_ATTEMPTS) {
        return false
      }

      recoveryState.reloadRetries += 1
      restartLivePlayback(delayMs)
      return true
    }

    const failPlayback = (message = 'Yayin yuklenemedi') => {
      clearLiveStartupTimeout()
      setLoading(false)
      setError(message)
    }

    const handleWaiting = () => {
      if (livePlaybackStartedRef.current) {
        setLoading(true)
      }
    }

    const handleStall = () => {
      if (nudgeToLiveEdge(video)) {
        attemptPlay()
        return
      }

      if (livePlaybackStartedRef.current) {
        setLoading(true)
      }
    }

    const handleNativeError = () => {
      if (!scheduleSoftReload(700)) {
        failPlayback('Yayin gecici olarak yanit vermiyor')
      }
    }

    video.addEventListener('loadeddata', setReadyState)
    video.addEventListener('canplay', setReadyState)
    video.addEventListener('playing', setReadyState)
    video.addEventListener('seeked', setReadyState)
    video.addEventListener('waiting', handleWaiting)
    video.addEventListener('stalled', handleStall)
    video.addEventListener('seeking', handleWaiting)
    video.addEventListener('error', handleNativeError)

    liveStartupTimeoutRef.current = setTimeout(() => {
      if (livePlaybackStartedRef.current || video.currentTime > 0) {
        return
      }

      if (nudgeToLiveEdge(video)) {
        attemptPlay()
        return
      }

      if (!scheduleSoftReload(700)) {
        failPlayback('Yayin belirtilen surede baslatilamadi')
      }
    }, LIVE_STARTUP_TIMEOUT_MS)

    if (streamMode === 'hls' && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        capLevelToPlayerSize: false,
        backBufferLength: 90,
        maxBufferLength: 90,
        maxMaxBufferLength: 120,
        liveSyncDurationCount: 6,
        liveMaxLatencyDurationCount: 12,
        manifestLoadingTimeOut: 20000,
        levelLoadingTimeOut: 20000,
        fragLoadingTimeOut: 30000,
        manifestLoadingMaxRetry: 4,
        levelLoadingMaxRetry: 4,
        fragLoadingMaxRetry: 6,
        fragLoadingRetryDelay: 1000,
        fragLoadingMaxRetryTimeout: 8000,
        startFragPrefetch: true,
        maxLiveSyncPlaybackRate: 1.2
      })
      hlsPlayerRef.current = hls
      hls.loadSource(url)
      hls.attachMedia(video)

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setAvailableQualityOptions(buildHlsQualityOptions(hls.levels || []))
        const nextLevelIndex = applySelectedLiveQuality(hls, selectedQuality)
        const activeLevel = nextLevelIndex >= 0
          ? hls.levels?.[nextLevelIndex]
          : hls.levels?.[hls.nextAutoLevel] || hls.levels?.[hls.currentLevel] || null
        setActiveQualityLabel(buildActiveQualityLabel(currentChannel, activeLevel, selectedQuality === 'auto'))
        setLoading(false)
        attemptPlay()
      })

      hls.on(Hls.Events.LEVEL_LOADED, () => {
        if (livePlaybackStartedRef.current) {
          setLoading(false)
        }
      })

      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        const activeLevel = hls.levels?.[data?.level] || null
        setActiveQualityLabel(buildActiveQualityLabel(currentChannel, activeLevel, selectedQuality === 'auto'))
      })

      hls.on(Hls.Events.ERROR, (_, data) => {
        const details = String(data?.details || '').toLowerCase()

        if (!data?.fatal) {
          if (
            details.includes('bufferstalled') ||
            details.includes('bufferseekoverhole') ||
            details.includes('fragloaderror')
          ) {
            if (nudgeToLiveEdge(video)) {
              attemptPlay()
            }
          }
          return
        }

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          const recoveryState = liveRecoveryStateRef.current
          if (recoveryState.networkRetries < LIVE_MAX_NETWORK_RECOVERIES) {
            recoveryState.networkRetries += 1
            setLoading(true)
            hls.startLoad()
            return
          }

          if (!scheduleSoftReload()) {
            failPlayback('Yayin baglantisi kesildi')
          }
          return
        }

        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          const recoveryState = liveRecoveryStateRef.current
          if (recoveryState.mediaRetries < LIVE_MAX_MEDIA_RECOVERIES) {
            recoveryState.mediaRetries += 1
            setLoading(true)
            hls.recoverMediaError()
            return
          }

          if (!scheduleSoftReload()) {
            failPlayback('Yayin kod cozucu hatasi nedeniyle durdu')
          }
          return
        }

        if (!scheduleSoftReload()) {
          failPlayback('Yayin yuklenemedi')
        }
      })
    } else if (streamMode === 'hls' && video.canPlayType('application/vnd.apple.mpegurl')) {
      setActiveQualityLabel(inferChannelQualityLabel(currentChannel))
      video.src = url
      video.load()
      attemptPlay()
    } else if (streamMode === 'mpegts' && mpegts.getFeatureList().mseLivePlayback) {
      setActiveQualityLabel(inferChannelQualityLabel(currentChannel))
      const player = mpegts.createPlayer({
        type: 'mpegts',
        url: url,
        isLive: true,
      })
      playerRef.current = player
      player.attachMediaElement(video)
      player.on(mpegts.Events.ERROR, () => {
        if (!scheduleSoftReload(700)) {
          failPlayback('Yayin yuklenemedi')
        }
      })
      player.load()
      player.play()
        .then(() => {
          setLoading(false)
        })
        .catch(() => {
          if (!scheduleSoftReload(700)) {
            failPlayback('Yayin yuklenemedi')
          }
        })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      setActiveQualityLabel(inferChannelQualityLabel(currentChannel))
      video.src = url
      video.load()
      attemptPlay()
    } else {
      failPlayback('Tarayici bu yayin formatini desteklemiyor')
    }

    return () => {
      clearLiveStartupTimeout()
      video.removeEventListener('loadeddata', setReadyState)
      video.removeEventListener('canplay', setReadyState)
      video.removeEventListener('playing', setReadyState)
      video.removeEventListener('seeked', setReadyState)
      video.removeEventListener('waiting', handleWaiting)
      video.removeEventListener('stalled', handleStall)
      video.removeEventListener('seeking', handleWaiting)
      video.removeEventListener('error', handleNativeError)
      hlsPlayerRef.current?.destroy()
      hlsPlayerRef.current = null
      playerRef.current?.destroy()
      playerRef.current = null
    }
  }, [
    clearLiveRetryTimeout,
    clearLiveStartupTimeout,
    currentChannel,
    isVodMode,
    selectedQuality,
    playbackNonce,
    restartLivePlayback,
    applySelectedLiveQuality
  ])

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
      <div className="px-6 py-4" style={{ backgroundColor: BG_DARK }}>
        <div className="max-w-7xl mx-auto space-y-4">
          <div className="overflow-x-auto">
            <div className="flex gap-3 min-w-max">
              {liveCountries.map((country) => (
                <button
                  key={country.code}
                  onClick={() => setSelectedCountry(country.code)}
                  className="flex items-center gap-3 px-5 py-3 rounded-2xl font-bold text-base transition-all whitespace-nowrap"
                  style={{
                    backgroundColor: selectedCountry === country.code ? PRIMARY : BG_CARD,
                    color: 'white',
                    border: `2px solid ${selectedCountry === country.code ? PRIMARY : 'rgba(255,255,255,0.1)'}`,
                    opacity: country.count > 0 ? 1 : 0.55,
                    transform: selectedCountry === country.code ? 'scale(1.03)' : 'scale(1)',
                  }}
                >
                  <span>{country.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-black/25">{country.count}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="flex gap-3 min-w-max">
              {liveCategories.map((cat) => (
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
                  <span className="text-sm font-black leading-none">{cat.icon}</span>
                  <span>{cat.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-black/25">{cat.count}</span>
                </button>
              ))}
            </div>
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
                    onClick={() => {
                      restartLivePlayback()
                    }}
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
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-2xl font-bold text-white">{currentChannel?.name}</h2>
                  {activeQualityLabel !== 'Canli' && (
                    <span
                      className="px-3 py-1 rounded-full text-xs font-black tracking-[0.18em]"
                      style={{
                        color: activeQualityLabel.includes('4K') ? '#fff7d6' : 'white',
                        backgroundColor: activeQualityLabel.includes('4K') ? 'rgba(245, 158, 11, 0.28)' : 'rgba(255,255,255,0.14)',
                        border: activeQualityLabel.includes('4K')
                          ? '1px solid rgba(245, 158, 11, 0.6)'
                          : '1px solid rgba(255,255,255,0.15)'
                      }}
                    >
                      {activeQualityLabel}
                    </span>
                  )}
                </div>
                <p className="text-white/60">{currentChannel?.group}</p>
              </div>
              
              {/* Kontrol Butonları */}
              <div className="flex items-center gap-6 flex-wrap">
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

                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">Kalite</span>
                  <select
                    value={availableQualityOptions.some((option) => option.value === selectedQuality) ? selectedQuality : 'auto'}
                    onChange={(e) => setSelectedQuality(e.target.value)}
                    className="px-4 py-2 rounded-xl text-white text-sm font-bold outline-none"
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.12)',
                      border: '1px solid rgba(255,255,255,0.14)'
                    }}
                  >
                    {availableQualityOptions.map((option) => (
                      <option key={option.value} value={option.value} style={{ backgroundColor: BG_CARD }}>
                        {option.label}
                      </option>
                    ))}
                  </select>
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
              maxHeight: 'calc(100vh - 250px)'
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
            <div
              ref={channelListRef}
              className="p-4 space-y-3 overflow-y-auto"
              style={{ maxHeight: 'calc(100vh - 340px)' }}
            >
              {displayedChannels.map((channel, index) => {
                const isActive = buildChannelIdentity(currentChannel) === buildChannelIdentity(channel)
                const isLastVisible = index === displayedChannels.length - 1
                const showLogo = isChannelLogoVisible(channel)
                return (
                  <button
                    key={channel.name + index}
                    ref={isLastVisible ? lastChannelRef : null}
                    onClick={() => setCurrentChannel(channel)}
                    className="w-full flex items-center gap-4 p-4 rounded-2xl transition-all text-left"
                    style={{
                      backgroundColor: isActive ? PRIMARY : BG_CARD,
                      border: `2px solid ${isActive ? PRIMARY : 'transparent'}`,
                      transform: isActive ? 'scale(1.02)' : 'scale(1)',
                    }}
                  >
                    {showLogo ? (
                      <img
                        src={channel.logo}
                        alt={channel.name}
                        loading="lazy"
                        onError={() => handleChannelLogoError(channel)}
                        className="w-12 h-12 rounded-xl object-contain p-1"
                        style={{ backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)' }}
                      />
                    ) : (
                      <span
                        className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-sm"
                        style={{ backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)' }}
                      >
                        TV
                      </span>
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <h4 className={`font-bold text-lg truncate ${isActive ? 'text-white' : 'text-white/90'}`}>
                        {channel.name}
                      </h4>
                      <p className={`text-sm truncate ${isActive ? 'text-white/80' : 'text-white/50'}`}>
                        {channel.group}
                      </p>
                    </div>
                    
                    {isActive && (
                      <div className="w-3 h-3 rounded-full bg-white animate-pulse" />
                    )}
                  </button>
                )
              })}

              {hasMore && (
                <div className="py-4 text-center text-sm text-white/60">
                  Kaydirinca daha fazla kanal yuklenir...
                </div>
              )}
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
