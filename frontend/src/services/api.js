import axios from 'axios'
import { API_BASE_URL, API_FALLBACK_BASE_URLS } from '../config/api'

const RETRYABLE_API_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504])

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 30000
})

// UUID generator for browsers without crypto.randomUUID
const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback UUID v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function isRetryableApiError(error) {
  if (!error) {
    return false
  }

  if (!error.response) {
    return true
  }

  return RETRYABLE_API_STATUS_CODES.has(Number(error.response.status))
}

async function retryWithFallbackBaseUrls(error) {
  const originalConfig = error?.config
  if (!originalConfig || originalConfig._apiFallbackLocked || API_FALLBACK_BASE_URLS.length === 0) {
    throw error
  }

  const attemptedBaseUrls = new Set(
    Array.isArray(originalConfig._apiAttemptedBaseUrls)
      ? originalConfig._apiAttemptedBaseUrls
      : [originalConfig.baseURL || API_BASE_URL]
  )

  let lastError = error

  for (const fallbackBaseUrl of API_FALLBACK_BASE_URLS) {
    if (!fallbackBaseUrl || attemptedBaseUrls.has(fallbackBaseUrl)) {
      continue
    }

    attemptedBaseUrls.add(fallbackBaseUrl)

    try {
      return await api.request({
        ...originalConfig,
        baseURL: fallbackBaseUrl,
        headers: {
          ...(originalConfig.headers || {}),
          'X-Request-ID': generateUUID()
        },
        _apiFallbackLocked: true,
        _apiAttemptedBaseUrls: Array.from(attemptedBaseUrls)
      })
    } catch (fallbackError) {
      lastError = fallbackError
      if (!isRetryableApiError(fallbackError)) {
        break
      }
    }
  }

  throw lastError
}

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Add correlation ID for tracing
    config.headers['X-Request-ID'] = generateUUID()
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (isRetryableApiError(error)) {
      try {
        return await retryWithFallbackBaseUrls(error)
      } catch (retryError) {
        error = retryError
      }
    }

    // Handle specific error cases
    if (error.response?.status === 401) {
      // Token expired or invalid - only logout if explicitly auth failed
      const errorCode = error.response?.data?.code
      const errorMessage = error.response?.data?.message || 'Oturum süresi dolmuş'
      
      console.error('Auth error:', { code: errorCode, message: errorMessage })
      
      // Only force logout on explicit auth endpoints, not on all 401s
      const isAuthEndpoint = error.config?.url?.includes('/auth/')
      const isExplicitTokenError = errorCode === 'TOKEN_EXPIRED' || errorCode === 'INVALID_TOKEN'
      
      if ((isAuthEndpoint || isExplicitTokenError) && window.location.pathname !== '/') {
        // Clear storage and redirect to login
        localStorage.removeItem('iptv-auth-storage')
        delete api.defaults.headers.common['Authorization']
        window.location.href = '/?error=' + encodeURIComponent(errorMessage)
      }
    }

    if (error.response?.status === 429) {
      alert('Çok fazla istek. Lütfen biraz bekleyin.')
    }

    return Promise.reject(error)
  }
)

export default api
