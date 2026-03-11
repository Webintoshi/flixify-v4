const {
  DEFAULT_LIVE_COUNTRY_CODE,
  LIVE_TV_COUNTRIES,
  LIVE_TV_CATEGORY_ALIASES
} = require('../config/liveTvTaxonomy');
const { parsePlaylistEntries } = require('./catalogBuilder');
const { extractXtreamStreamId } = require('./xtreamPlaylistUrl');

function normalizeLabel(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s*([✨⭐])/gu, ' $1 ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeKey(value) {
  return normalizeLabel(value).toLocaleLowerCase('tr-TR');
}

const countryByCode = new Map();
const countryByCategory = new Map();
const canonicalCategoryByKey = new Map();
const aliasCategoryByKey = new Map();

LIVE_TV_COUNTRIES.forEach((country) => {
  countryByCode.set(country.code, country);

  country.categories.forEach((category) => {
    const normalizedCategory = normalizeLabel(category);
    countryByCategory.set(normalizedCategory, country.code);
    canonicalCategoryByKey.set(normalizeKey(normalizedCategory), normalizedCategory);
  });

  if (country.fallbackCategory) {
    const fallbackLabel = normalizeLabel(country.fallbackCategory);
    countryByCategory.set(fallbackLabel, country.code);
    canonicalCategoryByKey.set(normalizeKey(fallbackLabel), fallbackLabel);
  }
});

Object.entries(LIVE_TV_CATEGORY_ALIASES).forEach(([alias, canonical]) => {
  aliasCategoryByKey.set(normalizeKey(alias), normalizeLabel(canonical));
});

function normalizeLiveCountryCode(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return countryByCode.has(normalized) ? normalized : DEFAULT_LIVE_COUNTRY_CODE;
}

function resolveCountryConfigByGroup(groupLabel) {
  const normalizedGroup = normalizeLabel(groupLabel);
  return LIVE_TV_COUNTRIES.find((country) => (
    Array.isArray(country.matchers) && country.matchers.some((matcher) => matcher.test(normalizedGroup))
  )) || null;
}

function resolveLiveCategory(rawGroup) {
  const normalizedGroup = normalizeLabel(rawGroup);
  const normalizedKey = normalizeKey(normalizedGroup);

  if (!normalizedGroup) {
    return 'Diger';
  }

  if (aliasCategoryByKey.has(normalizedKey)) {
    return aliasCategoryByKey.get(normalizedKey);
  }

  if (canonicalCategoryByKey.has(normalizedKey)) {
    return canonicalCategoryByKey.get(normalizedKey);
  }

  const country = resolveCountryConfigByGroup(normalizedGroup);
  if (country?.fallbackCategory) {
    return normalizeLabel(country.fallbackCategory);
  }

  return normalizedGroup;
}

function resolveLiveCountryCode(rawGroup, resolvedCategory = '') {
  const normalizedCategory = normalizeLabel(resolvedCategory);
  if (countryByCategory.has(normalizedCategory)) {
    return countryByCategory.get(normalizedCategory);
  }

  const country = resolveCountryConfigByGroup(rawGroup);
  if (country?.code) {
    return country.code;
  }

  return DEFAULT_LIVE_COUNTRY_CODE;
}

function inferSourceType(value = '') {
  const lowered = String(value || '').toLowerCase();
  if (lowered.includes('.m3u8')) return 'hls';
  if (lowered.includes('.ts')) return 'mpegts';
  return 'unknown';
}

function isVodUrl(value = '') {
  const lowered = String(value || '').toLowerCase();
  if (!lowered) {
    return true;
  }

  if (lowered.includes('/movie/') || lowered.includes('/series/') || lowered.includes('/vod/')) {
    return true;
  }

  return /\.(mkv|mp4|avi|mov|webm|m4v)(\?|$)/i.test(lowered);
}

function isLiveEntry(entry) {
  return !isVodUrl(entry?.url || '');
}

