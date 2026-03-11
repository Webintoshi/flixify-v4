import { apiFetch, buildApiUrl, normalizeApiResourceUrl } from '../config/api'
import {
  parseSeriesFromPlaylist,
  groupSeriesEpisodes,
  parseMoviesFromPlaylist,
  dedupeByTitle
} from '../utils/playlistParser'
import { buildLiveCatalogFromPlaylist } from '../utils/liveCatalogBuilder'

const PLAYLIST_RAW_CACHE_PREFIX = 'iptv_playlist_raw_v2_'
const PLAYLIST_PARSED_CACHE_PREFIX = 'iptv_playlist_parsed_v2_'
const CATALOG_CACHE_PREFIX = 'iptv_catalog_v1_'
const DEFAULT_TTL_MS = 5 * 60 * 1000
const PLAYLIST_PATH_FIXES = [
  ['/playlisth/', '/playlist/'],
  ['/playlists/', '/playlist/']
]
const PLAYLIST_DELIVERY_MODES = new Set(['proxy', 'direct', 'hybrid'])

const rawMemoryCache = new Map()
const parsedMemoryCache = new Map()
const catalogMemoryCache = new Map()
const inflightPlaylistRequests = new Map()
const inflightCatalogRequests = new Map()
const API_PROXY_RESOURCE_PATTERN = /(^|\/)api\/v1\/(?:stream\/|m3u\/logo\/|m3u\/[^/?#]+\.m3u(?:[?#]|$)|vod\/)/i

function canUseSessionStorage() {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'
}

function now() {
  return Date.now()
}

function tokenFingerprint(token) {
  const normalized = String(token || '').trim()
  if (!normalized) {
    return 'anon'
  }
  const parts = normalized.split('.')
  const signaturePart = parts[2] || parts[1] || normalized
  return signaturePart.slice(-16)
}

function normalizeScope(scope) {
  return String(scope || 'full').toLowerCase() === 'live' ? 'live' : 'full'
}

function normalizeDeliveryMode(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return PLAYLIST_DELIVERY_MODES.has(normalized) ? normalized : null
}

function resolvePlaylistDeliveryMode(user, requestedMode = null) {
  const explicitMode = normalizeDeliveryMode(requestedMode)
  if (explicitMode) {
    return explicitMode
  }

  const userMode = normalizeDeliveryMode(user?.playlistDeliveryMode)
  if (userMode) {
    return userMode
  }

  return user?.m3uDirectUrl ? 'hybrid' : 'proxy'
}

function normalizePathSegments(value) {
  return PLAYLIST_PATH_FIXES.reduce(
    (current, [needle, replacement]) => current.replace(needle, replacement),
    String(value || '').trim()
  )
}

function shouldForceHlsOutput(urlObject) {
  if (!urlObject) {
    return false
  }

  const pathname = String(urlObject.pathname || '').toLowerCase()
  return pathname.includes('/playlist/') && pathname.includes('m3u_plus')
}

function normalizeDirectPlaylistUrl(value) {
  if (!value || typeof value !== 'string') {
    return ''
  }

  const normalizedRaw = normalizePathSegments(value)

  try {
    const parsed = new URL(normalizedRaw)
    if (shouldForceHlsOutput(parsed)) {
      parsed.searchParams.set('output', 'hls')
    }
    return parsed.toString()
  } catch {
    return normalizedRaw
  }
}

function applyPlaylistScope(url, scope = 'full') {
  if (!url || normalizeScope(scope) !== 'live') {
    return url
  }

  try {
    const parsed = new URL(url)
    const pathname = String(parsed.pathname || '').toLowerCase()
    if (
      parsed.searchParams.has('output') ||
      (pathname.includes('/playlist/') && pathname.includes('m3u_plus')) ||
      pathname.endsWith('/get.php')
    ) {
      parsed.searchParams.set('output', 'hls')
    }
    return parsed.toString()
  } catch {
    return url
  }
}

function buildProxyPlaylistUrl(userCode, options = {}) {
  const { forceRefresh = false, disableCache = false, scope = 'full' } = options
  const normalizedScope = normalizeScope(scope)
  const queryParams = new URLSearchParams()

  if (forceRefresh || disableCache) {
    queryParams.set('forceRefresh', 'true')
  }

  if (normalizedScope === 'live') {
    queryParams.set('scope', 'live')
  }

  const playlistQuery = queryParams.toString() ? `?${queryParams.toString()}` : ''
  return buildApiUrl(`/m3u/${userCode}.m3u${playlistQuery}`)
}

function buildDirectPlaylistUrl(user, scope = 'full') {
  const directUrl = String(user?.m3uDirectUrl || '').trim()
  if (!directUrl) {
    return ''
  }

  const normalized = normalizeDirectPlaylistUrl(directUrl)

  try {
    const parsed = new URL(normalized)
    if (parsed.protocol !== 'https:') {
      return ''
    }

    return applyPlaylistScope(parsed.toString(), scope)
  } catch {
    return ''
  }
}

function buildPlaylistSources(user, options = {}) {
  const { forceRefresh = false, disableCache = false, scope = 'full', deliveryMode = null } = options
  const resolvedMode = resolvePlaylistDeliveryMode(user, deliveryMode)
  const normalizedScope = normalizeScope(scope)
  const directUrl = buildDirectPlaylistUrl(user, normalizedScope)
  const proxyUrl = buildProxyPlaylistUrl(user?.code, {
    forceRefresh,
    disableCache,
    scope: normalizedScope
  })

  if (resolvedMode === 'direct') {
    if (!directUrl) {
      throw new Error('Provider HTTPS playlist URL hazir degil.')
    }

    return [{ mode: 'direct', url: directUrl }]
  }

  if (resolvedMode === 'proxy') {
    return [{ mode: 'proxy', url: proxyUrl }]
  }

  return directUrl
    ? [
      { mode: 'direct', url: directUrl },
      { mode: 'proxy', url: proxyUrl }
    ]
    : [{ mode: 'proxy', url: proxyUrl }]
}

async function fetchPlaylistSource(source, token, signal, options = {}) {
  const { disableCache = false } = options
  const isDirectSource = source?.mode === 'direct'
  const headers = isDirectSource
    ? {
      Accept: 'application/vnd.apple.mpegurl, application/x-mpegurl, text/plain, */*',
      'Cache-Control': disableCache ? 'no-cache, no-store, max-age=0' : 'no-cache',
      Pragma: 'no-cache'
    }
    : {
      Authorization: `Bearer ${token}`,
      'Cache-Control': disableCache ? 'no-cache, no-store, max-age=0' : 'no-cache',
      Pragma: 'no-cache'
    }

  const response = isDirectSource
    ? await fetch(source.url, {
      signal,
      headers,
      credentials: 'omit',
      cache: 'no-store'
    })
    : await apiFetch(source.url, {
      signal,
      headers,
      credentials: 'same-origin',
      cache: disableCache ? 'no-store' : 'default'
    })

  if (!response.ok) {
    const statusError = new Error(
      isDirectSource
        ? `Provider playlist yuklenemedi (HTTP ${response.status})`
        : `Playlist yuklenemedi (HTTP ${response.status})`
    )
    statusError.status = response.status
    throw statusError
  }

  const text = await response.text()

  if (!text || !text.trim()) {
    throw new Error('Playlist bos dondu')
  }

  return text
}

function buildRawCacheKey(userCode, tokenKey, scope = 'full', deliveryMode = 'proxy') {
  return `${PLAYLIST_RAW_CACHE_PREFIX}${deliveryMode}_${scope}_${userCode}_${tokenKey}`
}

function buildParsedCacheKey(userCode, tokenKey, cacheKey, scope = 'full', deliveryMode = 'proxy') {
  return `${PLAYLIST_PARSED_CACHE_PREFIX}${deliveryMode}_${scope}_${userCode}_${tokenKey}_${cacheKey}`
}

function buildCatalogCacheKey(userCode, tokenKey, catalogType, variant = 'default', deliveryMode = 'proxy') {
  return `${CATALOG_CACHE_PREFIX}${deliveryMode}_${catalogType}_${userCode}_${tokenKey}_${variant}`
}

function getFreshCacheEntry(cacheMap, key, ttlMs) {
  const entry = cacheMap.get(key)
  if (!entry) return null
  if (now() - entry.timestamp > ttlMs) {
    return null
  }
  return entry.value
}

function getStaleMemoryCacheEntry(cacheMap, key) {
  const entry = cacheMap.get(key)
  return entry?.value || null
}

function setMemoryCacheEntry(cacheMap, key, value) {
  cacheMap.set(key, {
    value,
    timestamp: now()
  })
  return value
}

function getFreshMemoryCacheRecord(cacheMap, key, ttlMs) {
  const entry = cacheMap.get(key)
  if (!entry) return null
  if (now() - entry.timestamp > ttlMs) {
    return null
  }
  return entry
}

function getStaleMemoryCacheRecord(cacheMap, key) {
  return cacheMap.get(key) || null
}

function getSessionCacheEntry(key, ttlMs) {
  if (!canUseSessionStorage()) return null

  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null

    const parsed = JSON.parse(raw)
    if (!parsed?.timestamp || now() - parsed.timestamp > ttlMs) {
      sessionStorage.removeItem(key)
      return null
    }

    return parsed.value
  } catch {
    return null
  }
}

function getStaleSessionCacheEntry(key) {
  if (!canUseSessionStorage()) return null

  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null

    const parsed = JSON.parse(raw)
    return parsed?.value || null
  } catch {
    return null
  }
}

