import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { Search, Tv, Volume2, VolumeX, Maximize, AlertCircle, RefreshCw, ChevronUp, ChevronDown } from 'lucide-react'
import mpegts from 'mpegts.js'
import Hls from 'hls.js'
import { fetchLiveCatalog, getCachedLiveCatalogSnapshot, hasAssignedPlaylist, hasValidSubscription } from '../services/playlist'
import { DEFAULT_LIVE_COUNTRY_CODE, LIVE_TV_COUNTRIES, getLiveCategoryDisplayLabel } from '../config/liveTvTaxonomy'
import { resolveChannelFallbackLogo } from '../config/channelLogoFallbacks'
import VodPlayer from '../components/player/VodPlayer'
import {
  bindFullscreenChangeListeners,
  canPlayNativeHls,
  exitElementFullscreen,
  getBrowserCapabilities,
  isFullscreenActive,
  requestElementFullscreen
} from '../utils/browserSupport'

const PRIMARY = '#E50914'
const BG_DARK = '#0a0a0a'
const BG_SURFACE = '#141414'
const BG_CARD = '#1a1a1a'
const LIVE_CATALOG_TTL_MS = 5 * 60 * 1000
const LIVE_PAGE_STATE_PREFIX = 'iptv_live_page_state_v2_'
const LIVE_STARTUP_TIMEOUT_MS = 12000
const LIVE_AUTOPLAY_RETRY_DELAY_MS = 100
const LIVE_DEFAULT_MAX_AUTO_HEIGHT = 1080

const normalizeLiveGroupLabel = (value) => {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim()
  return normalized || 'Diger'
}

const normalizeLiveGroupKey = (value) => normalizeLiveGroupLabel(value).toLocaleUpperCase('tr-TR')

const normalizeLiveCountryCode = (value) => {
  const normalized = String(value || '').trim().toUpperCase()
  return LIVE_TV_COUNTRIES.some((country) => country.code === normalized)
    ? normalized
    : DEFAULT_LIVE_COUNTRY_CODE
}

function getLiveEdgeTime(video) {
  if (!video) return null

  const seekable = video.seekable
  if (seekable && seekable.length > 0) {
    const lastIndex = seekable.length - 1
    const rangeStart = seekable.start(lastIndex)
    const rangeEnd = seekable.end(lastIndex)

    if (Number.isFinite(rangeStart) && Number.isFinite(rangeEnd)) {
      return Math.max(rangeStart, rangeEnd - 1)
    }
  }

  if (Number.isFinite(video.duration) && video.duration > 1) {
    return Math.max(0, video.duration - 1)
  }

  return null
}

function getDecodedVideoFrameCount(video) {
  if (!video) return 0

  try {
    if (typeof video.getVideoPlaybackQuality === 'function') {
      return Number(video.getVideoPlaybackQuality()?.totalVideoFrames || 0)
    }

    if (Number.isFinite(video.webkitDecodedFrameCount)) {
      return Number(video.webkitDecodedFrameCount)
    }

    if (Number.isFinite(video.mozParsedFrames)) {
      return Number(video.mozParsedFrames)
    }
  } catch {
    return 0
  }

  return 0
}

