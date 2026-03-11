import { DEFAULT_LIVE_COUNTRY_CODE, LIVE_TV_COUNTRIES, LIVE_TV_CATEGORY_ALIASES } from '../config/liveTvTaxonomy'
import { inferStreamContainer, parsePlaylistEntries, unwrapProxyTargetUrl } from './playlistParser'

const COUNTRY_MATCHERS = {
  TR: [/^TR(?:\b|\s|:)/iu],
  FR: [/^France\s/iu],
  DE: [/^Germany\s/iu],
  GB: [/^UK\s/iu],
  US: [/^Usa\b/iu],
  ES: [/^Spain\b/iu],
  IT: [/^Italy\s/iu],
  PT: [/^Portugal\s/iu],
  PL: [/^Poland\s/iu],
  NL: [/^Netherland\s/iu],
  BE: [/^Belgium$/iu],
  AT: [/^Austria\s/iu],
  CH: [/^Switzerland\s/iu],
  SE: [/^Sweden\s/iu],
  NO: [/^Norway\s/iu],
  DK: [/^Denmark\s/iu],
  FI: [/^Finland\s/iu],
  CA: [/^Canada\s/iu],
  BR: [/^Brazil\s/iu],
  BG: [/^Bulgaria\s/iu],
  CZSK: [/^Czech and Slowak\s/iu],
  GR: [/^Greece\s/iu],
  HU: [/^Hungary\s/iu],
  AL: [/^Albania\s/iu],
  AF: [/^Afghanistan\s/iu],
  ARAB: [/^Arab\s/iu, /^Arabic\s/iu],
  AZ: [/^Azerbaijan$/iu],
  KURD: [/^Kurdish\s/iu],
  LATAM: [/^Latin\s/iu],
  LV: [/^Latvia\s/iu],
  MK: [/^Macedonia\s/iu],
  NI: [/^NI\s/iu],
  PK: [/^Pakistan\s/iu],
  RO: [/^Romania\s/iu],
  RU: [/^Russia\s/iu, /^Russian VIP\s/iu],
  SK: [/^Slovakia\s/iu],
  SI: [/^Slovenia\s/iu],
  EXYU: [/^Ex-yu\s/iu, /^ex-yu\s/iu],
  UA: [/^Ukraine\s/iu],
  IN: [/^India\s/iu],
  ID: [/^Indonesia\s/iu],
  GLOBAL: [/^Sport ✨ PPV$/u, /^VIP ✨ Sports$/u]
}

function normalizeLabel(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s*([✨⭐])/gu, ' $1 ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeKey(value) {
  return normalizeLabel(value).toLocaleLowerCase('tr-TR')
}

function normalizeCountryCode(value) {
  const normalized = String(value || '').trim().toUpperCase()
  return LIVE_TV_COUNTRIES.some((country) => country.code === normalized)
    ? normalized
    : DEFAULT_LIVE_COUNTRY_CODE
}

