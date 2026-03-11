const DEFAULT_API_BASE_PATH = '/api/v1'
const DEDICATED_PRODUCTION_API_BASE_URL = 'https://api-v4.flixify.pro/api/v1'
const RETRYABLE_API_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504])
const SAFE_FAILOVER_STATUS_CODES = new Set([404, 405, 421, 501])

const rawApiBaseUrl = String(import.meta.env.VITE_API_URL || DEFAULT_API_BASE_PATH).trim()
const rawFallbackApiBaseUrl = String(import.meta.env.VITE_API_FALLBACK_URL || '').trim()

function normalizeBaseUrl(value = '') {
  const normalized = String(value || '').trim()
  if (!normalized) {
    return ''
  }

  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized
}

function ensureLeadingSlash(value = '') {
  const normalized = String(value || '').trim()
  if (!normalized) {
    return ''
  }

  return normalized.startsWith('/') ? normalized : `/${normalized}`
}

function isAbsoluteHttpUrl(value = '') {
  return /^https?:\/\//i.test(String(value || '').trim())
}

function getBrowserOrigin() {
  return typeof window !== 'undefined' ? String(window.location.origin || '').trim() : ''
}

function getBrowserHost() {
  return typeof window !== 'undefined' ? String(window.location.hostname || '').trim().toLowerCase() : ''
}

function shouldPreferDedicatedApiHost(hostname = '') {
  const normalizedHost = String(hostname || '').trim().toLowerCase()
  return /(^|\.)flixify\.pro$/i.test(normalizedHost) && normalizedHost !== 'api-v4.flixify.pro'
}

function dedupeValues(values = []) {
  const seen = new Set()
  const result = []

  values.forEach((value) => {
    const normalized = normalizeBaseUrl(value)
    if (!normalized || seen.has(normalized)) {
      return
    }

    seen.add(normalized)
    result.push(normalized)
  })

  return result
}

function toAbsoluteApiBase(origin, path) {
  const normalizedOrigin = normalizeBaseUrl(origin)
  const normalizedPath = ensureLeadingSlash(path)

  if (!normalizedOrigin || !normalizedPath) {
    return ''
  }

  return `${normalizedOrigin}${normalizedPath}`
}

function buildApiBaseCandidates() {
  const browserOrigin = getBrowserOrigin()
  const browserHost = getBrowserHost()
  const normalizedPrimary = normalizeBaseUrl(rawApiBaseUrl || DEFAULT_API_BASE_PATH)
  const normalizedFallback = normalizeBaseUrl(rawFallbackApiBaseUrl)
  const candidates = []

  const pushCandidate = (value) => {
    if (value) {
      candidates.push(value)
    }
  }

  if (isAbsoluteHttpUrl(normalizedPrimary)) {
    pushCandidate(normalizedPrimary)

    try {
      const parsedPrimary = new URL(normalizedPrimary)
      if (browserOrigin && browserOrigin !== parsedPrimary.origin) {
        pushCandidate(toAbsoluteApiBase(browserOrigin, parsedPrimary.pathname || DEFAULT_API_BASE_PATH))
      }
    } catch {
      // ignore malformed configured API base URLs
    }
  } else {
    const relativePrimary = ensureLeadingSlash(normalizedPrimary || DEFAULT_API_BASE_PATH)

    if (shouldPreferDedicatedApiHost(browserHost)) {
      pushCandidate(DEDICATED_PRODUCTION_API_BASE_URL)
    }

    if (browserOrigin) {
      pushCandidate(toAbsoluteApiBase(browserOrigin, relativePrimary))
    } else {
      pushCandidate(relativePrimary)
    }
  }

  if (normalizedFallback) {
    if (isAbsoluteHttpUrl(normalizedFallback)) {
      pushCandidate(normalizedFallback)
    } else if (browserOrigin) {
      pushCandidate(toAbsoluteApiBase(browserOrigin, normalizedFallback))
    } else {
      pushCandidate(ensureLeadingSlash(normalizedFallback))
    }
  }

  if (!candidates.length && shouldPreferDedicatedApiHost(browserHost)) {
    pushCandidate(DEDICATED_PRODUCTION_API_BASE_URL)
  }

  if (!candidates.length) {
    pushCandidate(DEFAULT_API_BASE_PATH)
  }

  return dedupeValues(candidates)
}

export const API_BASE_CANDIDATES = buildApiBaseCandidates()
export const API_BASE_URL = API_BASE_CANDIDATES[0] || DEFAULT_API_BASE_PATH
export const API_FALLBACK_BASE_URLS = API_BASE_CANDIDATES.slice(1)

function getApiBasePaths() {
  return dedupeValues([
    DEFAULT_API_BASE_PATH,
    ...API_BASE_CANDIDATES.map((baseUrl) => {
      if (isAbsoluteHttpUrl(baseUrl)) {
        try {
          return ensureLeadingSlash(new URL(baseUrl).pathname || DEFAULT_API_BASE_PATH)
        } catch {
          return ''
        }
      }

      return ensureLeadingSlash(baseUrl)
    })
  ]).sort((left, right) => right.length - left.length)
}