function setSessionCacheEntry(key, value) {
  if (!canUseSessionStorage()) return value

  try {
    sessionStorage.setItem(
      key,
      JSON.stringify({
        value,
        timestamp: now()
      })
    )
  } catch {
    // ignore quota/cache write issues
  }

  return value
}

function getFreshSessionCacheRecord(key, ttlMs) {
  if (!canUseSessionStorage()) return null

  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null

    const parsed = JSON.parse(raw)
    if (!parsed?.timestamp || now() - parsed.timestamp > ttlMs) {
      sessionStorage.removeItem(key)
      return null
    }

    return parsed
  } catch {
    return null
  }
}

function getStaleSessionCacheRecord(key) {
  if (!canUseSessionStorage()) return null

  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null

    return JSON.parse(raw)
  } catch {
    return null
  }
}

function getCachedEntry(cacheMap, key, ttlMs) {
  const memoryValue = getFreshCacheEntry(cacheMap, key, ttlMs)
  if (memoryValue) return memoryValue

  const sessionValue = getSessionCacheEntry(key, ttlMs)
  if (sessionValue) {
    setMemoryCacheEntry(cacheMap, key, sessionValue)
    return sessionValue
  }

  return null
}

function getAnyCachedEntry(cacheMap, key) {
  const memoryValue = getStaleMemoryCacheEntry(cacheMap, key)
  if (memoryValue) return memoryValue

  const sessionValue = getStaleSessionCacheEntry(key)
  if (sessionValue) {
    setMemoryCacheEntry(cacheMap, key, sessionValue)
    return sessionValue
  }

  return null
}

