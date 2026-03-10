const SERIES_PLATFORM_ALIASES = {
  'Netflix Dizileri': ['netflix'],
  'Disney+ Dizileri': ['disney+', 'disney plus', 'disney'],
  'Amazon Prime Dizileri': ['amazon prime', 'prime video', 'prime'],
  'TV+ Dizileri': ['tv+'],
  'TOD (beIN) Dizileri': ['tod', 'bein', 'bein connect'],
  'BluTV Dizileri (HBO)': ['blutv', 'blue tv', 'bluetv', 'hbo'],
  'Apple TV+ Dizileri': ['apple tv+', 'apple tv'],
  'GAIN Dizileri': ['gain'],
  'Exxen Dizileri': ['exxen'],
  'Gunluk Diziler': ['gunluk', 'gunluk diziler', 'daily'],
  Anime: ['anime']
};

const EPISODE_PATTERN = /\bS(\d{1,2})E(\d{1,3})\b/i;
const LEADING_REGION_PATTERN = /^[A-Z0-9]{2,4}\s*[|:-]\s*/;
const TRAILING_STREAM_LABEL_PATTERN = /\s+(24\/7|FHD|HD|4K|UHD)$/i;
const MOVIE_EXTENSION_PATTERN = /\.(mkv|mp4|avi|mov|m4v|webm)(\?|$)/i;

function parseExtInfLine(line) {
  const nameMatch = line.match(/tvg-name="([^"]+)"/i);
  const logoMatch = line.match(/tvg-logo="([^"]+)"/i);
  const groupMatch = line.match(/group-title="([^"]+)"/i);
  const countryMatch = line.match(/tvg-country="([^"]+)"/i);
  const commaIndex = line.lastIndexOf(',');

  return {
    tvgName: nameMatch?.[1] || '',
    logo: logoMatch?.[1] || '',
    rawGroup: groupMatch?.[1] || 'Diger',
    tvgCountry: countryMatch?.[1] || '',
    title: commaIndex > -1 ? line.slice(commaIndex + 1).trim() : nameMatch?.[1] || 'Unknown'
  };
}

function normalizePlaylistGroup(rawGroup) {
  return (rawGroup || 'Diger')
    .replace(/^[A-Z]{2}:/, '')
    .replace('INT:', '')
    .replace('TR | ', '')
    .trim() || 'Diger';
}

function normalizeSeriesGenre(rawGroup, fullTitle) {
  const normalizedGroup = normalizePlaylistGroup(rawGroup);
  const haystack = `${normalizedGroup} ${fullTitle}`.toLowerCase();
  const matchedPlatform = Object.entries(SERIES_PLATFORM_ALIASES).find(([, aliases]) =>
    aliases.some((alias) => haystack.includes(alias))
  );

  return matchedPlatform ? matchedPlatform[0] : normalizedGroup;
}

function stripPlatformAlias(value, genre) {
  const aliases = SERIES_PLATFORM_ALIASES[genre] || [];
  const lowered = value.toLowerCase();

  for (const alias of aliases) {
    if (lowered.startsWith(alias)) {
      return value.slice(alias.length).trim();
    }
  }

  return value;
}

function extractSeriesMetadata(fullTitle, genre) {
  const normalizedTitle = String(fullTitle || '').replace(/\s+/g, ' ').trim();
  const episodeMatch = normalizedTitle.match(EPISODE_PATTERN);

  let seriesName = episodeMatch
    ? normalizedTitle.slice(0, episodeMatch.index).trim()
    : normalizedTitle;

  seriesName = seriesName.replace(LEADING_REGION_PATTERN, '').trim();
  seriesName = stripPlatformAlias(seriesName, genre);
  seriesName = seriesName.replace(TRAILING_STREAM_LABEL_PATTERN, '').trim();

  return {
    seriesName: seriesName || normalizedTitle || 'Unknown',
    season: episodeMatch ? parseInt(episodeMatch[1], 10) : 1,
    episode: episodeMatch ? parseInt(episodeMatch[2], 10) : 1
  };
}

function parsePlaylistEntries(content) {
  const entries = [];
  let current = null;
  const lines = String(content || '').split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('#EXTINF:')) {
      current = parseExtInfLine(trimmed);
      continue;
    }

    if (!trimmed || trimmed.startsWith('#') || !current) {
      continue;
    }

    entries.push({
      ...current,
      url: trimmed
    });

    current = null;
  }

  return entries;
}