function extractKnownApiPath(input = '') {
  const normalizedInput = String(input || '').trim()
  if (!normalizedInput) {
    return ''
  }

  const candidateBasePaths = getApiBasePaths()
  const extractFromPath = (rawPath = '') => {
    const normalizedPath = ensureLeadingSlash(rawPath)

    for (const basePath of candidateBasePaths) {
      if (!basePath) {
        continue
      }

      if (normalizedPath === basePath) {
        return ''
      }

      if (
        normalizedPath.startsWith(`${basePath}/`)
        || normalizedPath.startsWith(`${basePath}?`)
        || normalizedPath.startsWith(`${basePath}#`)
      ) {
        return normalizedPath.slice(basePath.length) || ''
      }
    }

    return null
  }

  if (isAbsoluteHttpUrl(normalizedInput)) {
    try {
      const parsed = new URL(normalizedInput)
      return extractFromPath(`${parsed.pathname}${parsed.search}${parsed.hash}`)
    } catch {
      return null
    }
  }

  return extractFromPath(normalizedInput)
}

function extractRequestPath(input = '') {
  const normalizedInput = String(input || '').trim()
  if (!normalizedInput) {
    return ''
  }

  const candidateBasePaths = dedupeValues(API_BASE_CANDIDATES.map((baseUrl) => {
    if (isAbsoluteHttpUrl(baseUrl)) {
      try {
        return ensureLeadingSlash(new URL(baseUrl).pathname || DEFAULT_API_BASE_PATH)
      } catch {
        return ''
      }
    }

    return ensureLeadingSlash(baseUrl)
  }))

  if (isAbsoluteHttpUrl(normalizedInput)) {
    const absoluteBases = API_BASE_CANDIDATES
      .filter((value) => isAbsoluteHttpUrl(value))
      .sort((left, right) => right.length - left.length)

    for (const baseUrl of absoluteBases) {
      if (normalizedInput === baseUrl) {
        return ''
      }

      if (normalizedInput.startsWith(`${baseUrl}/`) || normalizedInput.startsWith(`${baseUrl}?`)) {
        return normalizedInput.slice(baseUrl.length) || ''
      }
    }

    return normalizedInput
  }

  const normalizedPath = normalizedInput.startsWith('/') ? normalizedInput : `/${normalizedInput}`

  for (const basePath of candidateBasePaths) {
    if (!basePath) {
      continue
    }

    if (normalizedPath === basePath) {
      return ''
    }

    if (normalizedPath.startsWith(`${basePath}/`) || normalizedPath.startsWith(`${basePath}?`)) {
      return normalizedPath.slice(basePath.length) || ''
    }
  }

  return normalizedPath
}

export function buildApiUrl(path = '', baseUrl = API_BASE_URL) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl || API_BASE_URL)
  const requestPath = extractRequestPath(path)

  if (!requestPath) {
    return normalizedBaseUrl
  }

  if (isAbsoluteHttpUrl(requestPath)) {
    return requestPath
  }

  return `${normalizedBaseUrl}${requestPath.startsWith('/') ? requestPath : `/${requestPath}`}`
}

export function buildApiCandidateUrls(path = '') {
  const requestPath = extractRequestPath(path)

  if (isAbsoluteHttpUrl(requestPath)) {
    return [requestPath]
  }

  if (!requestPath) {
    return [...API_BASE_CANDIDATES]
  }

  return API_BASE_CANDIDATES.map((baseUrl) => buildApiUrl(requestPath, baseUrl))
}

export function normalizeApiResourceUrl(input = '', baseUrl = API_BASE_URL) {
  const apiPath = extractKnownApiPath(input)

  if (apiPath === null) {
    return String(input || '').trim()
  }

  return buildApiUrl(apiPath, baseUrl)
}

function getRequestMethod(init = {}) {
  return String(init?.method || 'GET').trim().toUpperCase() || 'GET'
}

function shouldFallbackToNextCandidate(response, index, candidateUrls, retryableStatuses, init = {}) {
  if (!response || response.ok || index >= candidateUrls.length - 1) {
    return false
  }

  if (retryableStatuses.has(response.status)) {
    return true
  }

  const method = getRequestMethod(init)
  if (!['GET', 'HEAD'].includes(method)) {
    return false
  }

  return SAFE_FAILOVER_STATUS_CODES.has(response.status)
}

export async function apiFetch(path = '', init = {}, options = {}) {
  const { retryStatuses = RETRYABLE_API_STATUS_CODES } = options
  const candidateUrls = buildApiCandidateUrls(path)
  const retryableStatuses = retryStatuses instanceof Set ? retryStatuses : new Set(retryStatuses)

  let lastResponse = null
  let lastError = null

  for (let index = 0; index < candidateUrls.length; index += 1) {
    const requestUrl = candidateUrls[index]

    try {
      const response = await fetch(requestUrl, init)

      if (!shouldFallbackToNextCandidate(response, index, candidateUrls, retryableStatuses, init)) {
        return response
      }

      lastResponse = response
    } catch (error) {
      lastError = error

      if (index === candidateUrls.length - 1) {
        throw error
      }
    }
  }

  if (lastResponse) {
    return lastResponse
  }

  throw lastError || new Error('API request failed')
}
