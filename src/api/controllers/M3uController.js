/**
 * M3U Proxy Controller
 *
 * V4 goal:
 * - frontend never sees the provider URL directly
 * - playlists are rewritten to same-origin proxy URLs
 * - stream and logo requests are validated with the user's access token
 */

const axios = require('axios');
const http = require('http');
const https = require('https');
const CircuitBreaker = require('opossum');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const logger = require('../../config/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const { normalizeProviderPlaylistUrl, buildProviderPlaylistFetchCandidates } = require('../../utils/providerPlaylistUrl');
const { normalizeCodecName, isBrowserSupportedAudioCodec, buildPlaybackDecision } = require('../../utils/playbackDecision');
const { buildSeriesCatalog, buildMoviesCatalog } = require('../../utils/catalogBuilder');
const { DEFAULT_LIVE_COUNTRY_CODE, buildLiveCatalog, normalizeLiveCountryCode } = require('../../utils/liveCatalogBuilder');
const {
  buildProviderCatalogSignature,
  buildStreamTemplateFromSampleUrl,
  buildXtreamLiveStreamUrl
} = require('../../utils/xtreamPlaylistUrl');

class M3uController {
  constructor(getUserM3U, cacheService, jwtSecret) {
    this._getUserM3U = getUserM3U;
    this._cacheService = cacheService;
    this._jwtSecret = jwtSecret;
    this._userProviderOrigins = new Map();
    this._userAllowedOrigins = new Map();
    this._vodSessions = new Map();
    this._rawPlaylistInflight = new Map();
    this._catalogInflight = new Map();
    this._sharedLiveCatalogInflight = new Map();
    this._vodSessionTtlMs = parseInt(process.env.VOD_SESSION_TTL_MS, 10) || 60 * 60 * 1000;
    this._playlistCacheTtlSec = parseInt(process.env.PLAYLIST_CACHE_TTL_SEC, 10) || 900;
    this._catalogCacheTtlSec = parseInt(process.env.CATALOG_CACHE_TTL_SEC, 10) || 900;
    this._liveCatalogCacheTtlSec = parseInt(process.env.LIVE_CATALOG_CACHE_TTL_SEC, 10) || 900;
    this._ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
    this._ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';
    this._upstreamTimeoutMs = parseInt(process.env.PROXY_TIMEOUT_MS, 10) || 30000;
    this._streamProxyTimeoutMs = parseInt(process.env.STREAM_PROXY_TIMEOUT_MS, 10) || 120000;
    this._streamProxyReadTimeoutMs = parseInt(process.env.STREAM_PROXY_READ_TIMEOUT_MS, 10) || 0;
    this._providerUserAgent = process.env.PROVIDER_USER_AGENT || 'VLC/3.0.18 LibVLC/3.0.18';
    const hasConfiguredLiveKeepSegments = Object.prototype.hasOwnProperty.call(process.env, 'LIVE_HLS_KEEP_SEGMENTS');
    const configuredLiveKeepSegments = Number.parseInt(process.env.LIVE_HLS_KEEP_SEGMENTS || '', 10);
    if (hasConfiguredLiveKeepSegments) {
      this._liveHlsKeepSegments = Number.isInteger(configuredLiveKeepSegments) && configuredLiveKeepSegments > 0
        ? configuredLiveKeepSegments
        : 0;
    } else {
      this._liveHlsKeepSegments = 60;
    }
    this._httpAgent = new http.Agent({
      keepAlive: true,
      keepAliveMsecs: 10000,
      maxSockets: 200,
      timeout: this._streamProxyReadTimeoutMs
    });
    this._httpsAgent = new https.Agent({
      keepAlive: true,
      keepAliveMsecs: 10000,
      maxSockets: 200,
      timeout: this._streamProxyReadTimeoutMs
    });

    this._circuitBreaker = new CircuitBreaker(this._fetchM3u.bind(this), {
      timeout: this._upstreamTimeoutMs,
      errorThresholdPercentage: 50,
      resetTimeout: parseInt(process.env.CIRCUIT_BREAKER_RESET_TIMEOUT, 10) || 30000,
      rollingCountTimeout: 10000,
      rollingCountBuckets: 10,
      errorFilter: (error) => error?.statusCode >= 400 && error?.statusCode < 500,
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

  _getProviderProxyUrls() {
    const proxyList = process.env.PROVIDER_HTTP_PROXIES || process.env.PROVIDER_HTTP_PROXY || '';
    if (!proxyList.trim()) {
      return [];
    }

    return proxyList
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  _getPreferredProviderProxyUrl() {
    return this._getProviderProxyUrls()[0] || null;
  }

  _getVodBaseDir() {
    return path.join(os.tmpdir(), 'flixify-v4-vod');
  }

  _getVodSessionId(code, targetUrl) {
    return crypto
      .createHash('sha1')
      .update(`${code}:${targetUrl}`)
      .digest('hex')
      .slice(0, 24);
  }

  _getVodSessionDir(sessionId) {
    return path.join(this._getVodBaseDir(), sessionId);
  }

  _normalizeProviderPlaylistUrl(value) {
    return normalizeProviderPlaylistUrl(value, { enforceHlsOutput: true });
  }

  _parsePlaylistScope(value) {
    return String(value || '').trim().toLowerCase() === 'live' ? 'live' : 'full';
  }

  _applyPlaylistScope(url, scope = 'full') {
    if (scope !== 'live') {
      return url;
    }

    try {
      const parsed = new URL(url);
      const pathname = String(parsed.pathname || '').toLowerCase();
      if (
        parsed.searchParams.has('output') ||
        (pathname.includes('/playlist/') && pathname.includes('m3u_plus')) ||
        pathname.endsWith('/get.php')
      ) {
        parsed.searchParams.set('output', 'hls');
      }
      return parsed.toString();
    } catch {
      return url;
    }
  }

  _createAxiosConfig(overrides = {}, proxy = null) {
    const config = {
      timeout: this._upstreamTimeoutMs,
      headers: {
        'User-Agent': this._providerUserAgent,
        'Accept': '*/*'
      },
      httpAgent: this._httpAgent,
      httpsAgent: this._httpsAgent,
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

  _buildProviderRequestHeaderMap(targetUrl) {
    if (!targetUrl) {
      return {};
    }

    try {
      const origin = new URL(targetUrl).origin;
      return {
        Referer: `${origin}/`,
        Origin: origin
      };
    } catch {
      return {};
    }
  }

  _buildUpstreamStreamHeaders(req, fallbackAccept = '*/*', targetUrl = null) {
    const incomingUserAgent = String(req.headers['user-agent'] || '').trim();
    const userAgent = incomingUserAgent && !/mozilla\//i.test(incomingUserAgent)
      ? incomingUserAgent
      : this._providerUserAgent;

    const headers = {
      'User-Agent': userAgent,
      'Accept': req.headers.accept || fallbackAccept,
      'Cache-Control': 'no-cache, no-store, max-age=0',
      'Pragma': 'no-cache'
    };

    if (req.headers.range) {
      headers.Range = req.headers.range;
    }

    if (req.headers['if-range']) {
      headers['If-Range'] = req.headers['if-range'];
    }

    const providerSourceHeaders = this._buildProviderRequestHeaderMap(targetUrl);
    if (providerSourceHeaders.Referer) {
      headers.Referer = providerSourceHeaders.Referer;
    }
    if (providerSourceHeaders.Origin) {
      headers.Origin = providerSourceHeaders.Origin;
    }

    return headers;
  }

  _setProxyMediaHeaders(res, upstreamHeaders, req, fallbackContentType = null) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    this._copyHeaderIfPresent(res, upstreamHeaders, 'Content-Type', fallbackContentType);
    this._copyHeaderIfPresent(res, upstreamHeaders, 'Content-Length');
    this._copyHeaderIfPresent(res, upstreamHeaders, 'Content-Range');
    this._copyHeaderIfPresent(res, upstreamHeaders, 'Accept-Ranges', req.headers.range ? 'bytes' : null);
    this._copyHeaderIfPresent(res, upstreamHeaders, 'Last-Modified');
    this._copyHeaderIfPresent(res, upstreamHeaders, 'ETag');
  }

  _parsePreferredProxyIndex(value) {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return null;
    }

    return parsed;
  }

  _buildProxyCandidates(proxies = [], preferredProxyIndex = null) {
    if (!Array.isArray(proxies) || proxies.length === 0) {
      return [{ proxy: null, proxyIndex: -1 }];
    }

    const normalizedPreferred = Number.isInteger(preferredProxyIndex) && preferredProxyIndex >= 0
      ? preferredProxyIndex
      : null;

    const indexed = proxies.map((proxy, proxyIndex) => ({ proxy, proxyIndex }));
    indexed.push({ proxy: null, proxyIndex: -1 });
    if (normalizedPreferred === null || normalizedPreferred >= indexed.length) {
      return indexed;
    }

    const preferred = indexed[normalizedPreferred];
    return [preferred, ...indexed.filter((candidate) => candidate.proxyIndex !== normalizedPreferred)];
  }

  _getContainerType(targetUrl, contentType = '') {
    const normalizedType = String(contentType || '').toLowerCase();
    let queryOutput = '';
    const pathname = (() => {
      try {
        const parsed = new URL(targetUrl);
        queryOutput = String(parsed.searchParams.get('output') || '').toLowerCase();
        return parsed.pathname.toLowerCase();
      } catch {
        return String(targetUrl || '').toLowerCase();
      }
    })();

    if (
      normalizedType.includes('application/vnd.apple.mpegurl') ||
      normalizedType.includes('application/x-mpegurl') ||
      queryOutput === 'hls' ||
      queryOutput === 'm3u8' ||
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
        return `URI="${this._buildStreamProxyUrl(
          context.baseApiUrl,
          context.code,
          context.token,
          resolved,
          context.preferredProxyIndex
        )}"`;
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
            resolved,
            context.preferredProxyIndex
          );
        } catch {
          return line;
        }
      })
      .join('\n');
  }

  _pruneLivePlaylistWindow(content, keepLastSegments = 5) {
    const lines = String(content || '').split(/\r?\n/);
    const segmentPairs = [];

    for (let i = 0; i < lines.length - 1; i += 1) {
      const current = lines[i].trim();
      const next = lines[i + 1].trim();

      if (!current.toUpperCase().startsWith('#EXTINF')) {
        continue;
      }

      if (!next || next.startsWith('#')) {
        continue;
      }

      segmentPairs.push([i, i + 1]);
    }

    if (segmentPairs.length <= keepLastSegments) {
      return content;
    }

    const removeCount = segmentPairs.length - keepLastSegments;
    const removeIndexes = new Set();
    for (let i = 0; i < removeCount; i += 1) {
      removeIndexes.add(segmentPairs[i][0]);
      removeIndexes.add(segmentPairs[i][1]);
    }

    const nextLines = lines
      .map((line, index) => {
        if (removeIndexes.has(index)) {
          return null;
        }

        const trimmed = line.trim();
        if (!trimmed.toUpperCase().startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
          return line;
        }

        const sequenceValue = Number.parseInt(trimmed.split(':')[1], 10);
        if (!Number.isFinite(sequenceValue)) {
          return line;
        }

        return `#EXT-X-MEDIA-SEQUENCE:${sequenceValue + removeCount}`;
      })
      .filter((line) => line !== null);

    return nextLines.join('\n');
  }

  _optimizeLivePlaylist(content) {
    if (!this._liveHlsKeepSegments) {
      return content;
    }

    return this._pruneLivePlaylistWindow(content, this._liveHlsKeepSegments);
  }

  _extractOriginsFromHlsPlaylist(content, baseTargetUrl) {
    const origins = new Set();
    const lines = String(content || '').split(/\r?\n/);

    const resolveAndCollectOrigin = (rawValue) => {
      const candidate = String(rawValue || '').trim();
      if (!candidate || candidate.startsWith('#')) {
        return;
      }

      try {
        const resolved = new URL(candidate, baseTargetUrl).toString();
        this._addAllowedOrigin(origins, resolved);
      } catch {
        // ignore malformed URLs
      }
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      if (!trimmed.startsWith('#')) {
        resolveAndCollectOrigin(trimmed);
        continue;
      }

      const uriMatches = trimmed.matchAll(/URI="([^"]+)"/gi);
      for (const match of uriMatches) {
        resolveAndCollectOrigin(match?.[1]);
      }
    }

    return origins;
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
      codecRisk: containerType === 'ts' || contentType.toLowerCase().includes('video/mp2t'),
      videoCodec: null,
      audioCodec: null,
      hasAudio: null,
      audioBrowserSupported: null,
      remuxReason: null
    };
  }

  _buildProviderSourceHeaders(targetUrl) {
    const headerMap = this._buildProviderRequestHeaderMap(targetUrl);
    const headers = [];

    if (headerMap.Referer) {
      headers.push(`Referer: ${headerMap.Referer}`);
    }

    if (headerMap.Origin) {
      headers.push(`Origin: ${headerMap.Origin}`);
    }

    return headers;
  }

  _resolveUpstreamResponseUrl(requestedUrl, response) {
    const candidates = [
      response?.request?.res?.responseUrl,
      response?.request?._redirectable?._currentUrl,
      response?.request?.responseURL,
      response?.config?.url
    ];

    for (const value of candidates) {
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }

    return requestedUrl;
  }

  _buildConservativeProbeFallback(targetUrl, remuxReason = 'probe-request-failed') {
    const containerType = this._getContainerType(targetUrl);
    const fallbackProbe = this._buildProbePayload(targetUrl, {
      headers: {
        'content-type': 'application/octet-stream'
      }
    });

    fallbackProbe.containerType = containerType;
    fallbackProbe.acceptRanges = false;
    fallbackProbe.seekableGuess = containerType === 'hls';
    fallbackProbe.remuxReason = remuxReason;

    const payload = this._buildPlaybackProbePayload(targetUrl, fallbackProbe, null);
    payload.remuxReason = payload.remuxReason || remuxReason;

    return payload;
  }

  _canDirectPlayProbe(probe) {
    if (!probe) {
      return false;
    }

    if (probe.playbackStrategy === 'native' || probe.playbackStrategy === 'hls') {
      return true;
    }

    return false;
  }

  _buildPlaybackProbePayload(targetUrl, probe, mediaAnalysis = null) {
    const containerType = probe?.containerType || this._getContainerType(targetUrl);
    const ffprobeAvailable = Boolean(mediaAnalysis);
    const videoCodec = normalizeCodecName(mediaAnalysis?.videoCodec);
    const audioCodec = normalizeCodecName(mediaAnalysis?.audioCodec);
    const hasAudio = typeof mediaAnalysis?.hasAudio === 'boolean'
      ? mediaAnalysis.hasAudio
      : Boolean(audioCodec);

    let decision = buildPlaybackDecision({
      containerType,
      acceptRanges: Boolean(probe?.acceptRanges),
      hasAudio,
      audioCodec
    });

    if (!ffprobeAvailable && containerType !== 'hls') {
      decision = {
        playbackStrategy: 'remux-hls',
        remuxRecommended: true,
        remuxFallback: true,
        remuxReason: 'ffprobe-unavailable',
        audioBrowserSupported: false
      };
    }

    const payload = {
      ...(probe || {}),
      containerType,
      ffprobeAvailable,
      videoCodec,
      audioCodec,
      hasAudio,
      audioBrowserSupported: decision.audioBrowserSupported,
      playbackStrategy: decision.playbackStrategy,
      remuxRecommended: decision.remuxRecommended,
      remuxFallback: decision.remuxFallback,
      remuxReason: decision.remuxReason,
      directPlayLikely: false
    };

    payload.directPlayLikely = this._canDirectPlayProbe(payload);
    payload.codecRisk = payload.playbackStrategy === 'remux-hls';

    return payload;
  }

  async _isCommandAvailable(command) {
    return new Promise((resolve) => {
      const checker = process.platform === 'win32' ? 'where' : 'which';
      const child = spawn(checker, [command], {
        stdio: 'ignore'
      });

      child.on('error', () => resolve(false));
      child.on('close', (code) => resolve(code === 0));
    });
  }

  async _runProcess(command, args, options = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        ...options,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
          return;
        }

        const error = new Error(stderr.trim() || `${command} exited with code ${code}`);
        error.code = code;
        reject(error);
      });
    });
  }

  async _probeSourceWithFfprobe(targetUrl) {
    const isAvailable = await this._isCommandAvailable(this._ffprobePath);
    if (!isAvailable) {
      return null;
    }

    const args = ['-v', 'quiet', '-print_format', 'json', '-show_streams'];
    const proxyUrl = this._getPreferredProviderProxyUrl();
    if (proxyUrl) {
      args.push('-http_proxy', proxyUrl);
    }

    args.push('-user_agent', this._providerUserAgent);
    const providerHeaders = this._buildProviderSourceHeaders(targetUrl);
    if (providerHeaders.length > 0) {
      args.push('-headers', `${providerHeaders.join('\r\n')}\r\n`);
    }
    args.push(targetUrl);

    try {
      const result = await this._runProcess(this._ffprobePath, args, {
        env: process.env
      });

      const payload = JSON.parse(result.stdout || '{}');
      const videoStream = payload.streams?.find((stream) => stream.codec_type === 'video') || null;
      const audioStreams = payload.streams?.filter((stream) => stream.codec_type === 'audio') || [];
      const audioStream = audioStreams[0] || null;

      return {
        videoCodec: normalizeCodecName(videoStream?.codec_name),
        audioCodec: normalizeCodecName(audioStream?.codec_name),
        hasAudio: audioStreams.length > 0
      };
    } catch (error) {
      logger.warn('ffprobe analysis failed, continuing with conservative defaults', {
        targetUrl,
        error: error.message
      });
      return null;
    }
  }

  _getVodTranscodeProfile(mediaAnalysis) {
    const videoCodec = normalizeCodecName(mediaAnalysis?.videoCodec);
    const audioCodec = normalizeCodecName(mediaAnalysis?.audioCodec);
    const hasAudio = typeof mediaAnalysis?.hasAudio === 'boolean'
      ? mediaAnalysis.hasAudio
      : Boolean(audioCodec);
    const forceVideoTranscode = String(process.env.VOD_REMUX_FORCE_VIDEO_TRANSCODE || 'false')
      .toLowerCase() === 'true';

    return {
      videoCodec,
      audioCodec,
      hasAudio,
      transcodeVideo: forceVideoTranscode || videoCodec !== 'h264',
      transcodeAudio: true,
      audioBrowserSupported: hasAudio ? isBrowserSupportedAudioCodec(audioCodec) : true
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

  _validatePlaylistResponse(response) {
    if (!response) {
      const error = new Error('Provider returned an empty playlist response');
      error.statusCode = 502;
      throw error;
    }

    if (response.status >= 400) {
      const error = new Error(`Provider returned HTTP ${response.status}`);
      error.statusCode = response.status;
      throw error;
    }

    if (!response.data || !String(response.data).trim()) {
      const error = new Error('Provider returned empty playlist');
      error.statusCode = 502;
      throw error;
    }
  }

  async _requestViaProviderProxy(overrides = {}, responseValidator = null, options = {}) {
    const { preferredProxyIndex = null } = options;
    const proxies = this._getProxyConfigs();
    const candidates = this._buildProxyCandidates(proxies, preferredProxyIndex);
    let lastError = null;

    for (const candidate of candidates) {
      const proxy = candidate.proxy;
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

        response.__providerProxyIndex = candidate.proxyIndex;
        response.__providerProxyLabel = proxyLabel;
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
    const candidates = buildProviderPlaylistFetchCandidates(url, { enforceHlsOutput: true });
    const maxCandidates = Number.parseInt(process.env.M3U_FETCH_MAX_CANDIDATES || '3', 10);
    const candidateList = Number.isInteger(maxCandidates) && maxCandidates > 0
      ? candidates.slice(0, maxCandidates)
      : candidates;
    const perAttemptTimeoutMs = Number.parseInt(process.env.M3U_FETCH_ATTEMPT_TIMEOUT_MS || '12000', 10);
    const totalTimeoutMs = Number.parseInt(process.env.M3U_FETCH_TOTAL_TIMEOUT_MS || '30000', 10);
    const startedAt = Date.now();
    let lastStatus = null;
    let lastError = null;

    for (const candidateUrl of candidateList) {
      const elapsed = Date.now() - startedAt;
      const remainingBudgetMs = Number.isInteger(totalTimeoutMs) && totalTimeoutMs > 0
        ? Math.max(totalTimeoutMs - elapsed, 0)
        : perAttemptTimeoutMs;

      if (remainingBudgetMs < 1500) {
        break;
      }

      const timeoutMs = Math.max(
        1500,
        Math.min(
          Number.isInteger(perAttemptTimeoutMs) && perAttemptTimeoutMs > 0 ? perAttemptTimeoutMs : this._upstreamTimeoutMs,
          remainingBudgetMs
        )
      );

      try {
        const response = await this._requestViaProviderProxy({
          method: 'get',
          url: candidateUrl,
          timeout: timeoutMs,
          responseType: 'text',
          maxRedirects: 5,
          validateStatus: () => true
        }, this._validatePlaylistResponse.bind(this));

        return response.data;
      } catch (error) {
        lastError = error;
        lastStatus = error.statusCode || error.response?.status || lastStatus;
      }
    }

    if (lastError) {
      throw lastError;
    }

    const error = new Error(`Provider returned HTTP ${lastStatus || 502}`);
    error.statusCode = lastStatus || 502;
    throw error;
  }

  async _resolveUserPlaylistUrl(code, options = {}) {
    const { scope = 'full' } = options;
    const result = await this._getUserM3U.execute({ code });
    const m3uUrl = this._normalizeProviderPlaylistUrl(result?.url);

    if (!m3uUrl) {
      const error = new Error('No M3U URL assigned');
      error.statusCode = 404;
      throw error;
    }

    const scopedUrl = this._applyPlaylistScope(m3uUrl, this._parsePlaylistScope(scope));
    this._userProviderOrigins.set(code, new URL(scopedUrl).origin);
    return scopedUrl;
  }

  async _getRawPlaylistForCode(code, options = {}) {
    const { forceRefresh = false, scope = 'full' } = options;
    const normalizedScope = this._parsePlaylistScope(scope);
    const m3uUrl = await this._resolveUserPlaylistUrl(code, { scope: normalizedScope });
    const cacheKey = `m3u:content:${code}:${normalizedScope}`;
    const shouldUseCache = normalizedScope !== 'live';
    const inflightKey = `playlist:${code}:${normalizedScope}:${forceRefresh ? 'refresh' : 'cached'}`;
    let rawPlaylist = !forceRefresh && shouldUseCache ? await this._cacheService.get(cacheKey) : null;

    if (!rawPlaylist) {
      if (this._rawPlaylistInflight.has(inflightKey)) {
        rawPlaylist = await this._rawPlaylistInflight.get(inflightKey);
      } else {
        const loaderPromise = (async () => {
          const playlist = await this._circuitBreaker.fire(m3uUrl);
          if (shouldUseCache) {
            await this._cacheService.set(cacheKey, playlist, this._playlistCacheTtlSec);
          }
          return playlist;
        })();

        this._rawPlaylistInflight.set(inflightKey, loaderPromise);
        try {
          rawPlaylist = await loaderPromise;
        } finally {
          this._rawPlaylistInflight.delete(inflightKey);
        }
      }
    }

    await this._rememberAllowedOrigins(code, rawPlaylist, m3uUrl);

    return {
      m3uUrl,
      rawPlaylist
    };
  }

  async _getCatalogFromCache(code, type) {
    const cacheKey = `catalog:${type}:${code}:v1`;
    return this._cacheService.get(cacheKey);
  }

  async _setCatalogCache(code, type, value) {
    const cacheKey = `catalog:${type}:${code}:v1`;
    await this._cacheService.set(cacheKey, value, this._catalogCacheTtlSec);
  }

  async _getOrBuildCatalog(type, code, forceRefresh, builderFn) {
    const inflightKey = `catalog:${type}:${code}:${forceRefresh ? 'refresh' : 'cached'}`;

    if (this._catalogInflight.has(inflightKey)) {
      return this._catalogInflight.get(inflightKey);
    }

    const task = (async () => {
      let catalog = !forceRefresh ? await this._getCatalogFromCache(code, type) : null;

      if (!Array.isArray(catalog)) {
        catalog = await builderFn();
        await this._setCatalogCache(code, type, catalog);
      }

      return catalog;
    })();

    this._catalogInflight.set(inflightKey, task);
    try {
      return await task;
    } finally {
      this._catalogInflight.delete(inflightKey);
    }
  }

  async _getSharedLiveCatalog(code, options = {}) {
    const { forceRefresh = false } = options;
    const { url } = await this._getUserM3U.execute({ code });
    const m3uUrl = this._normalizeProviderPlaylistUrl(url);

    if (!m3uUrl) {
      const error = new Error('No M3U URL assigned');
      error.statusCode = 404;
      throw error;
    }

    const providerSignature = buildProviderCatalogSignature(m3uUrl);
    const cacheKey = `catalog:live:shared:${providerSignature}:v2`;
    const inflightKey = `catalog:live:shared:${providerSignature}:${forceRefresh ? 'refresh' : 'cached'}`;
    let sharedCatalog = !forceRefresh ? await this._cacheService.get(cacheKey) : null;

    if (!sharedCatalog?.items || !Array.isArray(sharedCatalog.items) || !Array.isArray(sharedCatalog.countries)) {
      if (this._sharedLiveCatalogInflight.has(inflightKey)) {
        sharedCatalog = await this._sharedLiveCatalogInflight.get(inflightKey);
      } else {
        const loaderPromise = (async () => {
          const { rawPlaylist } = await this._getRawPlaylistForCode(code, {
            forceRefresh,
            scope: 'live'
          });
          const builtCatalog = buildLiveCatalog(rawPlaylist);
          const streamTemplate = buildStreamTemplateFromSampleUrl(
            builtCatalog.items[0]?.sampleUrl || '',
            m3uUrl
          );
          const items = builtCatalog.items.map(({ sampleUrl: _sampleUrl, ...item }) => item);
          const nextCatalog = {
            items,
            countries: builtCatalog.countries,
            streamTemplate: streamTemplate || null,
            generatedAt: new Date().toISOString()
          };

          await this._cacheService.set(cacheKey, nextCatalog, this._liveCatalogCacheTtlSec);
          return nextCatalog;
        })();

        this._sharedLiveCatalogInflight.set(inflightKey, loaderPromise);
        try {
          sharedCatalog = await loaderPromise;
        } finally {
          this._sharedLiveCatalogInflight.delete(inflightKey);
        }
      }
    }

    return {
      m3uUrl,
      providerSignature,
      sharedCatalog
    };
  }

  _parseBooleanFlag(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
  }

  _buildSeriesSummaryItem(series) {
    const seasons = series?.seasons && typeof series.seasons === 'object' ? series.seasons : {};
    const orderedSeasonKeys = Object.keys(seasons)
      .map((seasonKey) => Number.parseInt(seasonKey, 10))
      .filter((seasonNumber) => Number.isFinite(seasonNumber))
      .sort((left, right) => left - right);

    let episodeCount = 0;
    let firstEpisode = null;

    orderedSeasonKeys.forEach((seasonNumber) => {
      const seasonEpisodes = Array.isArray(seasons[seasonNumber]) ? seasons[seasonNumber] : [];
      episodeCount += seasonEpisodes.length;
      if (!firstEpisode && seasonEpisodes.length > 0) {
        const first = seasonEpisodes[0];
        firstEpisode = {
          id: first?.id || '',
          seriesName: first?.seriesName || series?.name || '',
          season: first?.season || seasonNumber,
          episode: first?.episode || 1,
          fullTitle: first?.fullTitle || '',
          logo: first?.logo || series?.logo || '',
          genre: first?.genre || series?.genre || '',
          url: first?.url || ''
        };
      }
    });

    const logoCandidates = Array.isArray(series?.logoCandidates)
      ? series.logoCandidates.slice(0, 8)
      : [];

    return {
      name: series?.name || '',
      genre: series?.genre || '',
      logo: series?.logo || logoCandidates[0] || '',
      logoCandidates,
      seasonCount: orderedSeasonKeys.length,
      episodeCount,
      firstEpisode
    };
  }

  _buildSeriesSummaryCatalog(catalog = []) {
    return catalog.map((series) => this._buildSeriesSummaryItem(series));
  }

  _findSeriesByName(catalog, seriesName) {
    const normalizedName = String(seriesName || '').trim().toLowerCase();
    if (!normalizedName) {
      return null;
    }

    return catalog.find((series) => String(series?.name || '').trim().toLowerCase() === normalizedName) || null;
  }

  _getBaseApiUrl(req) {
    return `${req.protocol}://${req.get('host')}/api/v1`;
  }

  _extractProxyTargetFromUrl(proxyUrl) {
    const normalizedUrl = String(proxyUrl || '').trim();
    if (!normalizedUrl) {
      return null;
    }

    try {
      const parsed = new URL(normalizedUrl, 'http://proxy.local');
      const pathname = String(parsed.pathname || '');
      const targetUrl = String(parsed.searchParams.get('url') || '').trim();
      const preferredProxyIndex = this._parsePreferredProxyIndex(parsed.searchParams.get('up'));

      if (!targetUrl) {
        return null;
      }

      if (pathname.includes('/api/v1/stream/')) {
        return {
          type: 'stream',
          targetUrl,
          preferredProxyIndex
        };
      }

      if (pathname.includes('/api/v1/m3u/logo/')) {
        return {
          type: 'logo',
          targetUrl,
          preferredProxyIndex
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  _rehydrateProxyUrlForRequest(proxyUrl, baseApiUrl, code, token) {
    const normalizedUrl = String(proxyUrl || '').trim();
    if (!normalizedUrl) {
      return '';
    }

    const proxyTarget = this._extractProxyTargetFromUrl(normalizedUrl);
    if (!proxyTarget) {
      return normalizedUrl;
    }

    if (proxyTarget.type === 'stream') {
      return this._buildStreamProxyUrl(
        baseApiUrl,
        code,
        token,
        proxyTarget.targetUrl,
        proxyTarget.preferredProxyIndex
      );
    }

    if (proxyTarget.type === 'logo') {
      return this._buildLogoProxyUrl(baseApiUrl, code, token, proxyTarget.targetUrl);
    }

    return normalizedUrl;
  }

  _rehydrateSeriesCatalogForRequest(catalog = [], baseApiUrl, code, token) {
    if (!Array.isArray(catalog)) {
      return [];
    }

    return catalog.map((series) => {
      const seasons = series?.seasons && typeof series.seasons === 'object'
        ? Object.fromEntries(
          Object.entries(series.seasons).map(([seasonKey, episodes]) => ([
            seasonKey,
            Array.isArray(episodes)
              ? episodes.map((episode) => ({
                ...episode,
                logo: this._rehydrateProxyUrlForRequest(episode?.logo, baseApiUrl, code, token),
                url: this._rehydrateProxyUrlForRequest(episode?.url, baseApiUrl, code, token)
              }))
              : []
          ]))
        )
        : {};

      return {
        ...series,
        logo: this._rehydrateProxyUrlForRequest(series?.logo, baseApiUrl, code, token),
        logoCandidates: Array.isArray(series?.logoCandidates)
          ? series.logoCandidates.map((candidate) => (
            this._rehydrateProxyUrlForRequest(candidate, baseApiUrl, code, token)
          ))
          : [],
        seasons
      };
    });
  }

  _rehydrateMovieCatalogForRequest(catalog = [], baseApiUrl, code, token) {
    if (!Array.isArray(catalog)) {
      return [];
    }

    return catalog.map((movie) => ({
      ...movie,
      logo: this._rehydrateProxyUrlForRequest(movie?.logo, baseApiUrl, code, token),
      logoCandidates: Array.isArray(movie?.logoCandidates)
        ? movie.logoCandidates.map((candidate) => (
          this._rehydrateProxyUrlForRequest(candidate, baseApiUrl, code, token)
        ))
        : [],
      url: this._rehydrateProxyUrlForRequest(movie?.url, baseApiUrl, code, token)
    }));
  }

  _buildStreamProxyUrl(baseApiUrl, code, token, targetUrl, preferredProxyIndex = null) {
    const baseUrl = `${baseApiUrl}/stream/${encodeURIComponent(code)}?token=${encodeURIComponent(token)}&url=${encodeURIComponent(targetUrl)}`;
    return Number.isInteger(preferredProxyIndex) && preferredProxyIndex >= 0
      ? `${baseUrl}&up=${preferredProxyIndex}`
      : baseUrl;
  }

  _buildVodManifestUrl(baseApiUrl, code, token, targetUrl) {
    return `${baseApiUrl}/vod/${encodeURIComponent(code)}/manifest.m3u8?token=${encodeURIComponent(token)}&url=${encodeURIComponent(targetUrl)}`;
  }

  _buildLogoProxyUrl(baseApiUrl, code, token, targetUrl) {
    return `${baseApiUrl}/m3u/logo/${encodeURIComponent(code)}?token=${encodeURIComponent(token)}&url=${encodeURIComponent(targetUrl)}`;
  }

  async _cleanupVodSession(sessionId) {
    const session = this._vodSessions.get(sessionId);
    if (session?.process && !session.process.killed) {
      session.process.kill('SIGTERM');
    }

    this._vodSessions.delete(sessionId);

    try {
      await fsp.rm(this._getVodSessionDir(sessionId), {
        recursive: true,
        force: true
      });
    } catch (error) {
      logger.warn('Failed to remove VOD session directory', {
        sessionId,
        error: error.message
      });
    }
  }

  async _cleanupExpiredVodSessions() {
    const now = Date.now();
    const expiredSessionIds = Array.from(this._vodSessions.values())
      .filter((session) => now - session.lastAccessAt > this._vodSessionTtlMs)
      .map((session) => session.id);

    for (const sessionId of expiredSessionIds) {
      await this._cleanupVodSession(sessionId);
    }
  }

  async _waitForFile(filePath, validator = null, timeoutMs = 15000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      try {
        if (!validator) {
          await fsp.access(filePath);
          return true;
        }

        const content = await fsp.readFile(filePath, 'utf8');
        if (validator(content)) {
          return content;
        }
      } catch {
        // File not ready yet.
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    return false;
  }

  _rewriteVodManifest(content, context) {
    return content
      .split(/\r?\n/)
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return line;
        }

        if (trimmed.startsWith('#')) {
          const mapMatch = trimmed.match(/^#EXT-X-MAP:URI="([^"]+)"/i);
          if (mapMatch) {
            const assetName = path.basename(mapMatch[1]);
            return `#EXT-X-MAP:URI="${context.baseApiUrl}/vod/${encodeURIComponent(context.code)}/${encodeURIComponent(context.sessionId)}/${encodeURIComponent(assetName)}?token=${encodeURIComponent(context.token)}"`;
          }

          return line.replace(/URI="([^"]+)"/gi, (match, rawValue) => {
            const assetName = path.basename(rawValue);
            return `URI="${context.baseApiUrl}/vod/${encodeURIComponent(context.code)}/${encodeURIComponent(context.sessionId)}/${encodeURIComponent(assetName)}?token=${encodeURIComponent(context.token)}"`;
          });
        }

        return `${context.baseApiUrl}/vod/${encodeURIComponent(context.code)}/${encodeURIComponent(context.sessionId)}/${encodeURIComponent(trimmed)}?token=${encodeURIComponent(context.token)}`;
      })
      .join('\n');
  }

  _getVodAssetContentType(fileName) {
    if (fileName.endsWith('.m3u8')) {
      return 'application/vnd.apple.mpegurl';
    }

    if (fileName.endsWith('.m4s')) {
      return 'video/iso.segment';
    }

    if (fileName.endsWith('.mp4')) {
      return 'video/mp4';
    }

    return 'application/octet-stream';
  }

  _getLatestVodSessionForCode(code) {
    const candidates = Array.from(this._vodSessions.values())
      .filter((session) => session.code === code)
      .sort((left, right) => right.lastAccessAt - left.lastAccessAt);

    return candidates[0] || null;
  }

  async _sendVodAssetFromSession(res, session, assetName) {
    session.lastAccessAt = Date.now();

    const sanitizedName = path.basename(assetName);
    const assetPath = path.join(session.dir, sanitizedName);
    const fileExists = await fsp.access(assetPath).then(() => true).catch(() => false);

    if (!fileExists) {
      const maybeReady = await this._waitForFile(assetPath, null, 10000);
      if (!maybeReady) {
        return res.status(404).json({
          error: 'VOD asset not ready',
          message: 'Playback asset is still being generated'
        });
      }
    }

    res.set({
      'Content-Type': this._getVodAssetContentType(sanitizedName),
      'Cache-Control': 'private, no-store'
    });

    fs.createReadStream(assetPath).pipe(res);
    return undefined;
  }

  async _createVodSession(code, targetUrl) {
    const sessionId = this._getVodSessionId(code, targetUrl);
    const sessionDir = this._getVodSessionDir(sessionId);
    const manifestPath = path.join(sessionDir, 'index.m3u8');

    await this._cleanupExpiredVodSessions();

    const existingSession = this._vodSessions.get(sessionId);
    if (existingSession) {
      existingSession.lastAccessAt = Date.now();
      const isProcessActive = Boolean(
        existingSession.process &&
        existingSession.process.exitCode === null &&
        !existingSession.process.killed
      );

      // If ffmpeg crashed previously, rebuild session instead of reusing a truncated manifest.
      if (!isProcessActive && existingSession.lastError) {
        await this._cleanupVodSession(sessionId);
      } else {
        return existingSession;
      }
    }

    const ffmpegAvailable = await this._isCommandAvailable(this._ffmpegPath);
    if (!ffmpegAvailable) {
      const error = new Error('FFmpeg is not installed on the server');
      error.statusCode = 503;
      throw error;
    }

    await fsp.rm(sessionDir, { recursive: true, force: true });
    await fsp.mkdir(sessionDir, { recursive: true });

    const mediaAnalysis = await this._probeSourceWithFfprobe(targetUrl);
    const profile = this._getVodTranscodeProfile(mediaAnalysis);
    const proxyUrl = this._getPreferredProviderProxyUrl();

    const args = ['-hide_banner', '-loglevel', 'error'];
    if (proxyUrl) {
      args.push('-http_proxy', proxyUrl);
    }

    args.push(
      '-user_agent', this._providerUserAgent,
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_at_eof', '1',
      '-reconnect_delay_max', '2',
      '-i', targetUrl,
      '-map', '0:v:0?',
      '-map', '0:a:0?',
      '-sn',
      '-dn',
      '-map_metadata', '-1'
    );

    const providerHeaders = this._buildProviderSourceHeaders(targetUrl);
    if (providerHeaders.length > 0) {
      args.splice(args.indexOf('-i'), 0, '-headers', `${providerHeaders.join('\r\n')}\r\n`);
    }

    if (profile.transcodeVideo) {
      args.push(
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '22',
        '-pix_fmt', 'yuv420p',
        '-profile:v', 'main',
        '-level', '4.1',
        '-g', '48',
        '-keyint_min', '48',
        '-sc_threshold', '0',
        '-force_key_frames', 'expr:gte(t,n_forced*4)'
      );
    } else {
      args.push('-c:v', 'copy');
    }

    args.push(
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ac', '2'
    );

    args.push(
      '-max_muxing_queue_size', '1024',
      '-f', 'hls',
      '-hls_time', '4',
      '-hls_list_size', '0',
      '-hls_playlist_type', 'event',
      '-hls_segment_type', 'fmp4',
      '-hls_fmp4_init_filename', 'init.mp4',
      '-hls_flags', 'independent_segments+append_list+temp_file',
      '-hls_segment_filename', path.join(sessionDir, 'segment_%05d.m4s'),
      manifestPath
    );

    const ffmpegProcess = spawn(this._ffmpegPath, args, {
      cwd: sessionDir,
      env: process.env,
      stdio: ['ignore', 'ignore', 'pipe']
    });

    const session = {
      id: sessionId,
      code,
      targetUrl,
      dir: sessionDir,
      manifestPath,
      process: ffmpegProcess,
      lastAccessAt: Date.now(),
      lastError: null
    };

    ffmpegProcess.stderr.on('data', (chunk) => {
      const message = chunk.toString().trim();
      if (message) {
        session.lastError = message;
      }
    });

    ffmpegProcess.on('close', (code) => {
      session.process = null;
      if (code === 0) {
        session.lastError = null;
      } else {
        session.lastError = session.lastError || `ffmpeg exited with code ${code}`;
        logger.error('VOD remux session ended unexpectedly', {
          sessionId,
          code,
          targetUrl,
          error: session.lastError
        });
      }
    });

    this._vodSessions.set(sessionId, session);
    return session;
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

  async _mergeAllowedOrigins(code, originCandidates = []) {
    const allowedOrigins = await this._getAllowedOrigins(code);
    let hasChanges = false;

    for (const origin of originCandidates) {
      if (!origin || allowedOrigins.has(origin)) {
        continue;
      }
      allowedOrigins.add(origin);
      hasChanges = true;
    }

    if (hasChanges) {
      const cacheKey = `m3u:allowed-origins:${code}`;
      const serializedOrigins = Array.from(allowedOrigins);
      this._userAllowedOrigins.set(code, new Set(serializedOrigins));
      await this._cacheService.set(cacheKey, serializedOrigins, 300);
    }

    return allowedOrigins;
  }

  async _rememberHlsAllowedOrigins(code, content, baseTargetUrl) {
    const playlistOrigins = this._extractOriginsFromHlsPlaylist(content, baseTargetUrl);
    if (playlistOrigins.size === 0) {
      return this._getAllowedOrigins(code);
    }
    return this._mergeAllowedOrigins(code, Array.from(playlistOrigins));
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
    const forceRefresh = String(req.query.forceRefresh || '').toLowerCase() === 'true' || req.query.forceRefresh === '1';
    const scope = this._parsePlaylistScope(req.query.scope);
    let rawPlaylist;

    try {
      ({ rawPlaylist } = await this._getRawPlaylistForCode(code, { forceRefresh, scope }));
    } catch (error) {
      const statusCode = error.statusCode || (error.message.includes('No M3U URL') ? 404 : 502);
      logger.error('Provider playlist fetch failed', {
        code,
        error: error.message,
        statusCode
      });
      return res.status(statusCode).json({
        error: statusCode === 404 ? 'Not Found' : 'Bad Gateway',
        message: error.message
      });
    }

    const rewrittenPlaylist = this._rewritePlaylist(rawPlaylist, {
      baseApiUrl,
      code,
      token: accessToken
    });

    res.set({
      'Content-Type': 'application/x-mpegURL',
      'Cache-Control': 'private, no-store'
    });

    res.send(rewrittenPlaylist);
  });

  catalogSeries = asyncHandler(async (req, res) => {
    const code = req.user.code;
    const accessToken = req.user.token;
    const baseApiUrl = this._getBaseApiUrl(req);
    const forceRefresh = String(req.query.forceRefresh || '').toLowerCase() === 'true' || req.query.forceRefresh === '1';
    const compact = this._parseBooleanFlag(req.query.compact);
    const seriesNameFilter = String(req.query.seriesName || '').trim();

    try {
      const catalog = await this._getOrBuildCatalog('series', code, forceRefresh, async () => {
        const { rawPlaylist } = await this._getRawPlaylistForCode(code, { forceRefresh });
        return buildSeriesCatalog(rawPlaylist, {
          streamProxyBuilder: (targetUrl) => this._buildStreamProxyUrl(baseApiUrl, code, accessToken, targetUrl),
          logoProxyBuilder: (targetUrl) => this._buildLogoProxyUrl(baseApiUrl, code, accessToken, targetUrl)
        });
      });
      const hydratedCatalog = this._rehydrateSeriesCatalogForRequest(catalog, baseApiUrl, code, accessToken);

      if (seriesNameFilter) {
        const seriesItem = this._findSeriesByName(hydratedCatalog, seriesNameFilter);

        if (!seriesItem) {
          return res.status(404).json({
            error: 'Series not found',
            message: 'Dizi kaydi bulunamadi'
          });
        }

        return res.json({
          status: 'success',
          data: {
            item: seriesItem,
            generatedAt: new Date().toISOString()
          }
        });
      }

      const items = compact ? this._buildSeriesSummaryCatalog(hydratedCatalog) : hydratedCatalog;

      res.json({
        status: 'success',
        data: {
          items,
          total: items.length,
          generatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      const statusCode = error.statusCode || 502;
      logger.error('Series catalog build failed', {
        code,
        error: error.message,
        statusCode
      });
      res.status(statusCode).json({
        error: 'Series catalog failed',
        message: error.message
      });
    }
  });

  catalogMovies = asyncHandler(async (req, res) => {
    const code = req.user.code;
    const accessToken = req.user.token;
    const baseApiUrl = this._getBaseApiUrl(req);
    const forceRefresh = String(req.query.forceRefresh || '').toLowerCase() === 'true' || req.query.forceRefresh === '1';

    try {
      const catalog = await this._getOrBuildCatalog('movies', code, forceRefresh, async () => {
        const { rawPlaylist } = await this._getRawPlaylistForCode(code, { forceRefresh });
        return buildMoviesCatalog(rawPlaylist, {
          streamProxyBuilder: (targetUrl) => this._buildStreamProxyUrl(baseApiUrl, code, accessToken, targetUrl),
          logoProxyBuilder: (targetUrl) => this._buildLogoProxyUrl(baseApiUrl, code, accessToken, targetUrl)
        });
      });
      const hydratedCatalog = this._rehydrateMovieCatalogForRequest(catalog, baseApiUrl, code, accessToken);

      res.json({
        status: 'success',
        data: {
          items: hydratedCatalog,
          total: hydratedCatalog.length,
          generatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      const statusCode = error.statusCode || 502;
      logger.error('Movies catalog build failed', {
        code,
        error: error.message,
        statusCode
      });
      res.status(statusCode).json({
        error: 'Movies catalog failed',
        message: error.message
      });
    }
  });

  catalogLive = asyncHandler(async (req, res) => {
    const code = req.user.code;
    const accessToken = req.user.token;
    const baseApiUrl = this._getBaseApiUrl(req);
    const forceRefresh = String(req.query.forceRefresh || '').toLowerCase() === 'true' || req.query.forceRefresh === '1';
    const requestedCountry = normalizeLiveCountryCode(req.query.country || DEFAULT_LIVE_COUNTRY_CODE);
    const requestedCategory = String(req.query.category || '').trim();

    try {
      const { m3uUrl, sharedCatalog } = await this._getSharedLiveCatalog(code, { forceRefresh });
      const countries = Array.isArray(sharedCatalog.countries) ? sharedCatalog.countries : [];
      const selectedCountryMeta = countries.find((country) => country.code === requestedCountry)
        || countries.find((country) => country.defaultSelected)
        || countries[0]
        || {
          code: requestedCountry,
          categories: []
        };
      const selectedCountry = selectedCountryMeta.code || requestedCountry;

      let items = Array.isArray(sharedCatalog.items)
        ? sharedCatalog.items.filter((item) => item.countryCode === selectedCountry)
        : [];

      if (requestedCategory && requestedCategory.toLowerCase() !== 'all') {
        items = items.filter((item) => item.group === requestedCategory);
      }

      const responseItems = items
        .map((item) => {
          const targetUrl = buildXtreamLiveStreamUrl(m3uUrl, item.streamId, {
            template: sharedCatalog.streamTemplate
          });

          if (!targetUrl) {
            return null;
          }

          return {
            id: item.id,
            name: item.name,
            logo: item.logo
              ? this._buildLogoProxyUrl(baseApiUrl, code, accessToken, item.logo)
              : '',
            group: item.group,
            country: item.countryCode,
            url: this._buildStreamProxyUrl(baseApiUrl, code, accessToken, targetUrl),
            sourceType: item.sourceType
          };
        })
        .filter(Boolean);

      res.json({
        status: 'success',
        data: {
          country: selectedCountry,
          category: requestedCategory && requestedCategory.toLowerCase() !== 'all' ? requestedCategory : 'all',
          countries,
          categories: Array.isArray(selectedCountryMeta.categories) ? selectedCountryMeta.categories : [],
          items: responseItems,
          total: responseItems.length,
          generatedAt: sharedCatalog.generatedAt || new Date().toISOString()
        }
      });
    } catch (error) {
      const statusCode = error.statusCode || 502;
      logger.error('Live catalog build failed', {
        code,
        error: error.message,
        statusCode
      });
      res.status(statusCode).json({
        error: 'Live catalog failed',
        message: error.message
      });
    }
  });

  proxyStream = asyncHandler(async (req, res) => {
    const { code } = req.params;
    const targetUrl = req.query.url;
    const preferredProxyIndex = this._parsePreferredProxyIndex(req.query.up);

    try {
      const accessToken = this._resolveAccessToken(req);
      this._verifyAccessToken(accessToken, code);
      await this._assertAllowedProxyTarget(code, targetUrl);
      const requestMethod = req.method === 'HEAD' ? 'head' : 'get';
      // Known HLS manifests do not need a preflight stream request.
      if (requestMethod === 'get' && this._isPlaylistResponse(targetUrl)) {
        const playlistResponse = await this._requestViaProviderProxy({
          method: 'get',
          url: targetUrl,
          responseType: 'text',
          timeout: this._streamProxyTimeoutMs,
          headers: this._buildUpstreamStreamHeaders(req, 'application/vnd.apple.mpegurl,*/*', targetUrl),
          validateStatus: () => true
        }, this._validatePlaylistResponse.bind(this), {
          preferredProxyIndex
        });

        const resolvedPlaylistUrl = this._resolveUpstreamResponseUrl(targetUrl, playlistResponse);
        await this._rememberHlsAllowedOrigins(code, playlistResponse.data, resolvedPlaylistUrl);
        const optimizedPlaylist = this._optimizeLivePlaylist(playlistResponse.data);
        const resolvedProxyIndex = Number.isInteger(playlistResponse.__providerProxyIndex) && playlistResponse.__providerProxyIndex >= 0
          ? playlistResponse.__providerProxyIndex
          : preferredProxyIndex;

        res.status(playlistResponse.status);
        this._setProxyMediaHeaders(
          res,
          playlistResponse.headers,
          req,
          'application/vnd.apple.mpegurl'
        );

        return res.send(this._rewriteHlsPlaylist(optimizedPlaylist, {
          baseApiUrl: this._getBaseApiUrl(req),
          baseTargetUrl: resolvedPlaylistUrl,
          code,
          token: accessToken,
          preferredProxyIndex: resolvedProxyIndex
        }));
      }

      const upstream = await this._requestViaProviderProxy({
        method: requestMethod,
        url: targetUrl,
        responseType: requestMethod === 'get' ? 'stream' : undefined,
        timeout: requestMethod === 'get' ? this._streamProxyReadTimeoutMs : this._upstreamTimeoutMs,
        headers: this._buildUpstreamStreamHeaders(req, '*/*', targetUrl),
        validateStatus: () => true
      }, this._validateStreamResponse.bind(this), {
        preferredProxyIndex
      });
      this._validateStreamResponse(upstream);

      res.status(upstream.status);
      this._setProxyMediaHeaders(res, upstream.headers, req, 'video/MP2T');

      if (requestMethod === 'head') {
        return res.end();
      }

      const upstreamContentType = upstream.headers['content-type'] || '';
      if (this._isPlaylistResponse(targetUrl, upstreamContentType)) {
        this._destroyResponseStream(upstream);
        const playlistProxyIndex = (
          Number.isInteger(upstream.__providerProxyIndex) && upstream.__providerProxyIndex >= 0
            ? upstream.__providerProxyIndex
            : preferredProxyIndex
        );

        const playlistResponse = await this._requestViaProviderProxy({
          method: 'get',
          url: this._resolveUpstreamResponseUrl(targetUrl, upstream),
          responseType: 'text',
          timeout: this._streamProxyTimeoutMs,
          headers: this._buildUpstreamStreamHeaders(req, 'application/vnd.apple.mpegurl,*/*', targetUrl),
          validateStatus: () => true
        }, this._validatePlaylistResponse.bind(this), {
          preferredProxyIndex: playlistProxyIndex
        });

        const resolvedPlaylistUrl = this._resolveUpstreamResponseUrl(targetUrl, playlistResponse);
        await this._rememberHlsAllowedOrigins(code, playlistResponse.data, resolvedPlaylistUrl);
        const optimizedPlaylist = this._optimizeLivePlaylist(playlistResponse.data);
        const resolvedProxyIndex = Number.isInteger(playlistResponse.__providerProxyIndex) && playlistResponse.__providerProxyIndex >= 0
          ? playlistResponse.__providerProxyIndex
          : playlistProxyIndex;

        res.status(playlistResponse.status);
        this._setProxyMediaHeaders(
          res,
          playlistResponse.headers,
          req,
          'application/vnd.apple.mpegurl'
        );

        return res.send(this._rewriteHlsPlaylist(optimizedPlaylist, {
          baseApiUrl: this._getBaseApiUrl(req),
          baseTargetUrl: resolvedPlaylistUrl,
          code,
          token: accessToken,
          preferredProxyIndex: resolvedProxyIndex
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
        headers: this._buildUpstreamStreamHeaders(req, '*/*', targetUrl),
        validateStatus: () => true
      });

      if ([405, 501].includes(upstream.status)) {
        upstream = await this._requestViaProviderProxy({
          method: 'get',
          url: targetUrl,
          responseType: 'stream',
          timeout: this._streamProxyTimeoutMs,
          headers: {
            ...this._buildUpstreamStreamHeaders(req, '*/*', targetUrl),
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

      const baseProbe = this._buildProbePayload(targetUrl, upstream);
      this._destroyResponseStream(upstream);

      // Some providers omit Accept-Ranges on HEAD but still support byte-range GET.
      if (!baseProbe.acceptRanges && baseProbe.containerType !== 'hls') {
        try {
          const rangeProbeResponse = await this._requestViaProviderProxy({
            method: 'get',
            url: targetUrl,
            responseType: 'stream',
            timeout: this._streamProxyTimeoutMs,
            headers: {
              ...this._buildUpstreamStreamHeaders(req, '*/*', targetUrl),
              Range: 'bytes=0-1'
            },
            validateStatus: () => true
          });

          const hasContentRange = String(rangeProbeResponse.headers['content-range'] || '')
            .toLowerCase()
            .startsWith('bytes');

          if (rangeProbeResponse.status === 206 || hasContentRange) {
            baseProbe.acceptRanges = true;
            baseProbe.seekableGuess = true;
          }

          this._destroyResponseStream(rangeProbeResponse);
        } catch (rangeProbeError) {
          logger.warn('Range probe fallback failed', {
            code,
            targetUrl,
            error: rangeProbeError.message
          });
        }
      }

      const mediaAnalysis = await this._probeSourceWithFfprobe(targetUrl);
      const probe = this._buildPlaybackProbePayload(targetUrl, baseProbe, mediaAnalysis);

      res.json({
        status: 'success',
        data: probe
      });
    } catch (error) {
      const isProviderProbeFailure =
        typeof error.message === 'string' &&
        error.message.startsWith('Provider returned HTTP') &&
        Boolean(targetUrl);

      if (isProviderProbeFailure) {
        const fallbackProbe = this._buildConservativeProbeFallback(targetUrl, 'probe-request-failed');

        logger.warn('Stream probe degraded to conservative remux fallback', {
          code,
          targetUrl,
          providerError: error.message,
          playbackStrategy: fallbackProbe.playbackStrategy,
          remuxReason: fallbackProbe.remuxReason
        });

        return res.json({
          status: 'success',
          data: {
            ...fallbackProbe,
            probeWarning: error.message
          }
        });
      }

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

  proxyVodManifest = asyncHandler(async (req, res) => {
    const { code } = req.params;
    const targetUrl = req.query.url;

    try {
      const accessToken = this._resolveAccessToken(req);
      this._verifyAccessToken(accessToken, code);
      await this._assertAllowedProxyTarget(code, targetUrl);

      const session = await this._createVodSession(code, targetUrl);
      const manifestContent = await this._waitForFile(
        session.manifestPath,
        (content) => content.includes('#EXTM3U') && (content.includes('.m4s') || content.includes('init.mp4')),
        25000
      );

      if (!manifestContent) {
        const error = new Error(session.lastError || 'VOD remux playlist is not ready yet');
        error.statusCode = 504;
        throw error;
      }

      session.lastAccessAt = Date.now();

      res.set({
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'private, no-store'
      });

      res.send(this._rewriteVodManifest(manifestContent, {
        baseApiUrl: this._getBaseApiUrl(req),
        code,
        sessionId: session.id,
        token: accessToken
      }));
    } catch (error) {
      const statusCode = error.statusCode || 502;
      logger.error('VOD manifest proxy error', {
        code,
        targetUrl,
        error: error.message,
        statusCode
      });

      res.status(statusCode).json({
        error: 'VOD manifest fetch failed',
        message: error.message
      });
    }
  });

  proxyVodAsset = asyncHandler(async (req, res) => {
    const { code, sessionId, assetName } = req.params;

    try {
      const accessToken = this._resolveAccessToken(req);
      this._verifyAccessToken(accessToken, code);

      const session = this._vodSessions.get(sessionId);
      if (!session || session.code !== code) {
        return res.status(404).json({
          error: 'VOD session not found',
          message: 'Requested playback session does not exist'
        });
      }

      return this._sendVodAssetFromSession(res, session, assetName);
    } catch (error) {
      logger.error('VOD asset proxy error', {
        code,
        sessionId,
        assetName,
        error: error.message
      });

      res.status(error.statusCode || 502).json({
        error: 'VOD asset fetch failed',
        message: error.message
      });
    }
  });

  proxyLatestVodAsset = asyncHandler(async (req, res) => {
    const { code, assetName } = req.params;

    try {
      const accessToken = this._resolveAccessToken(req);
      this._verifyAccessToken(accessToken, code);

      const session = this._getLatestVodSessionForCode(code);
      if (!session) {
        return res.status(404).json({
          error: 'VOD session not found',
          message: 'No active playback session was found for this user'
        });
      }

      return this._sendVodAssetFromSession(res, session, assetName);
    } catch (error) {
      logger.error('VOD latest asset proxy error', {
        code,
        assetName,
        error: error.message
      });

      res.status(error.statusCode || 502).json({
        error: 'VOD latest asset fetch failed',
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
          'User-Agent': this._providerUserAgent,
          'Accept': 'image/*,*/*;q=0.8',
          ...this._buildProviderRequestHeaderMap(targetUrl)
        }
      });

      res.set({
        'Content-Type': upstream.headers['content-type'] || 'image/png',
        'Cache-Control': 'private, max-age=300',
        'Cross-Origin-Resource-Policy': 'cross-origin'
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
    const cacheStatus = typeof this._cacheService?.getStatus === 'function'
      ? this._cacheService.getStatus()
      : null;

    res.json({
      status: 'success',
      data: {
        circuitBreaker: {
          state: this._circuitBreaker.opened ? 'OPEN' : 'CLOSED',
          stats: this._circuitBreaker.stats
        },
        cache: cacheStatus,
        inflight: {
          rawPlaylist: this._rawPlaylistInflight.size,
          catalog: this._catalogInflight.size,
          sharedLiveCatalog: this._sharedLiveCatalogInflight.size
        },
        sessions: {
          vod: this._vodSessions.size
        },
        originCaches: {
          providerOrigins: this._userProviderOrigins.size,
          allowedOrigins: this._userAllowedOrigins.size
        },
        streamProxy: {
          upstreamTimeoutMs: this._upstreamTimeoutMs,
          streamTimeoutMs: this._streamProxyTimeoutMs,
          streamReadTimeoutMs: this._streamProxyReadTimeoutMs,
          liveHlsKeepSegments: this._liveHlsKeepSegments
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
    await this._cacheService.delete(`catalog:series:${code}:v1`);
    await this._cacheService.delete(`catalog:movies:${code}:v1`);
    this._userProviderOrigins.delete(code);
    this._userAllowedOrigins.delete(code);

    try {
      const { url } = await this._getUserM3U.execute({ code });
      const providerSignature = buildProviderCatalogSignature(url);
      await this._cacheService.delete(`catalog:live:shared:${providerSignature}:v1`);
      await this._cacheService.delete(`catalog:live:shared:${providerSignature}:v2`);
    } catch {
      // Ignore live catalog cache cleanup failures for inactive users.
    }

    logger.info('M3U cache cleared', { code });
    res.json({ status: 'success', message: 'Cache cleared' });
  });
}

module.exports = M3uController;