function cacheEntry(cacheMap, key, value) {
  setMemoryCacheEntry(cacheMap, key, value)
  setSessionCacheEntry(key, value)
  return value
}

function getCachedValueSnapshot(cacheMap, key, ttlMs, allowStale = true) {
  const freshMemoryRecord = getFreshMemoryCacheRecord(cacheMap, key, ttlMs)
  if (freshMemoryRecord) {
    return {
      value: freshMemoryRecord.value,
      timestamp: freshMemoryRecord.timestamp,
      isStale: false
    }
  }

  const freshSessionRecord = getFreshSessionCacheRecord(key, ttlMs)
  if (freshSessionRecord?.value !== undefined) {
    cacheMap.set(key, freshSessionRecord)
    return {
      value: freshSessionRecord.value,
      timestamp: freshSessionRecord.timestamp,
      isStale: false
    }
  }

  if (!allowStale) {
    return null
  }

  const staleMemoryRecord = getStaleMemoryCacheRecord(cacheMap, key)
  if (staleMemoryRecord) {
    return {
      value: staleMemoryRecord.value,
      timestamp: staleMemoryRecord.timestamp,
      isStale: true
    }
  }

  const staleSessionRecord = getStaleSessionCacheRecord(key)
  if (staleSessionRecord?.value !== undefined) {
    cacheMap.set(key, staleSessionRecord)
    return {
      value: staleSessionRecord.value,
      timestamp: staleSessionRecord.timestamp,
      isStale: true
    }
  }

  return null
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function uniqueStringList(values = []) {
  const seen = new Set()
  const result = []

  values.forEach((value) => {
    if (!value || typeof value !== 'string') {
      return
    }

    const normalized = value.trim()
    if (!normalized || seen.has(normalized)) {
      return
    }

    seen.add(normalized)
    result.push(normalized)
  })

  return result
}

function normalizeProxyResourceUrl(value) {
  const normalized = String(value || '').trim()
  if (!normalized) {
    return ''
  }

  if (!API_PROXY_RESOURCE_PATTERN.test(normalized)) {
    return normalized
  }

  return normalizeApiResourceUrl(normalized)
}

function normalizeEpisodeItemUrls(episode = {}) {
  return {
    ...episode,
    logo: normalizeProxyResourceUrl(episode?.logo),
    url: normalizeProxyResourceUrl(episode?.url)
  }
}

function normalizeSeriesCatalogItemUrls(series = {}) {
  const seasons = series?.seasons && typeof series.seasons === 'object'
    ? Object.fromEntries(
      Object.entries(series.seasons).map(([seasonKey, episodes]) => ([
        seasonKey,
        Array.isArray(episodes) ? episodes.map((episode) => normalizeEpisodeItemUrls(episode)) : []
      ]))
    )
    : {}

  return {
    ...series,
    logo: normalizeProxyResourceUrl(series?.logo),
    logoCandidates: uniqueStringList(series?.logoCandidates).map((value) => normalizeProxyResourceUrl(value)),
    firstEpisode: series?.firstEpisode ? normalizeEpisodeItemUrls(series.firstEpisode) : series?.firstEpisode || null,
    seasons
  }
}

function normalizeMovieCatalogItemUrls(movie = {}) {
  return {
    ...movie,
    logo: normalizeProxyResourceUrl(movie?.logo),
    logoCandidates: uniqueStringList(movie?.logoCandidates).map((value) => normalizeProxyResourceUrl(value)),
    url: normalizeProxyResourceUrl(movie?.url)
  }
}

function normalizeLiveCatalogPayloadUrls(payload = {}) {
  const items = Array.isArray(payload?.items)
    ? payload.items.map((item) => ({
      ...item,
      logo: normalizeProxyResourceUrl(item?.logo),
      url: normalizeProxyResourceUrl(item?.url)
    }))
    : []

  return {
    ...payload,
    items
  }
}

function normalizeCatalogPayloadUrls(catalogType, payload) {
  if (catalogType === 'live') {
    return normalizeLiveCatalogPayloadUrls(payload)
  }

  if (!Array.isArray(payload)) {
    if (catalogType === 'series' && payload && typeof payload === 'object') {
      return normalizeSeriesCatalogItemUrls(payload)
    }

    if (catalogType === 'movies' && payload && typeof payload === 'object') {
      return normalizeMovieCatalogItemUrls(payload)
    }

    return payload
  }

  if (catalogType === 'series') {
    return payload.map((series) => normalizeSeriesCatalogItemUrls(series))
  }

  if (catalogType === 'movies') {
    return payload.map((movie) => normalizeMovieCatalogItemUrls(movie))
  }

  return payload
}

function normalizeSeriesName(value) {
  return String(value || '').trim().toLowerCase()
}

function toSeriesSummaryItem(series = {}) {
  const seasons = series?.seasons && typeof series.seasons === 'object' ? series.seasons : {}
  const seasonKeys = Object.keys(seasons)
    .map((seasonKey) => Number.parseInt(seasonKey, 10))
    .filter((seasonNumber) => Number.isFinite(seasonNumber))
    .sort((left, right) => left - right)

  let episodeCount = 0
  let firstEpisode = null

  seasonKeys.forEach((seasonNumber) => {
    const seasonEpisodes = Array.isArray(seasons[seasonNumber]) ? seasons[seasonNumber] : []
    episodeCount += seasonEpisodes.length

    if (!firstEpisode && seasonEpisodes.length > 0) {
      const first = seasonEpisodes[0]
      firstEpisode = {
        id: first?.id || '',
        seriesName: first?.seriesName || series?.name || '',
        season: first?.season || seasonNumber,
        episode: first?.episode || 1,
        fullTitle: first?.fullTitle || '',
        logo: first?.logo || series?.logo || '',
        genre: first?.genre || series?.genre || '',
        url: first?.url || ''
      }
    }
  })

  const logoCandidates = uniqueStringList([series?.logo, ...(Array.isArray(series?.logoCandidates) ? series.logoCandidates : [])]).slice(0, 8)

  return {
    name: String(series?.name || ''),
    genre: String(series?.genre || ''),
    logo: logoCandidates[0] || '',
    logoCandidates,
    seasonCount: seasonKeys.length,
    episodeCount,
    firstEpisode
  }
}

function buildCatalogVariant(catalogType, options = {}) {
  if (catalogType !== 'series') {
    return 'default'
  }

  const compact = Boolean(options.compact)
  const seriesName = String(options.seriesName || '').trim()
  if (seriesName) {
    return `detail:${normalizeSeriesName(seriesName)}`
  }

  if (compact) {
    return 'compact'
  }

  return 'default'
}

function transformSeriesCatalogPayload(items, options = {}) {
  const compact = Boolean(options.compact)
  const seriesName = String(options.seriesName || '').trim()

  if (!Array.isArray(items)) {
    return compact ? [] : items
  }

  if (seriesName) {
    const selected = items.find((series) => normalizeSeriesName(series?.name) === normalizeSeriesName(seriesName))
    return selected || null
  }

  if (compact) {
    return items.map((series) => toSeriesSummaryItem(series))
  }

  return items
}

function buildSeriesCatalogFallback(playlistText) {
  const grouped = groupSeriesEpisodes(parseSeriesFromPlaylist(playlistText))

  return grouped
    .map((series) => {
      const episodeLogos = Object.values(series?.seasons || {})
        .flat()
        .map((episodeItem) => episodeItem?.logo)
      const logoCandidates = uniqueStringList([series.logo, ...episodeLogos])

      return {
        ...series,
        logo: logoCandidates[0] || series.logo || '',
        logoCandidates
      }
    })
    .sort((left, right) => String(left?.name || '').localeCompare(String(right?.name || ''), 'tr'))
}

function buildMoviesCatalogFallback(playlistText) {
  const movies = dedupeByTitle(parseMoviesFromPlaylist(playlistText))

  return movies
    .map((movie) => {
      const logoCandidates = uniqueStringList([movie.logo])
      return {
        ...movie,
        logo: logoCandidates[0] || '',
        logoCandidates
      }
    })
    .sort((left, right) => String(left?.title || '').localeCompare(String(right?.title || ''), 'tr'))
}

async function fetchCatalogFallback(user, token, catalogType, options = {}) {
  const {
    forceRefresh = false,
    ttlMs = DEFAULT_TTL_MS,
    signal,
    compact = false,
    seriesName = '',
    deliveryMode = null
  } = options
  const parser =
    catalogType === 'series'
      ? buildSeriesCatalogFallback
      : buildMoviesCatalogFallback

  const parsed = await fetchParsedPlaylist(user, token, {
    cacheKey: `catalog-fallback:${catalogType}:v1`,
    parser,
    forceRefresh,
    ttlMs,
    signal,
    deliveryMode
  })

  if (catalogType !== 'series') {
    return parsed
  }

  return transformSeriesCatalogPayload(parsed, { compact, seriesName })
}

async function fetchLiveCatalogFallback(user, token, options = {}) {
  const {
    signal,
    country = 'TR',
    forceRefresh = false,
    ttlMs = DEFAULT_TTL_MS,
    disableCache = false,
    deliveryMode = null
  } = options

  return fetchParsedPlaylist(user, token, {
    cacheKey: `catalog-fallback:live:${String(country || 'TR').trim().toUpperCase()}:v1`,
    parser: (playlistText) => buildLiveCatalogFromPlaylist(playlistText, country),
    forceRefresh,
    disableCache,
    ttlMs,
    signal,
    scope: 'live',
    deliveryMode
  })
}

function invalidateMapByFragments(cacheMap, fragments = []) {
  for (const key of cacheMap.keys()) {
    if (fragments.every((fragment) => key.includes(fragment))) {
      cacheMap.delete(key)
    }
  }
}

function invalidateSessionByFragments(fragments = []) {
  if (!canUseSessionStorage()) return
  try {
    Object.keys(sessionStorage)
      .filter((key) => fragments.every((fragment) => key.includes(fragment)))
      .forEach((key) => sessionStorage.removeItem(key))
  } catch {
    // ignore
  }
}

export function invalidatePlaylistCache(userCode) {
  if (!userCode) return

  const userMarker = `_${userCode}_`

  invalidateMapByFragments(rawMemoryCache, [PLAYLIST_RAW_CACHE_PREFIX, userMarker])
  invalidateMapByFragments(parsedMemoryCache, [PLAYLIST_PARSED_CACHE_PREFIX, userMarker])
  invalidateMapByFragments(catalogMemoryCache, [CATALOG_CACHE_PREFIX, userMarker])

  invalidateSessionByFragments([PLAYLIST_RAW_CACHE_PREFIX, userMarker])
  invalidateSessionByFragments([PLAYLIST_PARSED_CACHE_PREFIX, userMarker])
  invalidateSessionByFragments([CATALOG_CACHE_PREFIX, userMarker])
}

export function hasAssignedPlaylist(user) {
  return Boolean(user?.hasM3U ?? user?.m3uUrl)
}

export function hasValidSubscription(user) {
  if (!user) return false
  const hasExpiry = user.expiresAt && new Date(user.expiresAt) > new Date()
  return hasExpiry && hasAssignedPlaylist(user)
}

export async function fetchUserPlaylist(user, token, options = {}) {
  const {
    signal,
    forceRefresh = false,
    disableCache = false,
    scope = 'full',
    ttlMs = DEFAULT_TTL_MS,
    retries = 1,
    deliveryMode = null
  } = options

  if (!user?.code) {
    throw new Error('Kullanici kodu bulunamadi')
  }

  if (!token) {
    throw new Error('Oturum bulunamadi')
  }

  const tokenKey = tokenFingerprint(token)
  const normalizedScope = normalizeScope(scope)
  const resolvedDeliveryMode = resolvePlaylistDeliveryMode(user, deliveryMode)
  const isLiveScope = normalizedScope === 'live'
  const shouldUseCache = !disableCache && !forceRefresh && !isLiveScope
  const shouldStoreCache = !disableCache && !isLiveScope
  const rawCacheKey = buildRawCacheKey(user.code, tokenKey, normalizedScope, resolvedDeliveryMode)
  const cached = shouldUseCache ? getCachedEntry(rawMemoryCache, rawCacheKey, ttlMs) : null
  const staleCached = shouldStoreCache ? getAnyCachedEntry(rawMemoryCache, rawCacheKey) : null

  if (cached) {
    return cached
  }

  const inflightKey = `playlist:${resolvedDeliveryMode}:${user.code}:${tokenKey}:${normalizedScope}:${forceRefresh || disableCache ? 'refresh' : 'cached'}`
  if (!forceRefresh && !disableCache && inflightPlaylistRequests.has(inflightKey)) {
    return inflightPlaylistRequests.get(inflightKey)
  }

  const requestPromise = (async () => {
    let lastError = null

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const sources = buildPlaylistSources(user, {
          forceRefresh,
          disableCache,
          scope: normalizedScope,
          deliveryMode: resolvedDeliveryMode
        })

        for (const source of sources) {
          try {
            const text = await fetchPlaylistSource(source, token, signal, {
              disableCache: disableCache || isLiveScope
            })
            return shouldStoreCache ? cacheEntry(rawMemoryCache, rawCacheKey, text) : text
          } catch (sourceError) {
            if (source.mode === 'proxy') {
              if (sourceError?.status === 401) {
                throw new Error('Oturum suresi dolmus. Lutfen tekrar giris yapin.')
              }
              if (sourceError?.status === 403) {
                throw new Error('Aktif paket veya M3U atamasi gerekiyor.')
              }
              if (sourceError?.status === 404) {
                throw new Error('Playlist bulunamadi.')
              }
            }

            lastError = sourceError
          }
        }
      } catch (error) {
        lastError = error

        const isAbort = signal?.aborted
        const isTransient =
          error?.status >= 500 ||
          /Failed to fetch/i.test(error?.message || '') ||
          /bos dondu/i.test(error?.message || '')

        if (isAbort) {
          throw error
        }

        if (attempt < retries && isTransient) {
          await delay(600)
          continue
        }

        if (shouldStoreCache && staleCached && (isTransient || error?.status === 404)) {
          return staleCached
        }

        throw error
      }
    }

    throw lastError || new Error('Playlist yuklenemedi')
  })()

  inflightPlaylistRequests.set(inflightKey, requestPromise)

  try {
    return await requestPromise
  } finally {
    inflightPlaylistRequests.delete(inflightKey)
  }
}

