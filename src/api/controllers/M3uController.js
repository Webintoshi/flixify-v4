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

class M3uController {
  constructor(getUserM3U, cacheService, jwtSecret) {
    this._getUserM3U = getUserM3U;
    this._cacheService = cacheService;
    this._jwtSecret = jwtSecret;
    this._userProviderOrigins = new Map();
    this._userAllowedOrigins = new Map();
    this._vodSessions = new Map();
    this._vodSessionTtlMs = parseInt(process.env.VOD_SESSION_TTL_MS, 10) || 60 * 60 * 1000;
    this._ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
    this._ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';
    this._upstreamTimeoutMs = parseInt(process.env.PROXY_TIMEOUT_MS, 10) || 30000;
    this._streamProxyTimeoutMs = parseInt(process.env.STREAM_PROXY_TIMEOUT_MS, 10) || 120000;
    this._httpAgent = new http.Agent({
      keepAlive: true,
      keepAliveMsecs: 10000,
      maxSockets: 200,
      timeout: this._streamProxyTimeoutMs
    });
    this._httpsAgent = new https.Agent({
      keepAlive: true,
      keepAliveMsecs: 10000,
      maxSockets: 200,
      timeout: this._streamProxyTimeoutMs
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
    if (!value || typeof value !== 'string') {
      return value;
    }

    return value
      .trim()
      .replace('/playlisth/', '/playlist/')
      .replace('/playlists/', '/playlist/');
  }

  _createAxiosConfig(overrides = {}, proxy = null) {
    const config = {
      timeout: this._upstreamTimeoutMs,
      headers: {
        'User-Agent': 'Flixify-V4-Proxy/1.0',
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

  _canDirectPlayProbe(probe) {
    if (!probe) {
      return false;
    }

    const supportedContainers = new Set(['hls', 'mp4', 'webm']);
    return supportedContainers.has(probe.containerType) && !probe.codecRisk;
  }

  _buildPlaybackProbePayload(targetUrl, probe) {
    const containerType = probe?.containerType || this._getContainerType(targetUrl);
    const hasByteRanges = Boolean(probe?.acceptRanges);
    const shouldUseNativeFirst =
      containerType === 'mp4' ||
      containerType === 'webm' ||
      (containerType === 'mkv' && hasByteRanges && !probe?.codecRisk);
    const shouldRemux = !shouldUseNativeFirst;

    return {
      ...(probe || {}),
      playbackStrategy: containerType === 'hls'
        ? 'hls'
        : shouldRemux
          ? 'remux-hls'
          : 'native',
      remuxRecommended: shouldRemux,
      remuxFallback: containerType === 'mkv',
      directPlayLikely: this._canDirectPlayProbe(probe)
    };
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
    args.push(targetUrl);

    try {
      const result = await this._runProcess(this._ffprobePath, args, {
        env: process.env
      });

      const payload = JSON.parse(result.stdout || '{}');
      const videoStream = payload.streams?.find((stream) => stream.codec_type === 'video') || null;
      const audioStream = payload.streams?.find((stream) => stream.codec_type === 'audio') || null;

      return {
        videoCodec: videoStream?.codec_name || null,
        audioCodec: audioStream?.codec_name || null
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
    const videoCodec = mediaAnalysis?.videoCodec || null;
    const audioCodec = mediaAnalysis?.audioCodec || null;

    return {
      videoCodec,
      audioCodec,
      transcodeVideo: videoCodec !== 'h264',
      transcodeAudio: audioCodec !== 'aac'
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
    const normalizedUrl = this._normalizeProviderPlaylistUrl(url);
    const candidates = normalizedUrl === url ? [url] : [normalizedUrl, url];
    let lastStatus = null;
    let lastError = null;

    for (const candidateUrl of candidates) {
      try {
        const response = await this._requestViaProviderProxy({
          method: 'get',
          url: candidateUrl,
          timeout: 60000,
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

  _getBaseApiUrl(req) {
    return `${req.protocol}://${req.get('host')}/api/v1`;
  }

  _buildStreamProxyUrl(baseApiUrl, code, token, targetUrl) {
    return `${baseApiUrl}/stream/${encodeURIComponent(code)}?token=${encodeURIComponent(token)}&url=${encodeURIComponent(targetUrl)}`;
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
      return existingSession;
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
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '2',
      '-i', targetUrl,
      '-map', '0:v:0?',
      '-map', '0:a:0?',
      '-sn',
      '-dn',
      '-map_metadata', '-1'
    );

    if (profile.transcodeVideo) {
      args.push(
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '22',
        '-pix_fmt', 'yuv420p'
      );
    } else {
      args.push('-c:v', 'copy');
    }

    if (profile.transcodeAudio) {
      args.push(
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ac', '2'
      );
    } else {
      args.push('-c:a', 'copy');
    }

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
      if (code !== 0) {
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

      m3uUrl = this._normalizeProviderPlaylistUrl(m3uUrl);

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
        timeout: requestMethod === 'get' ? this._streamProxyTimeoutMs : this._upstreamTimeoutMs,
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
          timeout: this._streamProxyTimeoutMs,
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
          timeout: this._streamProxyTimeoutMs,
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
              ...this._buildUpstreamStreamHeaders(req),
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

      const probe = this._buildPlaybackProbePayload(targetUrl, baseProbe);

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
