const VALID_COUNTRIES = ['TR', 'DE', 'GB', 'US', 'FR', 'IT', 'NL', 'RU', 'AR']

const SERIES_PLATFORM_ALIASES = {
  'Netflix Dizileri': ['netflix'],
  'Disney+ Dizileri': ['disney+', 'disney plus', 'disney'],
  'Amazon Prime Dizileri': ['amazon prime', 'prime video', 'prime'],
  'TV+ Dizileri': ['tv+'],
  'TOD (beIN) Dizileri': ['tod', 'bein', 'bein connect'],
  'BluTV Dizileri (HBO)': ['blutv', 'blue tv', 'bluetv', 'hbo'],
  'Apple TV+ Dizileri': ['apple tv+', 'apple tv'],
  'GA\u0130N Dizileri': ['gain'],
  'Exxen Dizileri': ['exxen'],
  'G\u00fcnl\u00fck Diziler': ['gunluk', 'gunluk diziler', 'daily'],
  Anime: ['anime']
}

const EPISODE_PATTERN = /\bS(\d{1,2})E(\d{1,3})\b/i
const LEADING_REGION_PATTERN = /^[A-Z0-9]{2,4}\s*[•|:-]\s*/
const TRAILING_STREAM_LABEL_PATTERN = /\s+(24\/7|FHD|HD|4K|UHD)$/i

function parseExtInfLine(line) {
  const nameMatch = line.match(/tvg-name="([^"]+)"/i)
  const logoMatch = line.match(/tvg-logo="([^"]+)"/i)
  const groupMatch = line.match(/group-title="([^"]+)"/i)
  const countryMatch = line.match(/tvg-country="([^"]+)"/i)
  const commaIndex = line.lastIndexOf(',')

  return {
    tvgName: nameMatch?.[1] || '',
    logo: logoMatch?.[1] || '',
    rawGroup: groupMatch?.[1] || 'Diger',
    tvgCountry: countryMatch?.[1] || '',
    title: commaIndex > -1 ? line.slice(commaIndex + 1).trim() : nameMatch?.[1] || 'Unknown'
  }
}

export function unwrapProxyTargetUrl(value) {
  if (!value || typeof value !== 'string') {
    return ''
  }

  try {
    const parsed = new URL(value)
    const proxiedTarget = parsed.searchParams.get('url')
    return proxiedTarget ? decodeURIComponent(proxiedTarget) : value
  } catch {
    return value
  }
}

export function inferStreamContainer(value = '') {
  const lowered = String(value || '').toLowerCase()

  if (!lowered) {
    return 'unknown'
  }

  if (lowered.includes('.m3u8')) {
    return 'hls'
  }

  if (lowered.includes('.ts')) {
    return 'mpegts'
  }

  if (/\.(mp4|m4v|mkv|webm|mov|avi)(\?|$)/i.test(lowered)) {
    return 'file'
  }

  return 'unknown'
}

export function normalizePlaylistGroup(rawGroup) {
  return (rawGroup || 'Diger').replace(/^[A-Z]{2}:/, '').replace('INT:', '').replace('TR | ', '').trim() || 'Diger'
}

function inferCountry(rawGroup, title, tvgCountry) {
  if (tvgCountry && VALID_COUNTRIES.includes(tvgCountry.toUpperCase())) {
    return tvgCountry.toUpperCase()
  }

  const groupCodeMatch = (rawGroup || '').match(/^([A-Z]{2}):/)
  if (groupCodeMatch && VALID_COUNTRIES.includes(groupCodeMatch[1])) {
    return groupCodeMatch[1]
  }

  const groupLower = (rawGroup || '').toLowerCase()
  const titleLower = (title || '').toLowerCase()

  if (groupLower.includes('turkiye') || groupLower.includes('turkey') || /^tr[ |.]/.test(titleLower)) return 'TR'
  if (groupLower.includes('almanya') || groupLower.includes('germany')) return 'DE'
  if (groupLower.includes('ingiltere') || groupLower.includes('uk')) return 'GB'
  if (groupLower.includes('amerika') || groupLower.includes('usa')) return 'US'
  if (groupLower.includes('fransa') || groupLower.includes('france')) return 'FR'
  if (groupLower.includes('italya') || groupLower.includes('italy')) return 'IT'
  if (groupLower.includes('hollanda') || groupLower.includes('netherlands')) return 'NL'
  if (groupLower.includes('rusya') || groupLower.includes('russia')) return 'RU'
  if (groupLower.includes('arap') || groupLower.includes('arab')) return 'AR'

  return 'TR'
}

export function parsePlaylistEntries(content) {
  const entries = []
  let current = null

  for (const line of content.split('\n')) {
    const trimmed = line.trim()

    if (trimmed.startsWith('#EXTINF:')) {
      current = parseExtInfLine(trimmed)
      continue
    }

    if (!trimmed || trimmed.startsWith('#') || !current) {
      continue
    }

    entries.push({
      ...current,
      url: trimmed,
      originalUrl: unwrapProxyTargetUrl(trimmed)
    })
    current = null
  }

  return entries
}

export function parseLiveChannels(content) {
  return parsePlaylistEntries(content).map((entry) => ({
    name: entry.title || entry.tvgName || 'Bilinmiyor',
    logo: entry.logo,
    group: normalizePlaylistGroup(entry.rawGroup),
    country: inferCountry(entry.rawGroup, entry.title, entry.tvgCountry),
    url: entry.url,
    originalUrl: entry.originalUrl,
    sourceType: inferStreamContainer(entry.originalUrl)
  }))
}