export async function fetchParsedPlaylist(user, token, options = {}) {
  const {
    cacheKey,
    parser,
    forceRefresh = false,
    disableCache = false,
    scope = 'full',
    ttlMs = DEFAULT_TTL_MS,
    signal,
    deliveryMode = null
  } = options

  if (!cacheKey) {
    throw new Error('Playlist cache key gerekli')
  }

  if (typeof parser !== 'function') {
    throw new Error('Playlist parser gerekli')
  }

  if (!user?.code) {
    throw new Error('Kullanici kodu bulunamadi')
  }

  const tokenKey = tokenFingerprint(token)
  const normalizedScope = normalizeScope(scope)
  const resolvedDeliveryMode = resolvePlaylistDeliveryMode(user, deliveryMode)
  const isLiveScope = normalizedScope === 'live'
  const shouldUseCache = !disableCache && !forceRefresh && !isLiveScope
  const shouldStoreCache = !disableCache && !isLiveScope
  const parsedCacheKey = buildParsedCacheKey(user.code, tokenKey, cacheKey, normalizedScope, resolvedDeliveryMode)
  const cached = shouldUseCache ? getCachedEntry(parsedMemoryCache, parsedCacheKey, ttlMs) : null
  const staleCached = shouldStoreCache ? getAnyCachedEntry(parsedMemoryCache, parsedCacheKey) : null

  if (cached) {
    return cached
  }

  try {
    const text = await fetchUserPlaylist(user, token, {
      forceRefresh,
      disableCache,
      scope: normalizedScope,
      ttlMs,
      signal,
      deliveryMode: resolvedDeliveryMode
    })

    const parsed = parser(text)
    return shouldStoreCache ? cacheEntry(parsedMemoryCache, parsedCacheKey, parsed) : parsed
  } catch (error) {
    if (shouldStoreCache && staleCached) {
      return staleCached
    }

    throw error
  }
}

