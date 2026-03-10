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

function pushUniqueUrl(targetList, seen, value) {
  if (!value || typeof value !== 'string') {
    return;
  }

  const normalized = value.trim();
  if (!normalized || seen.has(normalized)) {
    return;
  }

  seen.add(normalized);
  targetList.push(normalized);
}

function buildProviderPlaylistFetchCandidates(value, options = {}) {
  const candidates = [];
  const seen = new Set();
  const normalizedRaw = normalizePathSegments(value);
  const normalizedHls = normalizeProviderPlaylistUrl(value, options);

  pushUniqueUrl(candidates, seen, normalizedHls);
  pushUniqueUrl(candidates, seen, normalizedRaw);
  pushUniqueUrl(candidates, seen, value);

  try {
    const parsed = new URL(normalizedHls || normalizedRaw || value);
    if (!shouldForceHlsOutput(parsed)) {
      return candidates;
    }

    const withoutOutput = new URL(parsed.toString());
    withoutOutput.searchParams.delete('output');
    pushUniqueUrl(candidates, seen, withoutOutput.toString());

    const tsVariant = new URL(parsed.toString());
    tsVariant.searchParams.set('output', 'ts');
    pushUniqueUrl(candidates, seen, tsVariant.toString());

    const mpegtsVariant = new URL(parsed.toString());
    mpegtsVariant.searchParams.set('output', 'mpegts');
    pushUniqueUrl(candidates, seen, mpegtsVariant.toString());

    const hlsVariant = new URL(parsed.toString());
    hlsVariant.searchParams.set('output', 'hls');
    pushUniqueUrl(candidates, seen, hlsVariant.toString());
  } catch {
    // Keep current candidates.
  }

  return candidates;
}

module.exports = {
  normalizeProviderPlaylistUrl,
  buildProviderPlaylistFetchCandidates
};
