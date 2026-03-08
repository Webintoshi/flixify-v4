/**
 * M3U Proxy Controller
 *
 * V4 goal:
 * - frontend never sees the provider URL directly
 * - playlists are rewritten to same-origin proxy URLs
 * - stream and logo requests are validated with the user's access token
 */

const axios = require('axios');
const CircuitBreaker = require('opossum');
const jwt = require('jsonwebtoken');
const logger = require('../../config/logger');
const { asyncHandler } = require('../middleware/errorHandler');

class M3uController {
  constructor(getUserM3U, cacheService, jwtSecret) {
    this._getUserM3U = getUserM3U;
    this._cacheService = cacheService;
    this._jwtSecret = jwtSecret;
    this._userProviderOrigins = new Map();
    this._userAllowedOrigins = new Map();

    this._circuitBreaker = new CircuitBreaker(this._fetchM3u.bind(this), {
      timeout: parseInt(process.env.PROXY_TIMEOUT_MS, 10) || 30000,
      errorThresholdPercentage: 50,
      resetTimeout: parseInt(process.env.CIRCUIT_BREAKER_RESET_TIMEOUT, 10) || 30000,
      rollingCountTimeout: 10000,
      rollingCountBuckets: 10,
      name: 'm3u-fetcher'
    });

    this._setupCircuitBreakerEvents();
  }

  _parseProxyUrl(proxyUrl) {
    let parsedProxy;
    try {
      parsedProxy = new URL(proxyUrl);
    } catch (error) {
      logger.error('Invalid provider proxy URL', { proxyUrl, error: error.message });
      return null;
    }

    if (!['http:', 'https:'].includes(parsedProxy.protocol)) {
      logger.error('Unsupported provider proxy protocol', {
        proxyUrl,
        protocol: parsedProxy.protocol
      });
      return null;
    }

    const config = {
      protocol: parsedProxy.protocol.replace(':', ''),
      host: parsedProxy.hostname,
      port: parsedProxy.port ? parseInt(parsedProxy.port, 10) : 80
    };

    if (parsedProxy.username || parsedProxy.password) {
      config.auth = {
        username: decodeURIComponent(parsedProxy.username),
        password: decodeURIComponent(parsedProxy.password)
      };
    }

    return config;
  }

