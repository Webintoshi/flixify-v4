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

  async _requestViaProviderProxy(overrides = {}) {
    const proxies = this._getProxyConfigs();
    const candidates = proxies.length ? proxies : [null];
    let lastError = null;

    for (const proxy of candidates) {
      const proxyLabel = proxy ? `${proxy.host}:${proxy.port}` : 'DIRECT';

      try {
        return await axios(this._createAxiosConfig(overrides, proxy));
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

    const providerOrigin = await this._getProviderOrigin(code);
    if (parsedTarget.origin !== providerOrigin) {
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

      const upstream = await this._requestViaProviderProxy({
        method: 'get',
        url: targetUrl,
        responseType: 'stream'
      });

      res.set({
        'Content-Type': upstream.headers['content-type'] || 'video/MP2T',
        'Cache-Control': 'private, no-store'
      });

      if (upstream.headers['content-length']) {
        res.setHeader('Content-Length', upstream.headers['content-length']);
      }

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
    this._userProviderOrigins.delete(code);

    logger.info('M3U cache cleared', { code });
    res.json({ status: 'success', message: 'Cache cleared' });
  });
}

module.exports = M3uController;
