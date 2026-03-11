const packageMetadata = require('../../package.json');

function normalizeReleaseValue(value, fallback) {
  const normalized = String(value || '').trim();
  return normalized || fallback;
}

function getApiVersion() {
  return normalizeReleaseValue(
    process.env.API_VERSION || process.env.npm_package_version || packageMetadata.version,
    '1.0.0'
  );
}

function getReleaseId() {
  return normalizeReleaseValue(
    process.env.RELEASE_ID
      || process.env.GIT_COMMIT_SHA
      || process.env.RENDER_GIT_COMMIT
      || process.env.RAILWAY_GIT_COMMIT_SHA
      || process.env.SOURCE_VERSION
      || process.env.HEROKU_RELEASE_VERSION,
    getApiVersion()
  );
}

function getReleaseInfo() {
  return {
    service: 'iptv-platform',
    version: getApiVersion(),
    releaseId: getReleaseId(),
    environment: process.env.NODE_ENV || 'development',
    apiRoot: '/api/v1'
  };
}

function applyReleaseHeaders(res, releaseInfo = getReleaseInfo()) {
  res.setHeader('X-Api-Version', releaseInfo.version);
  res.setHeader('X-Release-Id', releaseInfo.releaseId);
}

module.exports = {
  applyReleaseHeaders,
  getReleaseInfo
};