function resolveHlsLevelHeight(level = {}) {
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

function resolveHlsLevelCodecSet(level = {}) {
  const explicitCodecs = String(level?.attrs?.CODECS || level?.codecSet || '').trim()
  if (explicitCodecs) {
    return explicitCodecs
  }

  return [level?.videoCodec, level?.audioCodec]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(',')
}

function isCodecSetVideoHeavy(codecSet = '') {
  return /(avc1|avc3|hev1|hvc1|vp09|av01|dvh1|dvhe|mp4v)/i.test(codecSet)
}

function isCodecSetHighEfficiency(codecSet = '') {
  return /(hev1|hvc1|av01|dvh1|dvhe)/i.test(codecSet)
}

function supportsMseCodecSet(codecSet = '') {
  const normalizedCodecSet = String(codecSet || '').replace(/\s+/g, '')
  if (!normalizedCodecSet || typeof window === 'undefined') {
    return null
  }

  const MediaSourceCtor = window.ManagedMediaSource || window.MediaSource
  if (typeof MediaSourceCtor?.isTypeSupported !== 'function') {
    return null
  }

  const mimeType = isCodecSetVideoHeavy(normalizedCodecSet)
    ? `video/mp4; codecs="${normalizedCodecSet}"`
    : `audio/mp4; codecs="${normalizedCodecSet}"`

  try {
    return MediaSourceCtor.isTypeSupported(mimeType)
  } catch {
    return false
  }
}

function buildPlayableHlsLevelCandidates(levels = [], browserCapabilities = {}) {
  return (Array.isArray(levels) ? levels : [])
    .map((level, index) => {
      const codecSet = resolveHlsLevelCodecSet(level)
      const codecSupport = supportsMseCodecSet(codecSet)
      const highEfficiencyCodec = isCodecSetHighEfficiency(codecSet)
      const safeHighEfficiency = browserCapabilities.isSafari || browserCapabilities.isIOS || codecSupport === true
      const playable = codecSupport !== false && (!highEfficiencyCodec || safeHighEfficiency)

      return {
        index,
        height: resolveHlsLevelHeight(level),
        bitrate: Number(level?.bitrate || level?.maxBitrate || 0),
        playable
      }
    })
    .filter((candidate) => candidate.playable)
}

function findSafeHlsAutoLevelIndex(levels = [], browserCapabilities = {}) {
  const candidates = buildPlayableHlsLevelCandidates(levels, browserCapabilities)
  if (candidates.length === 0) {
    return -1
  }

  const maxAutoHeight = browserCapabilities.isSafari || browserCapabilities.isIOS
    ? Number.POSITIVE_INFINITY
    : LIVE_DEFAULT_MAX_AUTO_HEIGHT

  const scopedCandidates = candidates.filter((candidate) => (
    candidate.height === 0 || candidate.height <= maxAutoHeight
  ))

  const rankedCandidates = (scopedCandidates.length > 0 ? scopedCandidates : candidates)
    .slice()
    .sort((left, right) => {
      if (right.height !== left.height) {
        return right.height - left.height
      }

      return right.bitrate - left.bitrate
    })

  return rankedCandidates[0]?.index ?? -1
}

function findLowerHlsLevelIndex(levels = [], currentIndex = -1, browserCapabilities = {}) {
  const candidates = buildPlayableHlsLevelCandidates(levels, browserCapabilities)
  if (candidates.length === 0) {
    return -1
  }

  const currentLevel = Array.isArray(levels) && currentIndex >= 0 ? levels[currentIndex] : null
  const currentHeight = resolveHlsLevelHeight(currentLevel)

  const lowerCandidates = candidates.filter((candidate) => {
    if (currentHeight > 0 && candidate.height > 0) {
      return candidate.height < currentHeight
    }

    return currentIndex < 0 || candidate.index < currentIndex
  })

  if (lowerCandidates.length === 0) {
    return -1
  }

  lowerCandidates.sort((left, right) => {
    if (right.height !== left.height) {
      return right.height - left.height
    }

    return right.bitrate - left.bitrate
  })

  return lowerCandidates[0]?.index ?? -1
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

function canUseLocalStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function buildLivePageStateKey(userCode) {
  const normalizedCode = String(userCode || '').trim()
  return normalizedCode ? `${LIVE_PAGE_STATE_PREFIX}${normalizedCode}` : ''
}

function readPersistedLivePageState(userCode) {
  if (!canUseLocalStorage()) return null

  const key = buildLivePageStateKey(userCode)
  if (!key) return null

  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writePersistedLivePageState(userCode, value) {
  if (!canUseLocalStorage()) return

  const key = buildLivePageStateKey(userCode)
  if (!key) return

  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore storage write errors
  }
}

function resolvePreferredChannel(channels = [], previousChannel = null, preferredState = {}) {
  const previousIdentity = buildChannelIdentity(previousChannel)
  const preferredIdentity = String(preferredState?.currentChannelKey || '').trim()
  const preferredId = String(preferredState?.currentChannelId || '').trim()

  return channels.find((channel) => (
    (preferredId && String(channel?.id || '').trim() === preferredId)
    || (preferredIdentity && buildChannelIdentity(channel) === preferredIdentity)
    || (previousIdentity && buildChannelIdentity(channel) === previousIdentity)
  )) || channels[0] || null
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
  const nativePlaybackCleanupRef = useRef(() => {})
  const playbackRecoveryTimeoutRef = useRef(null)
  const playbackStartupTimeoutRef = useRef(null)
  const playbackStartedRef = useRef(false)
  const playbackModeRef = useRef('idle')
  
  const { user, token } = useAuthStore()
  const mediaType = String(searchParams.get('type') || '').trim().toLowerCase()
  const videoUrl = searchParams.get('url') || ''
  const videoTitle = searchParams.get('title') || ''
  const isVodMode = ['movie', 'series'].includes(mediaType) && Boolean(videoUrl)
  const browserCapabilities = useMemo(() => getBrowserCapabilities(), [])
  const staticLiveCountries = useMemo(() => buildStaticLiveCountries(), [])
  const initialLivePageState = useMemo(() => readPersistedLivePageState(user?.code), [user?.code])
  const initialSelectedCountry = useMemo(
    () => normalizeLiveCountryCode(initialLivePageState?.selectedCountry),
    [initialLivePageState?.selectedCountry]
  )
  const initialLiveCatalogSnapshot = useMemo(() => {
    if (isVodMode || !user?.code || !token) {
      return null
    }

    return getCachedLiveCatalogSnapshot(user, token, {
      country: initialSelectedCountry,
      ttlMs: LIVE_CATALOG_TTL_MS,
      allowStale: true
    })
  }, [initialSelectedCountry, isVodMode, token, user])
  
  const [channels, setChannels] = useState(() => (
    Array.isArray(initialLiveCatalogSnapshot?.value?.items) ? initialLiveCatalogSnapshot.value.items : []
  ))
  const [currentChannel, setCurrentChannel] = useState(() => (
    resolvePreferredChannel(
      Array.isArray(initialLiveCatalogSnapshot?.value?.items) ? initialLiveCatalogSnapshot.value.items : [],
      null,
      initialLivePageState
    )
  ))
  const [loading, setLoading] = useState(() => !initialLiveCatalogSnapshot?.value)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState(() => String(initialLivePageState?.searchQuery || ''))
  const [isSearching, setIsSearching] = useState(false)
  const [selectedCountry, setSelectedCountry] = useState(initialSelectedCountry)
  const [selectedCategory, setSelectedCategory] = useState(() => String(initialLivePageState?.selectedCategory || 'all') || 'all')
  const [showControls, setShowControls] = useState(true)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [brokenLogoKeys, setBrokenLogoKeys] = useState(() => new Set())
  const [brokenFallbackLogoKeys, setBrokenFallbackLogoKeys] = useState(() => new Set())
  const [liveCountries, setLiveCountries] = useState(() => {
    const cachedCountries = initialLiveCatalogSnapshot?.value?.countries
    return Array.isArray(cachedCountries) && cachedCountries.length > 0
      ? cachedCountries
      : staticLiveCountries
  })
  
  const [channelPage, setChannelPage] = useState(0)
  const CHANNELS_PER_PAGE = 10
  const userRef = useRef(user)
  const tokenRef = useRef(token)
  const latestCatalogRequestIdRef = useRef(0)
  const hasBootstrappedCatalogRef = useRef(Boolean(initialLiveCatalogSnapshot?.value))
  const restoredUserCodeRef = useRef(user?.code || '')
  const skipCategoryResetRef = useRef(false)
  const preferredChannelStateRef = useRef({
    currentChannelId: String(initialLivePageState?.currentChannelId || '').trim(),
    currentChannelKey: String(initialLivePageState?.currentChannelKey || '').trim()
  })
  
  const debouncedSearch = useDebounce(searchQuery, 300)

  useEffect(() => {
    userRef.current = user
    tokenRef.current = token
  }, [user, token])

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
    if (skipCategoryResetRef.current) {
      skipCategoryResetRef.current = false
      return
    }

    setSelectedCategory('all')
  }, [selectedCountry])

  const visibleCountries = useMemo(
    () => liveCountries.filter((country) => Number(country?.count || 0) > 0),
    [liveCountries]
  )

  const liveCategories = useMemo(() => {
    const activeCountry = visibleCountries.find((country) => country.code === selectedCountry)
      || visibleCountries[0]
      || liveCountries.find((country) => country.code === selectedCountry)
      || staticLiveCountries.find((country) => country.code === selectedCountry)
      || staticLiveCountries.find((country) => country.defaultSelected)
      || staticLiveCountries[0]
      || null

    const categoryItems = Array.isArray(activeCountry?.categories)
      ? activeCountry.categories.filter((category) => Number(category?.count || 0) > 0)
      : []

    return [
      {
        id: 'all',
        name: 'T\u00FCm\u00FC',
        count: channels.length
      },
      ...categoryItems.map((category) => ({
        id: category?.id || `group:${normalizeLiveGroupKey(category?.name)}`,
        name: getLiveCategoryDisplayLabel(category?.name),
        count: Number(category?.count || 0)
      }))
    ]
  }, [channels.length, liveCountries, selectedCountry, staticLiveCountries, visibleCountries])

  useEffect(() => {
    if (isVodMode) return
    if (visibleCountries.length === 0) return
    if (visibleCountries.some((country) => country.code === selectedCountry)) return

    skipCategoryResetRef.current = true
    setSelectedCountry(visibleCountries[0].code)
  }, [isVodMode, selectedCountry, visibleCountries])

  useEffect(() => {
    if (isVodMode || !user?.code) return

    writePersistedLivePageState(user.code, {
      selectedCountry,
      selectedCategory,
      searchQuery,
      currentChannelId: String(currentChannel?.id || '').trim(),
      currentChannelKey: buildChannelIdentity(currentChannel)
    })
  }, [currentChannel, isVodMode, searchQuery, selectedCategory, selectedCountry, user?.code])

  const applyCatalogPayload = useCallback((payload, options = {}) => {
    const requestedCountry = normalizeLiveCountryCode(options.requestedCountry || selectedCountry)
    const nextChannels = Array.isArray(payload?.items) ? payload.items : []
    const nextCountries = Array.isArray(payload?.countries) && payload.countries.length > 0
      ? payload.countries
      : staticLiveCountries
    const resolvedCountry = normalizeLiveCountryCode(payload?.country || requestedCountry)

    setLiveCountries(nextCountries)

    if (resolvedCountry !== requestedCountry) {
      skipCategoryResetRef.current = true
      setSelectedCountry(resolvedCountry)
    }

    setChannels(nextChannels)

    if (nextChannels.length === 0) {
      setCurrentChannel(null)
      return false
    }

    setCurrentChannel((previous) => resolvePreferredChannel(nextChannels, previous, options.preferredState))
    return true
  }, [selectedCountry, staticLiveCountries])

  const loadChannels = useCallback(async ({ forceRefresh = false, background = false } = {}) => {
    const currentUser = userRef.current
    const currentToken = tokenRef.current

    if (isVodMode || !hasAssignedPlaylist(currentUser) || !currentToken) {
      setLoading(false)
      return
    }

    const requestId = latestCatalogRequestIdRef.current + 1
    latestCatalogRequestIdRef.current = requestId
    const requestedCountry = normalizeLiveCountryCode(selectedCountry)
    const cachedSnapshot = !forceRefresh
      ? getCachedLiveCatalogSnapshot(currentUser, currentToken, {
        country: requestedCountry,
        ttlMs: LIVE_CATALOG_TTL_MS,
        allowStale: true
      })
      : null

    if (cachedSnapshot?.value) {
      applyCatalogPayload(cachedSnapshot.value, {
        requestedCountry,
        preferredState: preferredChannelStateRef.current
      })
      setError(null)
      setLoading(false)
      hasBootstrappedCatalogRef.current = true
    } else if (!background) {
      setLoading(true)
    }

    const shouldRevalidate = forceRefresh || !cachedSnapshot?.value || cachedSnapshot.isStale
    if (!shouldRevalidate) {
      return
    }

    try {
      const payload = await fetchLiveCatalog(currentUser, currentToken, {
        country: requestedCountry,
        forceRefresh: forceRefresh || Boolean(cachedSnapshot?.isStale),
        disableCache: false,
        ttlMs: LIVE_CATALOG_TTL_MS
      })

      if (requestId !== latestCatalogRequestIdRef.current) {
        return
      }

      const hasChannels = applyCatalogPayload(payload, {
        requestedCountry,
        preferredState: preferredChannelStateRef.current
      })

      preferredChannelStateRef.current = {
        currentChannelId: '',
        currentChannelKey: ''
      }
      hasBootstrappedCatalogRef.current = hasChannels || hasBootstrappedCatalogRef.current
      setBrokenLogoKeys(new Set())
      setBrokenFallbackLogoKeys(new Set())
      setError(hasChannels ? null : 'Canli kanal bulunamadi. Statik canli TV katalogu kontrol edilmeli.')
      setLoading(false)
    } catch {
      if (requestId !== latestCatalogRequestIdRef.current) {
        return
      }

      if (cachedSnapshot?.value) {
        setLoading(false)
        return
      }

      setChannels([])
      setCurrentChannel(null)
      setError('Canli TV katalogu yuklenemedi')
      setLoading(false)
    }
  }, [applyCatalogPayload, isVodMode, selectedCountry])

  useEffect(() => {
    if (isVodMode || !user?.code) return
    if (restoredUserCodeRef.current === user.code) return

    restoredUserCodeRef.current = user.code
    const persistedState = readPersistedLivePageState(user.code)
    const restoredCountry = normalizeLiveCountryCode(persistedState?.selectedCountry)

    preferredChannelStateRef.current = {
      currentChannelId: String(persistedState?.currentChannelId || '').trim(),
      currentChannelKey: String(persistedState?.currentChannelKey || '').trim()
    }

    if (typeof persistedState?.searchQuery === 'string') {
      setSearchQuery(persistedState.searchQuery)
    }

    if (persistedState?.selectedCategory) {
      setSelectedCategory(String(persistedState.selectedCategory))
    }

    if (restoredCountry !== selectedCountry) {
      skipCategoryResetRef.current = true
      setSelectedCountry(restoredCountry)
    }

    if (token) {
      const cachedSnapshot = getCachedLiveCatalogSnapshot(user, token, {
        country: restoredCountry,
        ttlMs: LIVE_CATALOG_TTL_MS,
        allowStale: true
      })

      if (cachedSnapshot?.value) {
        applyCatalogPayload(cachedSnapshot.value, {
          requestedCountry: restoredCountry,
          preferredState: preferredChannelStateRef.current
        })
        setLoading(false)
        setError(null)
        hasBootstrappedCatalogRef.current = true
      }
    }
  }, [applyCatalogPayload, isVodMode, selectedCountry, token, user])

  useEffect(() => {
    if (isVodMode) return
    if (!hasAssignedPlaylist(user) || !token) return

    const hasCachedSnapshot = Boolean(getCachedLiveCatalogSnapshot(user, token, {
      country: selectedCountry,
      ttlMs: LIVE_CATALOG_TTL_MS,
      allowStale: true
    })?.value)

    void loadChannels({ background: hasCachedSnapshot })
  }, [isVodMode, loadChannels, selectedCountry, token, user])

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

  const resolveChannelLogoSource = useCallback(
    (channel) => {
      const logoKey = buildChannelLogoKey(channel)
      const remoteLogo = String(channel?.logo || '').trim()
      const fallbackLogo = resolveChannelFallbackLogo(channel)

      if (remoteLogo && !brokenLogoKeys.has(logoKey)) {
        return {
          src: remoteLogo,
          kind: 'remote'
        }
      }

      if (fallbackLogo && !brokenFallbackLogoKeys.has(logoKey)) {
        return {
          src: fallbackLogo,
          kind: 'fallback'
        }
      }

      return {
        src: '',
        kind: 'none'
      }
    },
    [brokenFallbackLogoKeys, brokenLogoKeys, buildChannelLogoKey]
  )

  const handleChannelLogoError = useCallback(
    (channel, sourceKind = 'remote') => {
      const key = buildChannelLogoKey(channel)

      if (sourceKind === 'fallback') {
        setBrokenFallbackLogoKeys((prev) => {
          if (prev.has(key)) return prev
          const next = new Set(prev)
          next.add(key)
          return next
        })
        return
      }

      setBrokenLogoKeys((prev) => {
        if (prev.has(key)) return prev
        const next = new Set(prev)
        next.add(key)
        return next
      })
    },
    [buildChannelLogoKey]
  )

  const currentChannelLogo = useMemo(
    () => resolveChannelLogoSource(currentChannel),
    [currentChannel, resolveChannelLogoSource]
  )

  const clearPlaybackStartupTimeout = useCallback(() => {
    if (playbackStartupTimeoutRef.current) {
      clearTimeout(playbackStartupTimeoutRef.current)
      playbackStartupTimeoutRef.current = null
    }
  }, [])

  const clearPlaybackRecoveryTimeout = useCallback(() => {
    if (playbackRecoveryTimeoutRef.current) {
      clearTimeout(playbackRecoveryTimeoutRef.current)
      playbackRecoveryTimeoutRef.current = null
    }
  }, [])

  const markPlaybackReady = useCallback(() => {
    playbackStartedRef.current = true
    clearPlaybackStartupTimeout()
    setLoading(false)
    setError(null)
  }, [clearPlaybackStartupTimeout])

  const nudgeVideoToLiveEdge = useCallback(() => {
    const video = videoRef.current
    if (!video) return false

    const targetTime = getLiveEdgeTime(video)
    if (!Number.isFinite(targetTime)) {
      return false
    }

    if (Math.abs(video.currentTime - targetTime) <= 0.5) {
      return false
    }

    try {
      video.currentTime = targetTime
      return true
    } catch {
      return false
    }
  }, [])

  const attemptVideoPlayback = useCallback(async ({ allowMutedFallback = true } = {}) => {
    const video = videoRef.current
    if (!video || typeof video.play !== 'function') {
      return false
    }

    const playOnce = async () => {
      const playResult = video.play()
      if (playResult?.then) {
        await playResult
      }
      return true
    }

    try {
      await playOnce()
      return true
    } catch (error) {
      const errorSignature = `${error?.name || ''} ${error?.message || ''}`.toLowerCase()
      const autoplayBlocked = (
        errorSignature.includes('notallowederror')
        || errorSignature.includes('not allowed')
        || errorSignature.includes('user didn')
        || errorSignature.includes('interact')
      )

      if (allowMutedFallback && autoplayBlocked && !video.muted) {
        video.muted = true
        setIsMuted(true)
        await new Promise((resolve) => setTimeout(resolve, LIVE_AUTOPLAY_RETRY_DELAY_MS))

        try {
          await playOnce()
          return true
        } catch {
          return false
        }
      }

      return false
    }
  }, [])

  const resumeLivePlayback = useCallback(() => {
    void attemptVideoPlayback()
  }, [attemptVideoPlayback])

  const downgradeHlsPlayback = useCallback((hlsInstance) => {
    if (!hlsInstance) {
      return false
    }

    const candidateIndices = [
      hlsInstance.currentLevel,
      hlsInstance.nextLevel,
      hlsInstance.loadLevel,
      hlsInstance.autoLevelCapping
    ].filter((value) => Number.isInteger(value) && value >= 0)

    const currentIndex = candidateIndices.length > 0
      ? Math.max(...candidateIndices)
      : Array.isArray(hlsInstance.levels) ? hlsInstance.levels.length - 1 : -1

    const nextLevelIndex = findLowerHlsLevelIndex(hlsInstance.levels || [], currentIndex, browserCapabilities)
    if (nextLevelIndex < 0) {
      return false
    }

    hlsInstance.autoLevelCapping = nextLevelIndex
    hlsInstance.currentLevel = nextLevelIndex
    hlsInstance.nextLevel = nextLevelIndex
    hlsInstance.loadLevel = nextLevelIndex

    return true
  }, [browserCapabilities])

  const recoverPlayback = useCallback(() => {
    if (isVodMode) return

    const video = videoRef.current
    if (!video) return

    nudgeVideoToLiveEdge()

    if (hlsPlayerRef.current) {
      try {
        hlsPlayerRef.current.startLoad(-1)
      } catch {
        // noop
      }

      if (video.readyState < 2) {
        try {
          hlsPlayerRef.current.recoverMediaError()
        } catch {
          // noop
        }
      }
    }

    if (playbackModeRef.current === 'mpegts' && playerRef.current) {
      try {
        playerRef.current.play()
      } catch {
        // noop
      }
    }

    resumeLivePlayback()
  }, [isVodMode, nudgeVideoToLiveEdge, resumeLivePlayback])

  const schedulePlaybackRecovery = useCallback((delayMs = 160) => {
    if (isVodMode) return

    clearPlaybackRecoveryTimeout()
    playbackRecoveryTimeoutRef.current = setTimeout(() => {
      playbackRecoveryTimeoutRef.current = null
      recoverPlayback()
    }, delayMs)
  }, [clearPlaybackRecoveryTimeout, isVodMode, recoverPlayback])

  const scheduleStartupWatchdog = useCallback((hlsInstance = null) => {
    clearPlaybackStartupTimeout()
    playbackStartupTimeoutRef.current = setTimeout(() => {
      playbackStartupTimeoutRef.current = null

      if (playbackStartedRef.current) {
        return
      }

      const video = videoRef.current
      if (!video) {
        return
      }

      if (getDecodedVideoFrameCount(video) > 0 || (!video.paused && video.readyState >= 2)) {
        markPlaybackReady()
        return
      }

      if (hlsInstance && downgradeHlsPlayback(hlsInstance)) {
        schedulePlaybackRecovery(80)
        scheduleStartupWatchdog(hlsInstance)
        return
      }

      void attemptVideoPlayback({ allowMutedFallback: !video.muted })
        .then((didStart) => {
          if (didStart) {
            scheduleStartupWatchdog(hlsInstance)
            return
          }

          setLoading(false)
          setError('Yayin baslatilamadi. Kanal codec olarak bu tarayici ile uyumsuz olabilir.')
        })
    }, LIVE_STARTUP_TIMEOUT_MS)
  }, [attemptVideoPlayback, clearPlaybackStartupTimeout, downgradeHlsPlayback, markPlaybackReady, schedulePlaybackRecovery])

  useEffect(() => () => {
    clearPlaybackStartupTimeout()
    clearPlaybackRecoveryTimeout()
  }, [clearPlaybackRecoveryTimeout, clearPlaybackStartupTimeout])

  useEffect(() => {
    if (isVodMode) return
    if (!currentChannel || !videoRef.current) return
    
    const video = videoRef.current
    const container = document.getElementById('video-container')
    const url = currentChannel.url
    const sourceType = String(currentChannel?.sourceType || '').trim().toLowerCase()
    const isHlsSource = sourceType === 'hls' || /\.m3u8(?:$|[?#])/i.test(url)
    const isMpegTsSource = sourceType === 'mpegts' || /(?:\.ts(?:$|[?#]))|(?:[?&]output=mpegts\b)/i.test(url)
    const preferNativeHls = isHlsSource && canPlayNativeHls(video) && (browserCapabilities.isSafari || browserCapabilities.isIOS)
    const supportsMpegTs = Boolean(mpegts?.getFeatureList?.().mseLivePlayback)
    const cleanupEntries = []

    const bindEvent = (target, eventName, handler, options) => {
      if (!target?.addEventListener || typeof handler !== 'function') return
      target.addEventListener(eventName, handler, options)
      cleanupEntries.push(() => target.removeEventListener(eventName, handler, options))
    }

    const bindWindowEvent = (eventName, handler, options) => {
      window.addEventListener(eventName, handler, options)
      cleanupEntries.push(() => window.removeEventListener(eventName, handler, options))
    }

    const teardownPlaybackBridges = () => {
      cleanupEntries.forEach((cleanup) => cleanup())
      cleanupEntries.length = 0
      nativePlaybackCleanupRef.current = () => {}
      clearPlaybackStartupTimeout()
      clearPlaybackRecoveryTimeout()
    }

    const handleResizeRecovery = () => {
      schedulePlaybackRecovery(180)
    }

    const handleUnexpectedPause = () => {
      if (document.hidden || video.ended) return
      schedulePlaybackRecovery(140)
    }

    nativePlaybackCleanupRef.current?.()
    playbackStartedRef.current = false
    clearPlaybackStartupTimeout()
    clearPlaybackRecoveryTimeout()
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

    video.setAttribute('playsinline', 'true')
    video.setAttribute('webkit-playsinline', 'true')
    video.preload = 'auto'
    video.muted = isMuted
    video.volume = volume

    bindEvent(video, 'playing', markPlaybackReady)
    bindEvent(video, 'loadeddata', markPlaybackReady)
    bindEvent(video, 'waiting', () => schedulePlaybackRecovery(140))
    bindEvent(video, 'stalled', () => schedulePlaybackRecovery(140))
    bindEvent(video, 'suspend', () => schedulePlaybackRecovery(180))
    bindEvent(video, 'pause', handleUnexpectedPause)
    bindWindowEvent('resize', handleResizeRecovery, { passive: true })
    bindWindowEvent('orientationchange', handleResizeRecovery)
    cleanupEntries.push(bindFullscreenChangeListeners(() => {
      window.setTimeout(handleResizeRecovery, 60)
    }))

    if (container && typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver(() => handleResizeRecovery())
      resizeObserver.observe(container)
      cleanupEntries.push(() => resizeObserver.disconnect())
    }

    nativePlaybackCleanupRef.current = teardownPlaybackBridges

    if (browserCapabilities.isInternetExplorer) {
      playbackModeRef.current = 'unsupported'
      setLoading(false)
      setError('Internet Explorer canli yayin altyapisini desteklemiyor. Safari, Chrome, Brave, Vivaldi veya Edge kullanin.')
      return teardownPlaybackBridges
    }
    
    if (preferNativeHls) {
      playbackModeRef.current = 'native-hls'
      bindEvent(video, 'loadedmetadata', () => {
        nudgeVideoToLiveEdge()
        resumeLivePlayback()
      }, { once: true })
      bindEvent(video, 'error', () => {
        clearPlaybackStartupTimeout()
        setLoading(false)
        setError('Yayin yuklenemedi')
      }, { once: true })

      video.src = url
      video.load()
      resumeLivePlayback()
      scheduleStartupWatchdog()
    /* legacy branch removed
      })
        if (data.fatal) setError('Yayın yüklenemedi')
    */ } else if (isHlsSource && Hls.isSupported()) {
      playbackModeRef.current = 'hls'
      const hls = new Hls({
        backBufferLength: 90,
        capLevelToPlayerSize: true,
        enableWorker: true,
        fragLoadingMaxRetry: 6,
        levelLoadingMaxRetry: 6,
        liveDurationInfinity: true,
        liveMaxLatencyDurationCount: 12,
        liveSyncDurationCount: 4,
        lowLatencyMode: false,
        manifestLoadingMaxRetry: 4,
        maxBufferLength: 60,
        maxLiveSyncPlaybackRate: 1.2,
        maxMaxBufferLength: 120,
        startLevel: 0,
        startFragPrefetch: true
      })
      hlsPlayerRef.current = hls
      hls.loadSource(url)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        const safeAutoLevelIndex = findSafeHlsAutoLevelIndex(hls.levels || [], browserCapabilities)
        if (safeAutoLevelIndex >= 0) {
          hls.autoLevelCapping = safeAutoLevelIndex
        }

        nudgeVideoToLiveEdge()
        resumeLivePlayback()
        scheduleStartupWatchdog(hls)
      })
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data?.fatal) {
          return
        }

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          schedulePlaybackRecovery(120)
          try {
            hls.startLoad(-1)
          } catch {
            // noop
          }
          return
        }

        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          if (downgradeHlsPlayback(hls)) {
            schedulePlaybackRecovery(60)
            scheduleStartupWatchdog(hls)
            return
          }

          schedulePlaybackRecovery(80)
          try {
            hls.recoverMediaError()
          } catch {
            // noop
          }
          return
        }

        if (downgradeHlsPlayback(hls)) {
          schedulePlaybackRecovery(80)
          scheduleStartupWatchdog(hls)
          return
        }

        clearPlaybackStartupTimeout()
        setLoading(false)
        setError('Yayin yuklenemedi')
      })
    } else if (isHlsSource && canPlayNativeHls(video)) {
      playbackModeRef.current = 'native-hls'
      bindEvent(video, 'loadedmetadata', () => {
        nudgeVideoToLiveEdge()
        resumeLivePlayback()
      }, { once: true })
      bindEvent(video, 'error', () => {
        clearPlaybackStartupTimeout()
        setLoading(false)
        setError('Yayin yuklenemedi')
      }, { once: true })

      video.src = url
      video.load()
      resumeLivePlayback()
      scheduleStartupWatchdog()
    } else if (isMpegTsSource && supportsMpegTs) {
      playbackModeRef.current = 'mpegts'
      const player = mpegts.createPlayer({
        type: 'mpegts',
        url: url,
        isLive: true
      })
      playerRef.current = player
      player.attachMediaElement(video)
      player.on(mpegts.Events.ERROR, () => {
        clearPlaybackStartupTimeout()
        setLoading(false)
        setError('Yayin yuklenemedi')
      })
      player.load()
      player.play()
        .then(() => {
          void attemptVideoPlayback({ allowMutedFallback: !video.muted })
          scheduleStartupWatchdog()
        })
        .catch(() => {
          clearPlaybackStartupTimeout()
          setLoading(false)
          setError('Yayin yuklenemedi')
        })
    } else {
      playbackModeRef.current = 'unsupported'
      setLoading(false)
      setError('Tarayici bu yayin formatini desteklemiyor')
    }
    
    return () => {
      teardownPlaybackBridges()
      hlsPlayerRef.current?.destroy()
      hlsPlayerRef.current = null
      playerRef.current?.destroy()
      playerRef.current = null
    }
  }, [
    browserCapabilities.isIOS,
    browserCapabilities.isInternetExplorer,
    browserCapabilities.isSafari,
    browserCapabilities,
    clearPlaybackStartupTimeout,
    clearPlaybackRecoveryTimeout,
    currentChannel,
    downgradeHlsPlayback,
    isVodMode,
    isMuted,
    markPlaybackReady,
    nudgeVideoToLiveEdge,
    attemptVideoPlayback,
    resumeLivePlayback,
    schedulePlaybackRecovery,
    scheduleStartupWatchdog,
    volume
  ])

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
    const video = videoRef.current

    if (!container) return

    const fullscreenAction = isFullscreenActive(document)
      ? exitElementFullscreen(document)
      : requestElementFullscreen(container, video)

    Promise.resolve(fullscreenAction)
      .catch(() => {})
      .finally(() => {
        schedulePlaybackRecovery(180)
      })
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
                {visibleCountries.map((country) => (
                  <button
                    key={country.code}
                    onClick={() => setSelectedCountry(country.code)}
                    className="px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap"
                    style={{
                      backgroundColor: selectedCountry === country.code ? PRIMARY : 'rgba(255,255,255,0.08)',
                      color: 'white'
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
              {/* Video Container - Smaller */}
              <div 
                id="video-container"
                className="relative rounded-xl overflow-hidden flex-shrink-0"
                style={{ 
                  backgroundColor: '#000',
                  aspectRatio: '16/9',
                  maxHeight: '65vh'
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
                    {currentChannelLogo.src ? (
                      <img
                        src={currentChannelLogo.src}
                        alt=""
                        className="w-8 h-8 object-contain"
                        onError={() => handleChannelLogoError(currentChannel, currentChannelLogo.kind)}
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
                    const channelLogo = resolveChannelLogoSource(channel)
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
                          {channelLogo.src ? (
                            <img
                              src={channelLogo.src}
                              alt=""
                              loading="lazy"
                              onError={() => handleChannelLogoError(channel, channelLogo.kind)}
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