function normalizeChannelName(name = '') {
  return String(name || '')
    .toLowerCase()
    .replace(/[|·•]/g, ' ')
    .replace(/\b(tr|turkiye|türkiye)\b/gu, ' ')
    .replace(/\b(ultra|uhd|fhd|full\s*hd|hd|sd|4k|8k|raw|hevc|h\.?265|h\.?264)\b/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getSourceTypeScore(sourceType = '') {
  if (sourceType === 'hls') return 30
  if (sourceType === 'mpegts') return 20
  return 10
}

function getQualityScore(name = '') {
  const lowered = String(name || '').toLowerCase()
  if (/\b8k\b/.test(lowered)) return 20
  if (/\b4k\b|\buhd\b/.test(lowered)) return 18
  if (/\bfhd\b|full\s*hd/.test(lowered)) return 16
  if (/\bhd\b/.test(lowered)) return 14
  if (/\bsd\b/.test(lowered)) return 12
  if (/\bhevc\b|h\.?265/.test(lowered)) return 7
  if (/\braw\b/.test(lowered)) return 5
  return 8
}

function normalizeSampleUrlKey(value = '') {
  const normalizedValue = String(value || '').trim()
  if (!normalizedValue) {
    return ''
  }

  try {
    const parsed = new URL(normalizedValue)
    if ((parsed.protocol === 'http:' && parsed.port === '80') || (parsed.protocol === 'https:' && parsed.port === '443')) {
      parsed.port = ''
    }
    return parsed.toString()
  } catch {
    return normalizedValue
  }
}

function isVodUrl(value = '') {
  const lowered = String(unwrapProxyTargetUrl(value) || '').toLowerCase()
  if (!lowered) {
    return true
  }

  if (lowered.includes('/movie/') || lowered.includes('/series/') || lowered.includes('/vod/')) {
    return true
  }

  return /\.(mkv|mp4|avi|mov|webm|m4v)(\?|$)/i.test(lowered)
}

const categoryCountryMap = new Map()
const aliasCategoryMap = new Map()

LIVE_TV_COUNTRIES.forEach((country) => {
  country.categories.forEach((category) => {
    categoryCountryMap.set(normalizeKey(category), country.code)
  })
})

Object.entries(LIVE_TV_CATEGORY_ALIASES).forEach(([alias, canonical]) => {
  aliasCategoryMap.set(normalizeKey(alias), normalizeLabel(canonical))
})

function resolveCategory(rawGroup) {
  const normalizedGroup = normalizeLabel(rawGroup)
  const normalizedKey = normalizeKey(normalizedGroup)

  if (!normalizedGroup) {
    return 'Diger'
  }

  if (aliasCategoryMap.has(normalizedKey)) {
    return aliasCategoryMap.get(normalizedKey)
  }

  return normalizedGroup
}

function resolveCountryCode(rawGroup) {
  const normalizedGroup = normalizeLabel(rawGroup)
  const normalizedKey = normalizeKey(normalizedGroup)

  if (categoryCountryMap.has(normalizedKey)) {
    return categoryCountryMap.get(normalizedKey)
  }

  const matchedCountry = LIVE_TV_COUNTRIES.find((country) => (
    Array.isArray(COUNTRY_MATCHERS[country.code])
      && COUNTRY_MATCHERS[country.code].some((matcher) => matcher.test(normalizedGroup))
  ))

  return matchedCountry?.code || DEFAULT_LIVE_COUNTRY_CODE
}

function collapseLiveVariants(items = []) {
  const grouped = new Map()

  items.forEach((item, index) => {
    const baseName = normalizeChannelName(item?.name)
    const key = `${item?.countryCode || DEFAULT_LIVE_COUNTRY_CODE}:${item?.group || ''}:${baseName || item?.name || index}`
    const score = getSourceTypeScore(item?.sourceType) + getQualityScore(item?.name)
    const existing = grouped.get(key)

    if (!existing) {
      grouped.set(key, {
        firstIndex: index,
        candidates: [{ index, score, item }]
      })
      return
    }

    existing.candidates.push({ index, score, item })
  })

  return Array.from(grouped.values())
    .sort((left, right) => left.firstIndex - right.firstIndex)
    .map((entry) => {
      const rankedCandidates = entry.candidates
        .slice()
        .sort((left, right) => {
          if (right.score !== left.score) {
            return right.score - left.score
          }

          return left.index - right.index
        })

      const primaryItem = rankedCandidates[0]?.item || null
      if (!primaryItem) {
        return null
      }

      const seenUrls = new Set()
      const backupUrls = []
      const primaryUrl = String(primaryItem.sampleUrl || '').trim()
      if (primaryUrl) {
        seenUrls.add(normalizeSampleUrlKey(primaryUrl))
      }

      rankedCandidates.slice(1).forEach(({ item }) => {
        const candidateUrl = String(item?.sampleUrl || '').trim()
        const candidateKey = normalizeSampleUrlKey(candidateUrl)
        if (!candidateUrl || !candidateKey || seenUrls.has(candidateKey)) {
          return
        }

        seenUrls.add(candidateKey)
        backupUrls.push(candidateUrl)
      })

      return {
        ...primaryItem,
        backupUrls
      }
    })
    .filter(Boolean)
}

function buildLiveCountryTree(items = []) {
  const countryCounts = new Map()
  const categoryCounts = new Map()

  items.forEach((item) => {
    const countryCode = normalizeCountryCode(item?.countryCode)
    const categoryLabel = normalizeLabel(item?.group)

    countryCounts.set(countryCode, (countryCounts.get(countryCode) || 0) + 1)

    if (!categoryCounts.has(countryCode)) {
      categoryCounts.set(countryCode, new Map())
    }

    const currentCountryCategories = categoryCounts.get(countryCode)
    currentCountryCategories.set(categoryLabel, (currentCountryCategories.get(categoryLabel) || 0) + 1)
  })

  return LIVE_TV_COUNTRIES.map((country) => {
    const configuredCategories = Array.isArray(country.categories) ? country.categories : []
    const currentCategoryCounts = categoryCounts.get(country.code) || new Map()
    const configuredLabels = configuredCategories.map((label) => normalizeLabel(label))
    const categories = configuredLabels.map((label) => ({
      id: `group:${normalizeKey(label)}`,
      name: label,
      count: currentCategoryCounts.get(label) || 0
    }))

    const configuredSet = new Set(categories.map((category) => category.name))
    const extraCategories = Array.from(currentCategoryCounts.entries())
      .filter(([label]) => !configuredSet.has(label))
      .map(([label, count]) => ({
        id: `group:${normalizeKey(label)}`,
        name: label,
        count
      }))
      .sort((left, right) => left.name.localeCompare(right.name, 'tr', { sensitivity: 'base' }))

    return {
      code: country.code,
      name: country.name,
      defaultSelected: Boolean(country.defaultSelected),
      count: countryCounts.get(country.code) || 0,
      categories: [...categories, ...extraCategories]
    }
  })
}

export function buildLiveCatalogFromPlaylist(content, requestedCountry = DEFAULT_LIVE_COUNTRY_CODE) {
  const items = parsePlaylistEntries(content)
    .filter((entry) => entry?.url && !isVodUrl(entry.url))
    .map((entry, index) => {
      const group = resolveCategory(entry.rawGroup)
      return {
        id: `live:${index}:${normalizeKey(entry.title || entry.tvgName || 'unknown')}`,
        name: String(entry.title || entry.tvgName || 'Bilinmiyor').trim() || 'Bilinmiyor',
        logo: String(entry.logo || '').trim(),
        group,
        countryCode: resolveCountryCode(group),
        url: entry.url,
        sourceType: inferStreamContainer(entry.originalUrl || entry.url)
      }
    })

  const collapsedItems = collapseLiveVariants(items)
  const countries = buildLiveCountryTree(collapsedItems)
  const selectedCountry = normalizeCountryCode(requestedCountry)
  const filteredItems = collapsedItems.filter((item) => item.countryCode === selectedCountry)
  const selectedCountryMeta = countries.find((country) => country.code === selectedCountry) || null

  return {
    country: selectedCountry,
    categories: Array.isArray(selectedCountryMeta?.categories) ? selectedCountryMeta.categories : [],
    countries,
    items: filteredItems,
    total: filteredItems.length,
    generatedAt: new Date().toISOString()
  }
}
