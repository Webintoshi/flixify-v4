/**
 * useM3UCache Hook
 * 
 * M3U playlist verisi için gelişmiş caching hook'u.
 * Features:
 * - sessionStorage persistence (sayfa oturumu boyunca)
 * - Stale-while-revalidate pattern
 * - Automatic background refresh
 * - Cache invalidation controls
 * 
 * @example
 * const { channels, loading, error, refresh } = useM3UCache(userCode, token)
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { buildApiUrl } from '../config/api'

const CACHE_KEY_PREFIX = 'iptv_m3u_v2_'
const DEFAULT_TTL_MS = 5 * 60 * 1000 // 5 dakika
const REFRESH_INTERVAL_MS = 60 * 1000 // 1 dakikada bir kontrol

export function useM3UCache(userCode, token, options = {}) {
  const { ttl = DEFAULT_TTL_MS } = options
  
  const [channels, setChannels] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [isStale, setIsStale] = useState(false)
  
  const refreshTimerRef = useRef(null)
  const abortControllerRef = useRef(null)

  // Cache utilities
  const getCacheKey = useCallback(() => `${CACHE_KEY_PREFIX}${userCode}`, [userCode])

  const getCachedData = useCallback(() => {
    if (!userCode) return null
    try {
      const cached = sessionStorage.getItem(getCacheKey())
      if (!cached) return null
      
      const { data, timestamp } = JSON.parse(cached)
      const age = Date.now() - timestamp
      
      return {
        data,
        timestamp,
        age,
        isExpired: age > ttl
      }
    } catch {
      return null
    }
  }, [userCode, ttl, getCacheKey])

  const setCachedData = useCallback((data) => {
    if (!userCode) return
    try {
      const cacheData = {
        data,
        timestamp: Date.now()
      }
      sessionStorage.setItem(getCacheKey(), JSON.stringify(cacheData))
      setLastUpdated(new Date())
      setIsStale(false)
    } catch (error) {
      console.warn('[M3UCache] Write failed:', error)
    }
  }, [userCode, getCacheKey])

  const clearCache = useCallback(() => {
    if (!userCode) return
    try {
      sessionStorage.removeItem(getCacheKey())
      setLastUpdated(null)
    } catch {
      // ignore
    }
  }, [userCode, getCacheKey])

  // Fetch function
  const fetchChannels = useCallback(async (silent = false) => {
    if (!userCode || !token) {
      if (!silent) {
        setError('Oturum bilgisi eksik')
        setLoading(false)
      }
      return
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    if (!silent) setLoading(true)
    setError(null)

    try {
      const response = await fetch(buildApiUrl(`/m3u/${userCode}.m3u`), {
        signal: abortControllerRef.current.signal,
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18'
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const text = await response.text()
      const parsed = parseM3U(text)
      
      setCachedData(parsed)
      setChannels(prev => {
        // Eğer kanal listesi değiştiyse state'i güncelle
        if (JSON.stringify(prev) !== JSON.stringify(parsed)) {
          return parsed
        }
        return prev
      })
      
      if (!silent) setLoading(false)
    } catch (err) {
      if (err.name === 'AbortError') return
      
      console.error('[M3UCache] Fetch error:', err)
      if (!silent) {
        setError(err.message)
        setLoading(false)
      }
    }
  }, [userCode, token, setCachedData])

  // Parse M3U content
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

  // Initial load
  useEffect(() => {
    if (!userCode) {
      setChannels([])
      setLoading(false)
      return
    }

    const cached = getCachedData()
    
    if (cached && !cached.isExpired) {
      // Cache hit - anında göster
      setChannels(cached.data)
      setLoading(false)
      setLastUpdated(new Date(cached.timestamp))
      
      // Arka planda yenile (silent refresh)
      fetchChannels(true)
    } else if (cached && cached.isExpired) {
      // Cache expired - göster ama stale işaretle
      setChannels(cached.data)
      setIsStale(true)
      setLoading(false)
      fetchChannels()
    } else {
      // No cache - fetch
      fetchChannels()
    }
  }, [userCode, getCachedData, fetchChannels])

  // Background refresh interval
  useEffect(() => {
    if (!userCode || !token) return

    refreshTimerRef.current = setInterval(() => {
      const cached = getCachedData()
      if (cached?.isExpired) {
        setIsStale(true)
        fetchChannels(true)
      }
    }, REFRESH_INTERVAL_MS)

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current)
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [userCode, token, getCachedData, fetchChannels])

  // Manual refresh
  const refresh = useCallback(() => {
    clearCache()
    return fetchChannels()
  }, [clearCache, fetchChannels])

  return {
    channels,
    loading,
    error,
    lastUpdated,
    isStale,
    refresh,
    clearCache
  }
}

export default useM3UCache