function normalizeLiveChannelName(name = '') {
  return String(name || '')
    .toLowerCase()
    .replace(/[|·•]/g, ' ')
    .replace(/\b(tr|turkiye|türkiye)\b/gu, ' ')
    .replace(/\b(ultra|uhd|fhd|full\s*hd|hd|sd|4k|8k|raw|hevc|h\.?265|h\.?264)\b/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getSourceTypeScore(sourceType = '') {
  if (sourceType === 'hls') return 30;
  if (sourceType === 'mpegts') return 20;
  return 10;
}

function getQualityScore(name = '') {
  const lowered = String(name || '').toLowerCase();
  if (/\b8k\b/.test(lowered)) return 20;
  if (/\b4k\b|\buhd\b/.test(lowered)) return 18;
  if (/\bfhd\b|full\s*hd/.test(lowered)) return 16;
  if (/\bhd\b/.test(lowered)) return 14;
  if (/\bsd\b/.test(lowered)) return 12;
  if (/\bhevc\b|h\.?265/.test(lowered)) return 7;
  if (/\braw\b/.test(lowered)) return 5;
  return 8;
}

function collapseLiveVariants(items = []) {
  const grouped = new Map();

  items.forEach((item, index) => {
    const baseName = normalizeLiveChannelName(item?.name);
    const key = `${item?.countryCode || DEFAULT_LIVE_COUNTRY_CODE}:${item?.group || ''}:${baseName || item?.name || index}`;
    const score = getSourceTypeScore(item?.sourceType) + getQualityScore(item?.name);
    const existing = grouped.get(key);

    if (!existing || score > existing.score) {
      grouped.set(key, { index, score, item });
    }
  });

  return Array.from(grouped.values())
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.item);
}

function buildLiveCountryTree(items = []) {
  const countryCounts = new Map();
  const categoryCounts = new Map();

  items.forEach((item) => {
    const countryCode = normalizeLiveCountryCode(item?.countryCode);
    const categoryLabel = normalizeLabel(item?.group);
    countryCounts.set(countryCode, (countryCounts.get(countryCode) || 0) + 1);

    if (!categoryCounts.has(countryCode)) {
      categoryCounts.set(countryCode, new Map());
    }

    const countryCategoryCounts = categoryCounts.get(countryCode);
    countryCategoryCounts.set(categoryLabel, (countryCategoryCounts.get(categoryLabel) || 0) + 1);
  });

  return LIVE_TV_COUNTRIES.map((country) => {
    const currentCategoryCounts = categoryCounts.get(country.code) || new Map();
    const configuredLabels = country.categories.map((label) => normalizeLabel(label));
    const categories = configuredLabels.map((label) => ({
      id: `group:${normalizeKey(label)}`,
      name: label,
      count: currentCategoryCounts.get(label) || 0
    }));

    if (country.fallbackCategory) {
      const fallbackLabel = normalizeLabel(country.fallbackCategory);
      const fallbackCount = currentCategoryCounts.get(fallbackLabel) || 0;
      if (fallbackCount > 0) {
        categories.push({
          id: `group:${normalizeKey(fallbackLabel)}`,
          name: fallbackLabel,
          count: fallbackCount
        });
      }
    }

    const configuredSet = new Set(categories.map((category) => category.name));
    const extraCategories = Array.from(currentCategoryCounts.entries())
      .filter(([label]) => !configuredSet.has(label))
      .map(([label, count]) => ({
        id: `group:${normalizeKey(label)}`,
        name: label,
        count
      }))
      .sort((left, right) => left.name.localeCompare(right.name, 'tr', { sensitivity: 'base' }));

    return {
      code: country.code,
      name: country.name,
      defaultSelected: Boolean(country.defaultSelected),
      count: countryCounts.get(country.code) || 0,
      categories: [...categories, ...extraCategories]
    };
  });
}

function buildLiveCatalog(content) {
  const items = parsePlaylistEntries(content)
    .filter((entry) => isLiveEntry(entry))
    .map((entry) => {
      const group = resolveLiveCategory(entry.rawGroup);
      const countryCode = resolveLiveCountryCode(entry.rawGroup, group);
      const streamId = extractXtreamStreamId(entry.url);

      if (!streamId) {
        return null;
      }

      const name = String(entry.title || entry.tvgName || 'Bilinmiyor').trim() || 'Bilinmiyor';
      return {
        id: `live:${countryCode}:${streamId}`,
        name,
        logo: String(entry.logo || '').trim(),
        group,
        countryCode,
        streamId,
        sourceType: inferSourceType(entry.url),
        sampleUrl: entry.url
      };
    })
    .filter(Boolean);

  const collapsedItems = collapseLiveVariants(items);

  return {
    items: collapsedItems,
    countries: buildLiveCountryTree(collapsedItems)
  };
}

module.exports = {
  DEFAULT_LIVE_COUNTRY_CODE,
  buildLiveCatalog,
  buildLiveCountryTree,
  normalizeLiveCountryCode,
  normalizeLabel,
  normalizeKey,
  resolveLiveCategory,
  resolveLiveCountryCode
};
