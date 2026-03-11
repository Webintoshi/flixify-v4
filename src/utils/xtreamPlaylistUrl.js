const crypto = require('crypto');
const { normalizeProviderPlaylistUrl } = require('./providerPlaylistUrl');

function restorePlaceholders(value) {
  return String(value || '')
    .replace(/%7Busername%7D/gi, '{username}')
    .replace(/%7Bpassword%7D/gi, '{password}')
    .replace(/%7BstreamId%7D/gi, '{streamId}');
}

function parseXtreamCredentialsFromPlaylistUrl(value) {
  const normalized = normalizeProviderPlaylistUrl(value, { enforceHlsOutput: false });

  try {
    const parsed = new URL(normalized);
    const pathname = String(parsed.pathname || '').toLowerCase();

    if (pathname.endsWith('/get.php')) {
      const username = String(parsed.searchParams.get('username') || '').trim();
      const password = String(parsed.searchParams.get('password') || '').trim();

      if (!username || !password) {
        return null;
      }

      return {
        origin: parsed.origin,
        username,
        password
      };
    }

    const segments = parsed.pathname.split('/').filter(Boolean).map((segment) => decodeURIComponent(segment));
    const playlistIndex = segments.findIndex((segment) => segment.toLowerCase() === 'playlist');

    if (playlistIndex !== -1 && segments.length >= playlistIndex + 4) {
      return {
        origin: parsed.origin,
        username: segments[playlistIndex + 1],
        password: segments[playlistIndex + 2]
      };
    }

    return null;
  } catch {
    return null;
  }
}

function buildProviderCatalogSignature(value) {
  const normalized = normalizeProviderPlaylistUrl(value, { enforceHlsOutput: true });

  let signatureSource = String(normalized || value || '').trim();

  try {
    const parsed = new URL(signatureSource);
    const pathname = String(parsed.pathname || '').toLowerCase();

    if (pathname.endsWith('/get.php')) {
      const preservedEntries = Array.from(parsed.searchParams.entries())
        .filter(([key]) => !['username', 'password'].includes(String(key || '').toLowerCase()))
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));

      const signatureParams = new URLSearchParams();
      preservedEntries.forEach(([key, currentValue]) => {
        signatureParams.append(key, currentValue);
      });

      signatureSource = `${parsed.origin}${parsed.pathname}?${signatureParams.toString()}`;
    } else {
      const segments = parsed.pathname.split('/').filter(Boolean).map((segment) => decodeURIComponent(segment));
      const playlistIndex = segments.findIndex((segment) => segment.toLowerCase() === 'playlist');

      if (playlistIndex !== -1 && segments.length >= playlistIndex + 4) {
        segments[playlistIndex + 1] = '{username}';
        segments[playlistIndex + 2] = '{password}';
        parsed.pathname = `/${segments.map((segment) => encodeURIComponent(segment)).join('/')}`;
      }

      signatureSource = restorePlaceholders(parsed.toString());
    }
  } catch {
    // Keep the normalized string if URL parsing fails.
  }

  return crypto.createHash('sha1').update(signatureSource).digest('hex');
}

function extractXtreamStreamId(value = '') {
  const rawValue = String(value || '').trim();
  if (!rawValue) {
    return '';
  }

  try {
    const parsed = new URL(rawValue);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const lastSegment = decodeURIComponent(segments[segments.length - 1] || '');
    return lastSegment.replace(/\.(m3u8|ts|mp4|mkv|webm)$/i, '').trim();
  } catch {
    const candidate = rawValue.split('?')[0].split('/').filter(Boolean).pop() || '';
    return decodeURIComponent(candidate).replace(/\.(m3u8|ts|mp4|mkv|webm)$/i, '').trim();
  }
}

function buildStreamTemplateFromSampleUrl(sampleUrl, playlistUrl) {
  const credentials = parseXtreamCredentialsFromPlaylistUrl(playlistUrl);
  const sampleValue = String(sampleUrl || '').trim();
  const streamId = extractXtreamStreamId(sampleValue);

  if (!credentials || !sampleValue || !streamId) {
    return null;
  }

  try {
    const parsed = new URL(sampleValue);
    const updatedSegments = parsed.pathname
      .split('/')
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment))
      .map((segment) => {
        if (segment === credentials.username) return '{username}';
        if (segment === credentials.password) return '{password}';
        return segment;
      });

    const lastIndex = updatedSegments.length - 1;
    if (lastIndex >= 0) {
      const currentValue = updatedSegments[lastIndex];
      updatedSegments[lastIndex] = currentValue.includes(streamId)
        ? currentValue.replace(streamId, '{streamId}')
        : '{streamId}';
    }

    parsed.pathname = `/${updatedSegments.map((segment) => {
      if (/^\{(username|password|streamId)\}$/.test(segment)) {
        return segment;
      }

      const placeholderSafe = segment.replace('{streamId}', '__STREAM_ID__');
      return encodeURIComponent(placeholderSafe).replace('__STREAM_ID__', '{streamId}');
    }).join('/')}`;

    if (parsed.searchParams.has('username')) {
      parsed.searchParams.set('username', '{username}');
    }

    if (parsed.searchParams.has('password')) {
      parsed.searchParams.set('password', '{password}');
    }

    return restorePlaceholders(parsed.toString());
  } catch {
    return null;
  }
}

function applyStreamTemplate(template, playlistUrl, streamId) {
  const credentials = parseXtreamCredentialsFromPlaylistUrl(playlistUrl);
  const normalizedTemplate = String(template || '').trim();
  const normalizedStreamId = String(streamId || '').trim();

  if (!credentials || !normalizedTemplate || !normalizedStreamId) {
    return '';
  }

  return normalizedTemplate
    .replace(/\{username\}/g, encodeURIComponent(credentials.username))
    .replace(/\{password\}/g, encodeURIComponent(credentials.password))
    .replace(/\{streamId\}/g, encodeURIComponent(normalizedStreamId));
}

function buildXtreamLiveStreamUrl(playlistUrl, streamId, options = {}) {
  const { template = null } = options;
  const normalizedStreamId = String(streamId || '').trim();

  if (!normalizedStreamId) {
    return '';
  }

  if (template) {
    const templatedUrl = applyStreamTemplate(template, playlistUrl, normalizedStreamId);
    if (templatedUrl) {
      return templatedUrl;
    }
  }

  const credentials = parseXtreamCredentialsFromPlaylistUrl(playlistUrl);
  if (!credentials) {
    return '';
  }

  return `${credentials.origin}/live/${encodeURIComponent(credentials.username)}/${encodeURIComponent(credentials.password)}/${encodeURIComponent(normalizedStreamId)}.m3u8`;
}

module.exports = {
  applyStreamTemplate,
  buildProviderCatalogSignature,
  buildStreamTemplateFromSampleUrl,
  buildXtreamLiveStreamUrl,
  extractXtreamStreamId,
  parseXtreamCredentialsFromPlaylistUrl
};
