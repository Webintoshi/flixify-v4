import { buildApiUrl } from '../config/api'
import {
  parseSeriesFromPlaylist,
  groupSeriesEpisodes,
  parseMoviesFromPlaylist,
  dedupeByTitle
} from '../utils/playlistParser'

const PLAYLIST_RAW_CACHE_PREFIX = 'iptv_playlist_raw_v2_'
const PLAYLIST_PARSED_CACHE_PREFIX = 'iptv_playlist_parsed_v2_'
const CATALOG_CACHE_PREFIX = 'iptv_catalog_v1_'
const DEFAULT_TTL_MS = 5 * 60 * 1000

const rawMemoryCache = new Map()
const parsedMemoryCache = new Map()
const catalogMemoryCache = new Map()
const inflightPlaylistRequests = new Map()
const inflightCatalogRequests = new Map()

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

function buildRawCacheKey(userCode, tokenKey, scope = 'full') {
  return `${PLAYLIST_RAW_CACHE_PREFIX}${scope}_${userCode}_${tokenKey}`
}

function buildParsedCacheKey(userCode, tokenKey, cacheKey, scope = 'full') {
  return `${PLAYLIST_PARSED_CACHE_PREFIX}${scope}_${userCode}_${tokenKey}_${cacheKey}`
}

function buildCatalogCacheKey(userCode, tokenKey, catalogType, variant = 'default') {
  return `${CATALOG_CACHE_PREFIX}${catalogType}_${userCode}_${tokenKey}_${variant}`
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
  const { forceRefresh = false, ttlMs = DEFAULT_TTL_MS, signal, compact = false, seriesName = '' } = options
  const parser =
    catalogType === 'series'
      ? buildSeriesCatalogFallback
      : buildMoviesCatalogFallback

  const parsed = await fetchParsedPlaylist(user, token, {
    cacheKey: `catalog-fallback:${catalogType}:v1`,
    parser,
    forceRefresh,
    ttlMs,
    signal
  })

  if (catalogType !== 'series') {
    return parsed
  }

  return transformSeriesCatalogPayload(parsed, { compact, seriesName })
}

function invalidateMapByPrefix(cacheMap, prefix) {
  for (const key of cacheMap.keys()) {
    if (key.startsWith(prefix)) {
      cacheMap.delete(key)
    }
  }
}

function invalidateSessionByPrefix(prefix) {
  if (!canUseSessionStorage()) return
  try {
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith(prefix))
      .forEach((key) => sessionStorage.removeItem(key))
  } catch {
    // ignore
  }
}