function createLogoUrl(entry, logoProxyBuilder) {
  if (!entry?.logo) {
    return '';
  }

  if (typeof logoProxyBuilder === 'function') {
    return logoProxyBuilder(entry.logo);
  }

  return entry.logo;
}

function createStreamUrl(entry, streamProxyBuilder) {
  if (!entry?.url) {
    return '';
  }

  if (typeof streamProxyBuilder === 'function') {
    return streamProxyBuilder(entry.url);
  }

  return entry.url;
}

function buildSeriesCatalog(content, options = {}) {
  const { streamProxyBuilder, logoProxyBuilder } = options;
  const seriesMap = new Map();
  const entries = parsePlaylistEntries(content)
    .filter((entry) => String(entry.url || '').toLowerCase().includes('/series/'));

  entries.forEach((entry, index) => {
    const genre = normalizeSeriesGenre(entry.rawGroup, entry.title);
    const metadata = extractSeriesMetadata(entry.title, genre);
    const key = metadata.seriesName.toLowerCase();
    const logo = createLogoUrl(entry, logoProxyBuilder);
    const streamUrl = createStreamUrl(entry, streamProxyBuilder);

    if (!seriesMap.has(key)) {
      seriesMap.set(key, {
        name: metadata.seriesName,
        genre,
        logo: '',
        logoCandidates: [],
        seasons: {},
        episodeKeys: new Set()
      });
    }

    const series = seriesMap.get(key);
    if (logo && !series.logoCandidates.includes(logo)) {
      series.logoCandidates.push(logo);
      if (!series.logo) {
        series.logo = logo;
      }
    }

    const episodeKey = `${metadata.season}:${metadata.episode}:${entry.title.toLowerCase()}:${streamUrl}`;
    if (series.episodeKeys.has(episodeKey)) {
      return;
    }

    series.episodeKeys.add(episodeKey);

    if (!series.seasons[metadata.season]) {
      series.seasons[metadata.season] = [];
    }

    series.seasons[metadata.season].push({
      id: `${key}:${metadata.season}:${metadata.episode}:${index}`,
      seriesName: metadata.seriesName,
      season: metadata.season,
      episode: metadata.episode,
      fullTitle: entry.title,
      logo,
      genre,
      url: streamUrl
    });
  });

  return Array.from(seriesMap.values())
    .map((series) => {
      Object.keys(series.seasons).forEach((seasonKey) => {
        series.seasons[seasonKey].sort((left, right) => left.episode - right.episode);
      });

      if (!series.logo && series.logoCandidates.length > 0) {
        series.logo = series.logoCandidates[0];
      }

      delete series.episodeKeys;
      return series;
    })
    .sort((left, right) => left.name.localeCompare(right.name, 'tr'));
}

function buildMoviesCatalog(content, options = {}) {
  const { streamProxyBuilder, logoProxyBuilder } = options;
  const movieMap = new Map();
  const entries = parsePlaylistEntries(content)
    .filter((entry) => {
      const loweredUrl = String(entry.url || '').toLowerCase();
      return loweredUrl.includes('/movie/') || MOVIE_EXTENSION_PATTERN.test(loweredUrl);
    });

  entries.forEach((entry, index) => {
    const genre = normalizePlaylistGroup(entry.rawGroup);
    const loweredGenre = genre.toLowerCase();
    if (loweredGenre.includes('xxx') || loweredGenre.includes('adult')) {
      return;
    }

    const title = String(entry.title || '').trim();
    if (!title) {
      return;
    }

    const key = title.toLowerCase();
    const logo = createLogoUrl(entry, logoProxyBuilder);
    const streamUrl = createStreamUrl(entry, streamProxyBuilder);

    if (!movieMap.has(key)) {
      movieMap.set(key, {
        id: `movie:${index}`,
        title,
        logo: '',
        logoCandidates: [],
        genre,
        url: streamUrl
      });
    }

    const movie = movieMap.get(key);
    if (logo && !movie.logoCandidates.includes(logo)) {
      movie.logoCandidates.push(logo);
      if (!movie.logo) {
        movie.logo = logo;
      }
    }
    if (!movie.url) {
      movie.url = streamUrl;
    }
  });

  return Array.from(movieMap.values()).sort((left, right) => left.title.localeCompare(right.title, 'tr'));
}

module.exports = {
  parsePlaylistEntries,
  normalizePlaylistGroup,
  buildSeriesCatalog,
  buildMoviesCatalog
};