export function parseLiveChannelsByCountry(content, country = 'TR') {
  const normalizedCountry = String(country || 'TR').toUpperCase()

  return parsePlaylistEntries(content)
    .map((entry) => ({
      name: entry.title || entry.tvgName || 'Bilinmiyor',
      logo: entry.logo,
      group: normalizePlaylistGroup(entry.rawGroup),
      country: inferCountry(entry.rawGroup, entry.title, entry.tvgCountry),
      url: entry.url,
      originalUrl: entry.originalUrl,
      sourceType: inferStreamContainer(entry.originalUrl)
    }))
    .filter((channel) => channel.country === normalizedCountry)
}

export function parseMoviesFromPlaylist(content) {
  return parsePlaylistEntries(content)
    .filter((entry) => {
      const originalUrl = (entry.originalUrl || '').toLowerCase()
      return originalUrl.includes('/movie/') || /\.(mkv|mp4|avi|mov)$/i.test(originalUrl)
    })
    .map((entry) => ({
      title: entry.title,
      logo: entry.logo,
      genre: normalizePlaylistGroup(entry.rawGroup),
      id: Math.random().toString(36).slice(2, 11),
      url: entry.url
    }))
    .filter((movie) => {
      const genre = movie.genre.toLowerCase()
      return !genre.includes('xxx') && !genre.includes('adult')
    })
}

export function dedupeByTitle(items, field = 'title') {
  const seen = new Set()

  return items.filter((item) => {
    const value = (item?.[field] || '').toLowerCase()
    if (!value || seen.has(value)) {
      return false
    }
    seen.add(value)
    return true
  })
}

function normalizeSeriesGenre(rawGroup, fullTitle) {
  const normalizedGroup = normalizePlaylistGroup(rawGroup)
  const haystack = `${normalizedGroup} ${fullTitle}`.toLowerCase()
  const matchedPlatform = Object.entries(SERIES_PLATFORM_ALIASES).find(([, aliases]) =>
    aliases.some((alias) => haystack.includes(alias))
  )

  return matchedPlatform ? matchedPlatform[0] : normalizedGroup
}

function stripPlatformAlias(value, genre) {
  const aliases = SERIES_PLATFORM_ALIASES[genre] || []
  const lowered = value.toLowerCase()

  for (const alias of aliases) {
    if (lowered.startsWith(alias)) {
      return value.slice(alias.length).trim()
    }
  }

  return value
}

function extractSeriesMetadata(fullTitle, genre) {
  const normalizedTitle = fullTitle.replace(/\s+/g, ' ').trim()
  const episodeMatch = normalizedTitle.match(EPISODE_PATTERN)

  let seriesName = episodeMatch
    ? normalizedTitle.slice(0, episodeMatch.index).trim()
    : normalizedTitle

  seriesName = seriesName.replace(LEADING_REGION_PATTERN, '').trim()
  seriesName = stripPlatformAlias(seriesName, genre)
  seriesName = seriesName.replace(TRAILING_STREAM_LABEL_PATTERN, '').trim()

  return {
    seriesName: seriesName || normalizedTitle,
    season: episodeMatch ? parseInt(episodeMatch[1], 10) : 1,
    episode: episodeMatch ? parseInt(episodeMatch[2], 10) : 1
  }
}

export function parseSeriesFromPlaylist(content) {
  return parsePlaylistEntries(content)
    .filter((entry) => entry.originalUrl.toLowerCase().includes('/series/'))
    .map((entry) => {
      const genre = normalizeSeriesGenre(entry.rawGroup, entry.title)
      const metadata = extractSeriesMetadata(entry.title, genre)

      return {
        ...metadata,
        fullTitle: entry.title,
        logo: entry.logo,
        genre,
        id: Math.random().toString(36).slice(2, 11),
        url: entry.url
      }
    })
}

export function groupSeriesEpisodes(episodes, fallbackPosters = {}) {
  const seriesMap = {}

  episodes.forEach((episodeItem) => {
    const key = episodeItem.seriesName.toLowerCase()

    if (!seriesMap[key]) {
      seriesMap[key] = {
        name: episodeItem.seriesName,
        genre: episodeItem.genre,
        logo: episodeItem.logo,
        seasons: {},
        episodeKeys: new Set()
      }
    }

    const series = seriesMap[key]
    if (episodeItem.logo && !series.logo) {
      series.logo = episodeItem.logo
    }

    const episodeKey = `${episodeItem.season}:${episodeItem.episode}:${episodeItem.fullTitle.toLowerCase()}:${episodeItem.url}`
    if (series.episodeKeys.has(episodeKey)) {
      return
    }

    series.episodeKeys.add(episodeKey)

    if (!series.seasons[episodeItem.season]) {
      series.seasons[episodeItem.season] = []
    }

    series.seasons[episodeItem.season].push(episodeItem)
  })

  return Object.values(seriesMap).map(({ episodeKeys, ...series }) => {
    Object.keys(series.seasons).forEach((season) => {
      series.seasons[season].sort((left, right) => left.episode - right.episode)
    })

    if (!series.logo) {
      series.logo = fallbackPosters[series.genre] || fallbackPosters.default || ''
    }

    return series
  })
}