  _getProxyConfigs() {
    const proxyList = process.env.PROVIDER_HTTP_PROXIES || process.env.PROVIDER_HTTP_PROXY || '';
    if (!proxyList.trim()) {
      return [];
    }

    return proxyList
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => this._parseProxyUrl(value))
      .filter(Boolean);
  }

  _createAxiosConfig(overrides = {}, proxy = null) {
    const config = {
      timeout: 30000,
      headers: {
        'User-Agent': 'Flixify-V4-Proxy/1.0',
        'Accept': '*/*'
      },
      ...overrides
    };

    if (proxy) {
      config.proxy = proxy;
    }

    return config;
  }

  _destroyResponseStream(response) {
    if (response?.data && typeof response.data.destroy === 'function') {
      response.data.destroy();
    }
  }

  _copyHeaderIfPresent(res, upstreamHeaders, headerName, fallbackValue = null) {
    const value = upstreamHeaders?.[headerName.toLowerCase()] ?? fallbackValue;
    if (value !== undefined && value !== null && value !== '') {
      res.setHeader(headerName, value);
    }
  }

  _buildUpstreamStreamHeaders(req, fallbackAccept = '*/*') {
    const headers = {
      'User-Agent': req.headers['user-agent'] || 'Flixify-V4-Proxy/1.0',
      'Accept': req.headers.accept || fallbackAccept
    };

    if (req.headers.range) {
      headers.Range = req.headers.range;
    }

    if (req.headers['if-range']) {
      headers['If-Range'] = req.headers['if-range'];
    }

    return headers;
  }

  _setProxyMediaHeaders(res, upstreamHeaders, req, fallbackContentType = null) {
    res.setHeader('Cache-Control', 'private, no-store');
    this._copyHeaderIfPresent(res, upstreamHeaders, 'Content-Type', fallbackContentType);
    this._copyHeaderIfPresent(res, upstreamHeaders, 'Content-Length');
    this._copyHeaderIfPresent(res, upstreamHeaders, 'Content-Range');
    this._copyHeaderIfPresent(res, upstreamHeaders, 'Accept-Ranges', req.headers.range ? 'bytes' : null);
    this._copyHeaderIfPresent(res, upstreamHeaders, 'Last-Modified');
    this._copyHeaderIfPresent(res, upstreamHeaders, 'ETag');
  }

  _getContainerType(targetUrl, contentType = '') {
    const normalizedType = String(contentType || '').toLowerCase();
    const pathname = (() => {
      try {
        return new URL(targetUrl).pathname.toLowerCase();
      } catch {
        return String(targetUrl || '').toLowerCase();
      }
    })();

    if (
      normalizedType.includes('application/vnd.apple.mpegurl') ||
      normalizedType.includes('application/x-mpegurl') ||
      pathname.endsWith('.m3u8')
    ) {
      return 'hls';
    }

    if (normalizedType.includes('video/mp4') || pathname.endsWith('.mp4') || pathname.endsWith('.m4v')) {
      return 'mp4';
    }

    if (normalizedType.includes('video/webm') || pathname.endsWith('.webm')) {
      return 'webm';
    }

    if (
      normalizedType.includes('video/x-matroska') ||
      normalizedType.includes('video/matroska') ||
      pathname.endsWith('.mkv')
    ) {
      return 'mkv';
    }

    if (normalizedType.includes('video/mp2t') || pathname.endsWith('.ts')) {
      return 'ts';
    }

    return 'unknown';
  }

  _isPlaylistResponse(targetUrl, contentType = '') {
    return this._getContainerType(targetUrl, contentType) === 'hls';
  }

  _rewriteTaggedUri(line, context) {
    return line.replace(/URI="([^"]+)"/gi, (match, rawValue) => {
      try {
        const resolved = new URL(rawValue, context.baseTargetUrl).toString();
        return `URI="${this._buildStreamProxyUrl(context.baseApiUrl, context.code, context.token, resolved)}"`;
      } catch {
        return match;
      }
    });
  }

  _rewriteHlsPlaylist(content, context) {
    return content
      .split(/\r?\n/)
      .map((line) => {
        const trimmed = line.trim();

        if (!trimmed) {
          return line;
        }

        if (trimmed.startsWith('#')) {
          return this._rewriteTaggedUri(line, context);
        }

        try {
          const resolved = new URL(trimmed, context.baseTargetUrl).toString();
          return this._buildStreamProxyUrl(
            context.baseApiUrl,
            context.code,
            context.token,
            resolved
          );
        } catch {
          return line;
        }
      })
      .join('\n');
  }

  _buildProbePayload(targetUrl, upstream) {
    const headers = upstream?.headers || {};
    const contentType = headers['content-type'] || 'application/octet-stream';
    const contentLength = headers['content-length'] ? parseInt(headers['content-length'], 10) : null;
    const containerType = this._getContainerType(targetUrl, contentType);
    const acceptRangesHeader = String(headers['accept-ranges'] || '').toLowerCase();
    const acceptRanges = acceptRangesHeader.includes('bytes');
    const seekableGuess = acceptRanges || ['mp4', 'webm', 'mkv', 'hls'].includes(containerType);

    return {
      contentType,
      acceptRanges,
      contentLength: Number.isFinite(contentLength) ? contentLength : null,
      seekableGuess,
      containerType,
      codecRisk: containerType === 'ts' || contentType.toLowerCase().includes('video/mp2t')
    };
  }

  _validateStreamResponse(response) {
    if (!response) {
      throw new Error('Provider returned an empty stream response');
    }

    if (response.status >= 400) {
      const error = new Error(`Provider returned HTTP ${response.status}`);
      error.statusCode = response.status;
      throw error;
    }

    const contentType = (response.headers['content-type'] || '').toLowerCase();
    const contentLength = response.headers['content-length'];

    if (contentLength === '0') {
      const error = new Error('Provider returned an empty stream');
      error.statusCode = 502;
      throw error;
    }

    // Some dead IPTV entries return an HTML landing page with 200 OK.
    if (
      contentType.includes('text/html') ||
      contentType.includes('application/json') ||
      contentType.includes('text/plain')
    ) {
      const error = new Error(`Provider returned invalid stream content-type: ${contentType || 'unknown'}`);
      error.statusCode = 502;
      throw error;
    }
  }

  async _requestViaProviderProxy(overrides = {}, responseValidator = null) {
    const proxies = this._getProxyConfigs();
    const candidates = proxies.length ? proxies : [null];
    let lastError = null;

    for (const proxy of candidates) {
      const proxyLabel = proxy ? `${proxy.host}:${proxy.port}` : 'DIRECT';

      try {
        const response = await axios(this._createAxiosConfig(overrides, proxy));

        if (typeof responseValidator === 'function') {
          try {
            responseValidator(response);
          } catch (validationError) {
            this._destroyResponseStream(response);
            throw validationError;
          }
        }

        return response;
      } catch (error) {
        lastError = error;
        logger.warn('Provider upstream attempt failed', {
          proxy: proxyLabel,
          url: overrides.url,
          error: error.message,
          statusCode: error.response?.status
        });
      }
    }

    throw lastError || new Error('Provider request failed');
  }

  _setupCircuitBreakerEvents() {
    this._circuitBreaker.on('open', () => {
      logger.error('M3U circuit breaker opened');
    });

    this._circuitBreaker.on('halfOpen', () => {
      logger.warn('M3U circuit breaker half-open');
    });

    this._circuitBreaker.on('close', () => {
      logger.info('M3U circuit breaker closed');
    });
  }

  async _fetchM3u(url) {
    const response = await this._requestViaProviderProxy({
      method: 'get',
      url,
      timeout: 60000,
      responseType: 'text',
      maxRedirects: 5,
      validateStatus: () => true
    });

    if (response.status >= 400) {
      throw new Error(`Provider returned HTTP ${response.status}`);
    }

    if (!response.data || !response.data.trim()) {
      throw new Error('Provider returned empty playlist');
    }

    return response.data;
  }

  _getBaseApiUrl(req) {
    return `${req.protocol}://${req.get('host')}/api/v1`;
  }

  _buildStreamProxyUrl(baseApiUrl, code, token, targetUrl) {
    return `${baseApiUrl}/stream/${encodeURIComponent(code)}?token=${encodeURIComponent(token)}&url=${encodeURIComponent(targetUrl)}`;
  }

  _buildLogoProxyUrl(baseApiUrl, code, token, targetUrl) {
    return `${baseApiUrl}/m3u/logo/${encodeURIComponent(code)}?token=${encodeURIComponent(token)}&url=${encodeURIComponent(targetUrl)}`;
  }

  _isHttpUrl(value) {
    return typeof value === 'string' && /^https?:\/\//i.test(value);
  }

  _addAllowedOrigin(origins, value) {
    if (!this._isHttpUrl(value)) {
      return;
    }

    try {
      origins.add(new URL(value).origin);
    } catch (error) {
      logger.warn('Skipping invalid allowed origin candidate', {
        value,
        error: error.message
      });
    }
  }

  _extractAllowedOrigins(content, providerUrl) {
    const origins = new Set();

    this._addAllowedOrigin(origins, providerUrl);

    content
      .split(/\r?\n/)
      .forEach((line) => {
        const trimmed = line.trim();

        if (!trimmed) {
          return;
        }

        if (trimmed.startsWith('#EXTINF:')) {
          const logoMatch = trimmed.match(/tvg-logo="([^"]+)"/i);
          if (logoMatch?.[1]) {
            this._addAllowedOrigin(origins, logoMatch[1]);
          }
          return;
        }

        if (trimmed.startsWith('#')) {
          return;
        }

        this._addAllowedOrigin(origins, trimmed);
      });

    return Array.from(origins);
  }

  async _rememberAllowedOrigins(code, content, providerUrl) {
    const origins = this._extractAllowedOrigins(content, providerUrl);
    const cacheKey = `m3u:allowed-origins:${code}`;
    const originSet = new Set(origins);

    this._userAllowedOrigins.set(code, originSet);
    await this._cacheService.set(cacheKey, origins, 300);

    return originSet;
  }

  _rewriteExtinfLine(line, context) {
    return line.replace(/tvg-logo="([^"]+)"/i, (match, logoUrl) => {
      if (!this._isHttpUrl(logoUrl)) {
        return match;
      }

      const proxiedLogoUrl = this._buildLogoProxyUrl(
        context.baseApiUrl,
        context.code,
        context.token,
        logoUrl
      );

      return `tvg-logo="${proxiedLogoUrl}"`;
    });
  }

  _rewritePlaylist(content, context) {
    return content
      .split(/\r?\n/)
      .map((line) => {
        const trimmed = line.trim();

        if (!trimmed) {
          return line;
        }

        if (trimmed.startsWith('#EXTINF:')) {
          return this._rewriteExtinfLine(line, context);
        }

        if (trimmed.startsWith('#')) {
          return line;
        }

        if (!this._isHttpUrl(trimmed)) {
          return line;
        }

        return this._buildStreamProxyUrl(
          context.baseApiUrl,
          context.code,
          context.token,
          trimmed
        );
      })
      .join('\n');
  }

  _resolveAccessToken(req) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return req.query.token || null;
  }

  _verifyAccessToken(token, expectedCode) {
    if (!token) {
      const error = new Error('Missing access token');
      error.statusCode = 401;
      throw error;
    }

    const decoded = jwt.verify(token, this._jwtSecret, {
      issuer: 'iptv-platform',
      audience: 'iptv-users'
    });

    if (decoded.code !== expectedCode) {
      const error = new Error('Token does not match requested user');
      error.statusCode = 403;
      throw error;
    }

    return decoded;
  }

  async _getProviderOrigin(code) {
    if (this._userProviderOrigins.has(code)) {
      return this._userProviderOrigins.get(code);
    }

    const result = await this._getUserM3U.execute({ code });
    const origin = new URL(result.url).origin;
    this._userProviderOrigins.set(code, origin);
    return origin;
  }

  async _getAllowedOrigins(code) {
    if (this._userAllowedOrigins.has(code)) {
      return this._userAllowedOrigins.get(code);
    }

    const cacheKey = `m3u:allowed-origins:${code}`;
    const cachedOrigins = await this._cacheService.get(cacheKey);

    if (Array.isArray(cachedOrigins) && cachedOrigins.length > 0) {
      const originSet = new Set(cachedOrigins);
      this._userAllowedOrigins.set(code, originSet);
      return originSet;
    }

    const providerOrigin = await this._getProviderOrigin(code);
    const fallbackSet = new Set([providerOrigin]);
    this._userAllowedOrigins.set(code, fallbackSet);
    return fallbackSet;
  }

  async _assertAllowedProxyTarget(code, targetUrl) {
    let parsedTarget;

    try {
      parsedTarget = new URL(targetUrl);
    } catch (error) {
      const invalidUrlError = new Error('Invalid proxy target URL');
      invalidUrlError.statusCode = 400;
      throw invalidUrlError;
    }

    if (!['http:', 'https:'].includes(parsedTarget.protocol)) {
      const protocolError = new Error('Unsupported proxy target protocol');
      protocolError.statusCode = 400;
      throw protocolError;
    }

    const allowedOrigins = await this._getAllowedOrigins(code);
    if (!allowedOrigins.has(parsedTarget.origin)) {
      const originError = new Error('Proxy target origin is not allowed');
      originError.statusCode = 403;
      throw originError;
    }

    return parsedTarget;
  }

  proxyM3u = asyncHandler(async (req, res) => {
    const { code } = req.params;
    const accessToken = req.user.token;
    const baseApiUrl = this._getBaseApiUrl(req);

    let m3uUrl;
    try {
      const result = await this._getUserM3U.execute({ code });
      m3uUrl = result.url;

      if (!m3uUrl) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'No M3U URL assigned'
        });
      }

      this._userProviderOrigins.set(code, new URL(m3uUrl).origin);
    } catch (error) {
      logger.error('Failed to resolve user M3U URL', { code, error: error.message });
      return res.status(403).json({
        error: 'Forbidden',
        message: error.message
      });
    }

    const cacheKey = `m3u:content:${code}`;
    let rawPlaylist = await this._cacheService.get(cacheKey);

    if (!rawPlaylist) {
      try {
        rawPlaylist = await this._circuitBreaker.fire(m3uUrl);
        await this._cacheService.set(cacheKey, rawPlaylist, 300);
      } catch (error) {
        logger.error('Provider playlist fetch failed', {
          code,
          error: error.message
        });
        return res.status(502).json({
          error: 'Bad Gateway',
          message: error.message
        });
      }
    }

    const rewrittenPlaylist = this._rewritePlaylist(rawPlaylist, {
      baseApiUrl,
      code,
      token: accessToken
    });

    await this._rememberAllowedOrigins(code, rawPlaylist, m3uUrl);

    res.set({
      'Content-Type': 'application/x-mpegURL',
      'Cache-Control': 'private, max-age=60'
    });

    res.send(rewrittenPlaylist);
  });

  proxyStream = asyncHandler(async (req, res) => {
    const { code } = req.params;
    const targetUrl = req.query.url;

    try {
      const accessToken = this._resolveAccessToken(req);
      this._verifyAccessToken(accessToken, code);
      await this._assertAllowedProxyTarget(code, targetUrl);
      const requestMethod = req.method === 'HEAD' ? 'head' : 'get';
      const upstreamRequestHeaders = this._buildUpstreamStreamHeaders(req);

      const upstream = await this._requestViaProviderProxy({
        method: requestMethod,
        url: targetUrl,
        responseType: requestMethod === 'get' ? 'stream' : undefined,
        headers: upstreamRequestHeaders,
        validateStatus: () => true
      }, this._validateStreamResponse.bind(this));
      this._validateStreamResponse(upstream);

      res.status(upstream.status);
      this._setProxyMediaHeaders(res, upstream.headers, req, 'video/MP2T');

      if (requestMethod === 'head') {
        return res.end();
      }

      const upstreamContentType = upstream.headers['content-type'] || '';
      if (this._isPlaylistResponse(targetUrl, upstreamContentType)) {
        this._destroyResponseStream(upstream);

        const playlistResponse = await this._requestViaProviderProxy({
          method: 'get',
          url: targetUrl,
          responseType: 'text',
          headers: this._buildUpstreamStreamHeaders(req, 'application/vnd.apple.mpegurl,*/*'),
          validateStatus: () => true
        });
        this._validateStreamResponse(playlistResponse);

        res.status(playlistResponse.status);
        this._setProxyMediaHeaders(
          res,
          playlistResponse.headers,
          req,
          'application/vnd.apple.mpegurl'
        );

        return res.send(this._rewriteHlsPlaylist(playlistResponse.data, {
          baseApiUrl: this._getBaseApiUrl(req),
          baseTargetUrl: targetUrl,
          code,
          token: accessToken
        }));
      }

      res.on('close', () => {
        this._destroyResponseStream(upstream);
      });
      upstream.data.pipe(res);
    } catch (error) {
      const statusCode = error.statusCode || error.response?.status || 502;
      logger.error('Stream proxy error', {
        code,
        error: error.message,
        statusCode
      });

      res.status(statusCode).json({
        error: 'Stream fetch failed',
        message: error.message
      });
    }
  });

  probeStream = asyncHandler(async (req, res) => {
    const { code } = req.params;
    const targetUrl = req.query.url;

    try {
      const accessToken = this._resolveAccessToken(req);
      this._verifyAccessToken(accessToken, code);
      await this._assertAllowedProxyTarget(code, targetUrl);

      let upstream = await this._requestViaProviderProxy({
        method: 'head',
        url: targetUrl,
        headers: this._buildUpstreamStreamHeaders(req),
        validateStatus: () => true
      });

      if ([405, 501].includes(upstream.status)) {
        upstream = await this._requestViaProviderProxy({
          method: 'get',
          url: targetUrl,
          responseType: 'stream',
          headers: {
            ...this._buildUpstreamStreamHeaders(req),
            Range: 'bytes=0-1'
          },
          validateStatus: () => true
        });
      }

      if (upstream.status >= 400) {
        const error = new Error(`Provider returned HTTP ${upstream.status}`);
        error.statusCode = upstream.status;
        throw error;
      }

      const probe = this._buildProbePayload(targetUrl, upstream);
      this._destroyResponseStream(upstream);

      res.json({
        status: 'success',
        data: probe
      });
    } catch (error) {
      const statusCode = error.statusCode || error.response?.status || 502;
      logger.error('Stream probe error', {
        code,
        error: error.message,
        statusCode
      });

      res.status(statusCode).json({
        error: 'Stream probe failed',
        message: error.message
      });
    }
  });

  proxyLogo = asyncHandler(async (req, res) => {
    const { code } = req.params;
    const targetUrl = req.query.url;

    try {
      const accessToken = this._resolveAccessToken(req);
      this._verifyAccessToken(accessToken, code);
      await this._assertAllowedProxyTarget(code, targetUrl);

      const upstream = await this._requestViaProviderProxy({
        method: 'get',
        url: targetUrl,
        responseType: 'stream',
        timeout: 15000,
        headers: {
          'User-Agent': 'Flixify-V4-Proxy/1.0',
          'Accept': 'image/*,*/*;q=0.8'
        }
      });

      res.set({
        'Content-Type': upstream.headers['content-type'] || 'image/png',
        'Cache-Control': 'private, max-age=300'
      });

      upstream.data.pipe(res);
    } catch (error) {
      const statusCode = error.statusCode || error.response?.status || 502;
      logger.error('Logo proxy error', {
        code,
        error: error.message,
        statusCode
      });

      res.status(statusCode).json({
        error: 'Logo fetch failed',
        message: error.message
      });
    }
  });

  healthCheck = asyncHandler(async (req, res) => {
    res.json({
      status: 'success',
      data: {
        circuitBreaker: {
          state: this._circuitBreaker.opened ? 'OPEN' : 'CLOSED'
        }
      }
    });
  });

  testProvider = asyncHandler(async (req, res) => {
    const testUrl = req.query.url || 'http://example.com/playlist.m3u';

    try {
      const preview = await this._fetchM3u(testUrl);
      res.json({
        status: 'success',
        data: {
          url: testUrl,
          preview: preview.substring(0, 500),
          contentLength: preview.length
        }
      });
    } catch (error) {
      res.status(502).json({
        status: 'error',
        data: {
          url: testUrl,
          error: error.message
        }
      });
    }
  });

  resetCircuitBreaker = asyncHandler(async (req, res) => {
    const wasOpen = this._circuitBreaker.opened;
    this._circuitBreaker.close();
    logger.info('Circuit breaker reset', { wasOpen });
    res.json({ status: 'success', message: 'Circuit breaker reset' });
  });

  clearCache = asyncHandler(async (req, res) => {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'User code required' });
    }

    const cacheKey = `m3u:content:${code}`;
    await this._cacheService.delete(cacheKey);
    await this._cacheService.delete(`m3u:allowed-origins:${code}`);
    this._userProviderOrigins.delete(code);
    this._userAllowedOrigins.delete(code);

    logger.info('M3U cache cleared', { code });
    res.json({ status: 'success', message: 'Cache cleared' });
  });
}

module.exports = M3uController;