async function fetchCatalog(user, token, catalogType, options = {}) {
  const {
    signal,
    forceRefresh = false,
    ttlMs = DEFAULT_TTL_MS,
    retries = 1,
    compact = false,
    seriesName = '',
    deliveryMode = null,
    preferCatalogApi = true
  } = options

  if (!['series', 'movies'].includes(catalogType)) {
    throw new Error('Gecersiz katalog tipi')
  }

  if (!user?.code) {
    throw new Error('Kullanici kodu bulunamadi')
  }

  if (!token) {
    throw new Error('Oturum bulunamadi')
  }

  const tokenKey = tokenFingerprint(token)
  const resolvedDeliveryMode = resolvePlaylistDeliveryMode(user, deliveryMode)
  const catalogVariant = buildCatalogVariant(catalogType, { compact, seriesName })
  const catalogCacheKey = buildCatalogCacheKey(user.code, tokenKey, catalogType, catalogVariant, resolvedDeliveryMode)
  const cached = !forceRefresh ? getCachedEntry(catalogMemoryCache, catalogCacheKey, ttlMs) : null
  const staleCached = getAnyCachedEntry(catalogMemoryCache, catalogCacheKey)

  if (cached) {
    return cached
  }

  if (!preferCatalogApi && resolvedDeliveryMode !== 'proxy') {
      const directRequest = fetchCatalogFallback(user, token, catalogType, {
        signal,
        forceRefresh,
        ttlMs,
        compact,
        seriesName,
        deliveryMode: resolvedDeliveryMode
    }).then((items) => {
      const normalizedItems = normalizeCatalogPayloadUrls(catalogType, items)
      return cacheEntry(catalogMemoryCache, catalogCacheKey, normalizedItems)
    })

    return directRequest.catch((error) => {
      if (staleCached) {
        return staleCached
      }

      throw error
    })
  }

  const queryParams = new URLSearchParams()
  if (forceRefresh) {
    queryParams.set('forceRefresh', 'true')
  }
  if (catalogType === 'series' && compact) {
    queryParams.set('compact', 'true')
  }
  if (catalogType === 'series' && String(seriesName || '').trim()) {
    queryParams.set('seriesName', String(seriesName).trim())
  }
  const query = queryParams.toString()
  const endpoint = buildApiUrl(`/catalog/${catalogType}${query ? `?${query}` : ''}`)
  const inflightKey = `catalog:${resolvedDeliveryMode}:${catalogType}:${catalogVariant}:${user.code}:${tokenKey}:${forceRefresh ? 'refresh' : 'cached'}`

  if (!forceRefresh && inflightCatalogRequests.has(inflightKey)) {
    return inflightCatalogRequests.get(inflightKey)
  }

  const requestPromise = (async () => {
    let lastError = null

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await apiFetch(endpoint, {
          signal,
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })

        if (!response.ok) {
          if (response.status === 404) {
            const fallbackItems = await fetchCatalogFallback(user, token, catalogType, {
              signal,
              forceRefresh,
              ttlMs,
              compact,
              seriesName,
              deliveryMode: resolvedDeliveryMode
            })
            const normalizedFallbackItems = normalizeCatalogPayloadUrls(catalogType, fallbackItems)
            return cacheEntry(catalogMemoryCache, catalogCacheKey, normalizedFallbackItems)
          }

          const payload = await response.json().catch(() => ({}))
          const message = payload?.message || `Katalog yuklenemedi (HTTP ${response.status})`
          const error = new Error(message)
          error.status = response.status
          throw error
        }

        const payload = await response.json().catch(() => ({}))
        let result
        if (catalogType === 'series' && String(seriesName || '').trim()) {
          result = payload?.data?.item || null
        } else {
          const items = Array.isArray(payload?.data?.items) ? payload.data.items : []
          result = catalogType === 'series'
            ? transformSeriesCatalogPayload(items, { compact })
            : items
        }

        const normalizedResult = normalizeCatalogPayloadUrls(catalogType, result)
        return cacheEntry(catalogMemoryCache, catalogCacheKey, normalizedResult)
      } catch (error) {
        lastError = error

        const isAbort = signal?.aborted
        const isTransient =
          error?.status >= 500 ||
          /Failed to fetch/i.test(error?.message || '')
        const canUseStaleCache = isTransient || error?.status === 404

        if (isAbort) {
          throw error
        }

        if (resolvedDeliveryMode !== 'proxy') {
          try {
            const fallbackItems = await fetchCatalogFallback(user, token, catalogType, {
              signal,
              forceRefresh,
              ttlMs,
              compact,
              seriesName,
              deliveryMode: resolvedDeliveryMode
            })

            const normalizedFallbackItems = normalizeCatalogPayloadUrls(catalogType, fallbackItems)
            return cacheEntry(catalogMemoryCache, catalogCacheKey, normalizedFallbackItems)
          } catch (fallbackError) {
            lastError = fallbackError
          }
        }

        if (attempt < retries && isTransient) {
          await delay(600)
          continue
        }

        if (staleCached && canUseStaleCache) {
          return normalizeCatalogPayloadUrls(catalogType, staleCached)
        }

        throw error
      }
    }

    throw lastError || new Error('Katalog yuklenemedi')
  })()

  inflightCatalogRequests.set(inflightKey, requestPromise)

  try {
    return await requestPromise
  } finally {
    inflightCatalogRequests.delete(inflightKey)
  }
}

