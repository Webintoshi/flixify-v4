const PLAYLIST_PATH_FIXES = [
  ['/playlisth/', '/playlist/'],
  ['/playlists/', '/playlist/']
];

function normalizePathSegments(value) {
  return PLAYLIST_PATH_FIXES.reduce(
    (current, [needle, replacement]) => current.replace(needle, replacement),
    String(value || '').trim()
  );
}

function shouldForceHlsOutput(urlObject) {
  if (!urlObject) {
    return false;
  }

  const pathname = String(urlObject.pathname || '').toLowerCase();
  return pathname.includes('/playlist/') && pathname.includes('m3u_plus');
}

function normalizeProviderPlaylistUrl(value, options = {}) {
  const { enforceHlsOutput = true } = options;
  if (!value || typeof value !== 'string') {
    return value;
  }

  const normalizedRaw = normalizePathSegments(value);

  try {
    const parsed = new URL(normalizedRaw);
    if (enforceHlsOutput && shouldForceHlsOutput(parsed)) {
      parsed.searchParams.set('output', 'hls');
    }
    return parsed.toString();
  } catch {
    return normalizedRaw;
  }
}

module.exports = {
  normalizeProviderPlaylistUrl
};
