import { buildApiUrl } from '../config/api'

const PLAYLIST_RAW_CACHE_PREFIX = 'iptv_playlist_raw_v1_'
const PLAYLIST_PARSED_CACHE_PREFIX = 'iptv_playlist_parsed_v1_'
const DEFAULT_TTL_MS = 5 * 60 * 1000

const rawMemoryCache = new Map()
const parsedMemoryCache = new Map()
const inflightPlaylistRequests = new Map()

function canUseSessionStorage() {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'
}

function now() {
  return Date.now()
}

function buildRawCacheKey(userCode) {
  return `${PLAYLIST_RAW_CACHE_PREFIX}${userCode}`
}

function buildParsedCacheKey(userCode, cacheKey) {
  return `${PLAYLIST_PARSED_CACHE_PREFIX}${userCode}_${cacheKey}`
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

function getCachedRawPlaylist(userCode, ttlMs) {
  const memoryKey = buildRawCacheKey(userCode)
  const memoryValue = getFreshCacheEntry(rawMemoryCache, memoryKey, ttlMs)
  if (memoryValue) return memoryValue

  const sessionValue = getSessionCacheEntry(memoryKey, ttlMs)
  if (sessionValue) {
    setMemoryCacheEntry(rawMemoryCache, memoryKey, sessionValue)
    return sessionValue
  }

  return null
}

function getAnyCachedRawPlaylist(userCode) {
  const memoryKey = buildRawCacheKey(userCode)
  const memoryValue = getStaleMemoryCacheEntry(rawMemoryCache, memoryKey)
  if (memoryValue) return memoryValue

  const sessionValue = getStaleSessionCacheEntry(memoryKey)
  if (sessionValue) {
    setMemoryCacheEntry(rawMemoryCache, memoryKey, sessionValue)
    return sessionValue
  }

  return null
}

function cacheRawPlaylist(userCode, value) {
  const key = buildRawCacheKey(userCode)
  setMemoryCacheEntry(rawMemoryCache, key, value)
  setSessionCacheEntry(key, value)
  return value
}

function getCachedParsedPlaylist(userCode, cacheKey, ttlMs) {
  const key = buildParsedCacheKey(userCode, cacheKey)
  const memoryValue = getFreshCacheEntry(parsedMemoryCache, key, ttlMs)
  if (memoryValue) return memoryValue

  const sessionValue = getSessionCacheEntry(key, ttlMs)
  if (sessionValue) {
    setMemoryCacheEntry(parsedMemoryCache, key, sessionValue)
    return sessionValue
  }

  return null
}

function getAnyCachedParsedPlaylist(userCode, cacheKey) {
  const key = buildParsedCacheKey(userCode, cacheKey)
  const memoryValue = getStaleMemoryCacheEntry(parsedMemoryCache, key)
  if (memoryValue) return memoryValue

  const sessionValue = getStaleSessionCacheEntry(key)
  if (sessionValue) {
    setMemoryCacheEntry(parsedMemoryCache, key, sessionValue)
    return sessionValue
  }

  return null
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function cacheParsedPlaylist(userCode, cacheKey, value) {
  const key = buildParsedCacheKey(userCode, cacheKey)
  setMemoryCacheEntry(parsedMemoryCache, key, value)
  setSessionCacheEntry(key, value)
  return value
}

export function invalidatePlaylistCache(userCode) {
  if (!userCode) return

  const rawKey = buildRawCacheKey(userCode)
  rawMemoryCache.delete(rawKey)

  for (const key of parsedMemoryCache.keys()) {
    if (key.includes(`_${userCode}_`) || key.endsWith(`_${userCode}`)) {
      parsedMemoryCache.delete(key)
    }
  }

  if (!canUseSessionStorage()) return

  try {
    sessionStorage.removeItem(rawKey)
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith(PLAYLIST_PARSED_CACHE_PREFIX) && key.includes(`_${userCode}_`))
      .forEach((key) => sessionStorage.removeItem(key))
  } catch {
    // ignore
  }
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
    ttlMs = DEFAULT_TTL_MS,
    retries = 1
  } = options

  if (!user?.code) {
    throw new Error('Kullanici kodu bulunamadi')
  }

  if (!token) {
    throw new Error('Oturum bulunamadi')
  }

  // Always use same-origin API routing from the frontend domain.
  // This avoids stale/cross-origin proxy URLs stored in persisted auth state.
  const playlistUrl = buildApiUrl(`/m3u/${user.code}.m3u`)
  const cached = !forceRefresh ? getCachedRawPlaylist(user.code, ttlMs) : null
  const staleCached = getAnyCachedRawPlaylist(user.code)

  if (cached) {
    return cached
  }

  const inflightKey = `${user.code}:${playlistUrl}`
  if (!forceRefresh && inflightPlaylistRequests.has(inflightKey)) {
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

        return cacheRawPlaylist(user.code, text)
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

        if (staleCached && isTransient) {
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

  const cached = !forceRefresh ? getCachedParsedPlaylist(user.code, cacheKey, ttlMs) : null
  const staleCached = getAnyCachedParsedPlaylist(user.code, cacheKey)
  if (cached) {
    return cached
  }

  try {
    const text = await fetchUserPlaylist(user, token, {
      forceRefresh,
      ttlMs,
      signal
    })

    const parsed = parser(text)
    return cacheParsedPlaylist(user.code, cacheKey, parsed)
  } catch (error) {
    if (staleCached) {
      return staleCached
    }

    throw error
  }
}