export async function fetchLiveCatalog(user, token, options = {}) {
  const {
    signal,
    country = 'TR',
    forceRefresh = false,
    disableCache = false,
    ttlMs = DEFAULT_TTL_MS,
    retries = 1
  } = options

  if (!user?.code) {
    throw new Error('Kullanici kodu bulunamadi')
  }

  if (!token) {
    throw new Error('Oturum bulunamadi')
  }

  const normalizedCountry = String(country || 'TR').trim().toUpperCase() || 'TR'
  const resolvedDeliveryMode = resolvePlaylistDeliveryMode(user)
  const tokenKey = tokenFingerprint(token)
  const catalogVariant = `country:${normalizedCountry}`
  const catalogCacheKey = buildCatalogCacheKey(user.code, tokenKey, 'live', catalogVariant, resolvedDeliveryMode)
  const shouldUseCache = !disableCache && !forceRefresh && ttlMs > 0
  const shouldStoreCache = !disableCache && ttlMs > 0
  const cached = shouldUseCache ? getCachedEntry(catalogMemoryCache, catalogCacheKey, ttlMs) : null
  const staleCached = shouldStoreCache ? getAnyCachedEntry(catalogMemoryCache, catalogCacheKey) : null

  if (cached) {
    return normalizeCatalogPayloadUrls('live', cached)
  }

  const queryParams = new URLSearchParams({ country: normalizedCountry })
  if (forceRefresh || disableCache) {
    queryParams.set('forceRefresh', 'true')
  }

  const endpoint = buildApiUrl(`/catalog/live?${queryParams.toString()}`)
  const inflightKey = `catalog:live:${user.code}:${tokenKey}:${catalogVariant}:${forceRefresh || disableCache ? 'refresh' : 'cached'}`

  if (!forceRefresh && !disableCache && inflightCatalogRequests.has(inflightKey)) {
    return inflightCatalogRequests.get(inflightKey)
  }

  const requestPromise = (async () => {
    let lastError = null

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await apiFetch(endpoint, {
          signal,
          cache: disableCache ? 'no-store' : 'default',
          headers: {
            Authorization: `Bearer ${token}`,
            'Cache-Control': disableCache ? 'no-cache, no-store, max-age=0' : 'no-cache',
            Pragma: 'no-cache'
          }
        })

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          const message = payload?.message || `Canli katalog yuklenemedi (HTTP ${response.status})`
          const error = new Error(message)
          error.status = response.status
          throw error
        }

        const payload = await response.json().catch(() => ({}))
        const result = {
          country: String(payload?.data?.country || normalizedCountry).trim().toUpperCase() || normalizedCountry,
          categories: Array.isArray(payload?.data?.categories) ? payload.data.categories : [],
          countries: Array.isArray(payload?.data?.countries) ? payload.data.countries : [],
          items: Array.isArray(payload?.data?.items) ? payload.data.items : [],
          total: Number(payload?.data?.total || 0),
          generatedAt: payload?.data?.generatedAt || null
        }

        const normalizedResult = normalizeCatalogPayloadUrls('live', result)
        return shouldStoreCache ? cacheEntry(catalogMemoryCache, catalogCacheKey, normalizedResult) : normalizedResult
      } catch (error) {
        lastError = error

        const isAbort = signal?.aborted
        const isTransient =
          error?.status >= 500 ||
          /Failed to fetch/i.test(error?.message || '')
        const canUseStaleCache = isTransient || error?.status === 404

        if (isAbort) {
          throw error
        }

        if (error?.status === 404) {
          try {
            const fallbackResult = await fetchLiveCatalogFallback(user, token, {
              signal,
              country: normalizedCountry,
              forceRefresh,
              disableCache,
              ttlMs,
              deliveryMode: resolvedDeliveryMode
            })

            const normalizedFallbackResult = normalizeCatalogPayloadUrls('live', fallbackResult)
            return shouldStoreCache ? cacheEntry(catalogMemoryCache, catalogCacheKey, normalizedFallbackResult) : normalizedFallbackResult
          } catch (fallbackError) {
            lastError = fallbackError
          }
        }

        if (attempt < retries && isTransient) {
          await delay(600)
          continue
        }

        if (staleCached && canUseStaleCache) {
          return normalizeCatalogPayloadUrls('live', staleCached)
        }

        throw error
      }
    }

    throw lastError || new Error('Canli katalog yuklenemedi')
  })()

  inflightCatalogRequests.set(inflightKey, requestPromise)

  try {
    return await requestPromise
  } finally {
    inflightCatalogRequests.delete(inflightKey)
  }
}