export function invalidatePlaylistCache(userCode) {
  if (!userCode) return

  const rawPrefix = `${PLAYLIST_RAW_CACHE_PREFIX}${userCode}_`
  const parsedPrefix = `${PLAYLIST_PARSED_CACHE_PREFIX}${userCode}_`
  const seriesCatalogPrefix = `${CATALOG_CACHE_PREFIX}series_${userCode}_`
  const moviesCatalogPrefix = `${CATALOG_CACHE_PREFIX}movies_${userCode}_`

  invalidateMapByPrefix(rawMemoryCache, rawPrefix)
  invalidateMapByPrefix(parsedMemoryCache, parsedPrefix)
  invalidateMapByPrefix(catalogMemoryCache, seriesCatalogPrefix)
  invalidateMapByPrefix(catalogMemoryCache, moviesCatalogPrefix)

  invalidateSessionByPrefix(rawPrefix)
  invalidateSessionByPrefix(parsedPrefix)
  invalidateSessionByPrefix(seriesCatalogPrefix)
  invalidateSessionByPrefix(moviesCatalogPrefix)
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
    retries = 1
  } = options

  if (!user?.code) {
    throw new Error('Kullanici kodu bulunamadi')
  }

  if (!token) {
    throw new Error('Oturum bulunamadi')
  }

  const tokenKey = tokenFingerprint(token)
  const normalizedScope = normalizeScope(scope)
  const isLiveScope = normalizedScope === 'live'
  const shouldUseCache = !disableCache && !forceRefresh && !isLiveScope
  const shouldStoreCache = !disableCache && !isLiveScope
  const queryParams = new URLSearchParams()
  if (forceRefresh || disableCache) {
    queryParams.set('forceRefresh', 'true')
  }
  if (isLiveScope) {
    queryParams.set('scope', 'live')
  }
  const playlistQuery = queryParams.toString() ? `?${queryParams.toString()}` : ''
  const playlistUrl = buildApiUrl(`/m3u/${user.code}.m3u${playlistQuery}`)
  const rawCacheKey = buildRawCacheKey(user.code, tokenKey, normalizedScope)
  const cached = shouldUseCache ? getCachedEntry(rawMemoryCache, rawCacheKey, ttlMs) : null
  const staleCached = shouldStoreCache ? getAnyCachedEntry(rawMemoryCache, rawCacheKey) : null

  if (cached) {
    return cached
  }

  const inflightKey = `playlist:${user.code}:${tokenKey}:${normalizedScope}:${forceRefresh || disableCache ? 'refresh' : 'cached'}`
  if (!forceRefresh && !disableCache && inflightPlaylistRequests.has(inflightKey)) {
    return inflightPlaylistRequests.get(inflightKey)
  }

  const requestPromise = (async () => {
    let lastError = null

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await fetch(playlistUrl, {
          signal,
          headers: {
            'Authorization': `Bearer ${token}`,
            'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18'
          }
        })

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error('Oturum suresi dolmus. Lutfen tekrar giris yapin.')
          }
          if (response.status === 403) {
            throw new Error('Aktif paket veya M3U atamasi gerekiyor.')
          }
          if (response.status === 404) {
            throw new Error('Playlist bulunamadi.')
          }

          const transientError = new Error(`Playlist yuklenemedi (HTTP ${response.status})`)
          transientError.status = response.status
          throw transientError
        }

        const text = await response.text()

        if (!text || !text.trim()) {
          throw new Error('Playlist bos dondu')
        }

        return shouldStoreCache ? cacheEntry(rawMemoryCache, rawCacheKey, text) : text
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

        if (shouldStoreCache && staleCached && isTransient) {
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
    signal
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
  const isLiveScope = normalizedScope === 'live'
  const shouldUseCache = !disableCache && !forceRefresh && !isLiveScope
  const shouldStoreCache = !disableCache && !isLiveScope
  const parsedCacheKey = buildParsedCacheKey(user.code, tokenKey, cacheKey, normalizedScope)
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
      signal
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
    seriesName = ''
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
  const catalogVariant = buildCatalogVariant(catalogType, { compact, seriesName })
  const catalogCacheKey = buildCatalogCacheKey(user.code, tokenKey, catalogType, catalogVariant)
  const cached = !forceRefresh ? getCachedEntry(catalogMemoryCache, catalogCacheKey, ttlMs) : null
  const staleCached = getAnyCachedEntry(catalogMemoryCache, catalogCacheKey)

  if (cached) {
    return cached
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
  const inflightKey = `catalog:${catalogType}:${catalogVariant}:${user.code}:${tokenKey}:${forceRefresh ? 'refresh' : 'cached'}`

  if (!forceRefresh && inflightCatalogRequests.has(inflightKey)) {
    return inflightCatalogRequests.get(inflightKey)
  }

  const requestPromise = (async () => {
    let lastError = null

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await fetch(endpoint, {
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
              seriesName
            })
            return cacheEntry(catalogMemoryCache, catalogCacheKey, fallbackItems)
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

        return cacheEntry(catalogMemoryCache, catalogCacheKey, result)
      } catch (error) {
        lastError = error

        const isAbort = signal?.aborted
        const isTransient =
          error?.status >= 500 ||
          /Failed to fetch/i.test(error?.message || '')

        if (isAbort) {
          throw error
        }

        if (attempt < retries && isTransient) {
          await delay(600)
          continue
        }

        if (staleCached && isTransient) {
          return staleCached
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

export function fetchSeriesCatalog(user, token, options = {}) {
  return fetchCatalog(user, token, 'series', options)
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
