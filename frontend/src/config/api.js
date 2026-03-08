const rawApiBaseUrl = (import.meta.env.VITE_API_URL || '/api/v1').trim()

export const API_BASE_URL = rawApiBaseUrl.endsWith('/')
  ? rawApiBaseUrl.slice(0, -1)
  : rawApiBaseUrl

export function buildApiUrl(path = '') {
  if (!path) {
    return API_BASE_URL
  }

  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
}