export function fetchSeriesCatalog(user, token, options = {}) {
  return fetchCatalog(user, token, 'series', options)
}

export function getCachedLiveCatalogSnapshot(user, token, options = {}) {
  const {
    country = 'TR',
    ttlMs = DEFAULT_TTL_MS,
    allowStale = true,
    deliveryMode = null
  } = options

  if (!user?.code || !token) {
    return null
  }

  const normalizedCountry = String(country || 'TR').trim().toUpperCase() || 'TR'
  const resolvedDeliveryMode = resolvePlaylistDeliveryMode(user, deliveryMode)
  const tokenKey = tokenFingerprint(token)
  const catalogVariant = `country:${normalizedCountry}`
  const catalogCacheKey = buildCatalogCacheKey(user.code, tokenKey, 'live', catalogVariant, resolvedDeliveryMode)
  const snapshot = getCachedValueSnapshot(catalogMemoryCache, catalogCacheKey, ttlMs, allowStale)

  if (!snapshot) {
    return null
  }

  return {
    ...snapshot,
    value: normalizeCatalogPayloadUrls('live', snapshot.value),
    country: normalizedCountry,
    cacheKey: catalogCacheKey
  }
}

export function fetchSeriesDetail(user, token, seriesName, options = {}) {
  if (!seriesName) {
    return Promise.resolve(null)
  }

  return fetchCatalog(user, token, 'series', {
    ...options,
    compact: false,
    seriesName
  })
}

export function fetchMoviesCatalog(user, token, options = {}) {
  return fetchCatalog(user, token, 'movies', options)
}
