import { buildApiUrl } from '../config/api'

export function hasAssignedPlaylist(user) {
  return Boolean(user?.hasM3U ?? user?.m3uUrl)
}

export function hasValidSubscription(user) {
  if (!user) return false
  const hasExpiry = user.expiresAt && new Date(user.expiresAt) > new Date()
  return hasExpiry && hasAssignedPlaylist(user)
}

export async function fetchUserPlaylist(user, token, options = {}) {
  const { signal } = options

  if (!user?.code) {
    throw new Error('Kullanici kodu bulunamadi')
  }

  if (!token) {
    throw new Error('Oturum bulunamadi')
  }

  const playlistUrl = user.m3uProxyUrl || buildApiUrl(`/m3u/${user.code}.m3u`)

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

    throw new Error(`Playlist yuklenemedi (HTTP ${response.status})`)
  }

  const text = await response.text()

  if (!text || !text.trim()) {
    throw new Error('Playlist bos dondu')
  }

  return text
}
