#!/usr/bin/env node

function normalizeBaseUrl(value) {
  const normalized = String(value || 'http://127.0.0.1:9199').trim();
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}

function buildUrl(baseUrl, path) {
  return new URL(path, `${baseUrl}/`).toString();
}

function expect(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Expected JSON but received: ${text.slice(0, 200)}`);
  }
}

function assertReleaseHeaders(response, label) {
  const apiVersion = response.headers.get('x-api-version');
  const releaseId = response.headers.get('x-release-id');

  expect(apiVersion, `${label}: missing X-Api-Version header`);
  expect(releaseId, `${label}: missing X-Release-Id header`);
}

async function checkJsonEndpoint(baseUrl, label, path, allowedStatuses = [200]) {
  const response = await fetch(buildUrl(baseUrl, path), {
    redirect: 'manual',
    headers: {
      'Accept': 'application/json'
    }
  });

  expect(
    allowedStatuses.includes(response.status),
    `${label}: expected status ${allowedStatuses.join('/')} but received ${response.status}`
  );

  assertReleaseHeaders(response, label);
  const payload = await readJson(response);
  return { response, payload };
}

async function checkMediaEndpoint(url, label, options = {}) {
  const response = await fetch(url, {
    method: options.method || 'GET',
    redirect: 'manual',
    headers: options.headers || {}
  });

  expect(response.status >= 200 && response.status < 300, `${label}: expected 2xx but received ${response.status}`);
  expect(
    (response.headers.get('cross-origin-resource-policy') || '').toLowerCase() === 'cross-origin',
    `${label}: Cross-Origin-Resource-Policy must be cross-origin`
  );
  expect(
    (response.headers.get('cache-control') || '').toLowerCase().includes('no-store'),
    `${label}: Cache-Control must include no-store`
  );

  if (label.includes('stream')) {
    expect(
      (response.headers.get('x-accel-buffering') || '').toLowerCase() === 'no',
      `${label}: X-Accel-Buffering must be no`
    );
  }
}

function buildAuthenticatedMediaUrl(baseUrl, pathTemplate, targetUrl) {
  return `${baseUrl}${pathTemplate}&url=${encodeURIComponent(targetUrl)}`;
}

async function main() {
  const baseUrl = normalizeBaseUrl(process.env.API_BASE_URL);
  const checks = [
    { label: 'root', path: '/', statuses: [200] },
    { label: 'api-root', path: '/api/v1', statuses: [200] },
    { label: 'api-health', path: '/api/v1/health', statuses: [200] },
    { label: 'api-ready', path: '/api/v1/ready', statuses: [200, 503] },
    { label: 'm3u-health', path: '/api/v1/m3u/health', statuses: [200] }
  ];

  const results = [];

  for (const check of checks) {
    const result = await checkJsonEndpoint(baseUrl, check.label, check.path, check.statuses);

    if (check.label === 'root' || check.label === 'api-root') {
      expect(result.payload?.data?.apiRoot === '/api/v1', `${check.label}: data.apiRoot must be /api/v1`);
      expect(result.payload?.data?.releaseId, `${check.label}: data.releaseId is required`);
    }

    if (check.label === 'api-health') {
      expect(result.payload?.data?.releaseId, 'api-health: data.releaseId is required');
      expect(result.payload?.data?.service === 'iptv-platform', 'api-health: service must be iptv-platform');
    }

    if (check.label === 'api-ready') {
      expect(result.payload?.data?.releaseId, 'api-ready: data.releaseId is required');
    }

    results.push({
      label: check.label,
      status: result.response.status,
      releaseId: result.response.headers.get('x-release-id'),
      version: result.response.headers.get('x-api-version')
    });
  }

  const streamCode = String(process.env.SMOKE_USER_CODE || '').trim();
  const streamToken = String(process.env.SMOKE_ACCESS_TOKEN || '').trim();
  const streamTargetUrl = String(process.env.SMOKE_STREAM_TARGET_URL || '').trim();
  const logoTargetUrl = String(process.env.SMOKE_LOGO_TARGET_URL || '').trim();

  if (streamCode && streamToken && streamTargetUrl) {
    const streamUrl = buildAuthenticatedMediaUrl(
      baseUrl,
      `/api/v1/stream/${encodeURIComponent(streamCode)}?token=${encodeURIComponent(streamToken)}`,
      streamTargetUrl
    );

    await checkMediaEndpoint(streamUrl, 'stream-head', { method: 'HEAD' });
    results.push({ label: 'stream-head', status: 200, releaseId: 'verified', version: 'verified' });
  } else {
    results.push({ label: 'stream-head', status: 'skipped', releaseId: 'n/a', version: 'n/a' });
  }

  if (streamCode && streamToken && logoTargetUrl) {
    const logoUrl = buildAuthenticatedMediaUrl(
      baseUrl,
      `/api/v1/m3u/logo/${encodeURIComponent(streamCode)}?token=${encodeURIComponent(streamToken)}`,
      logoTargetUrl
    );

    await checkMediaEndpoint(logoUrl, 'logo-get');
    results.push({ label: 'logo-get', status: 200, releaseId: 'verified', version: 'verified' });
  } else {
    results.push({ label: 'logo-get', status: 'skipped', releaseId: 'n/a', version: 'n/a' });
  }

  console.table(results);
}

main().catch((error) => {
  console.error(`[smoke:api] ${error.message}`);
  process.exit(1);
});
