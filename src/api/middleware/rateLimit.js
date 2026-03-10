/**
 * Rate Limiting Configuration
 * 
 * Multi-tier rate limiting strategy:
 * - Global: General API abuse protection
 * - Auth: Strict limits on authentication endpoints
 * - M3U: Balanced limits for streaming endpoints
 * 
 * Uses Redis for distributed rate limiting (multi-instance support)
 */

const rateLimit = require('express-rate-limit');
const logger = require('../../config/logger');

// Lazy load RedisStore only when needed
let RedisStore;
try {
  const rateLimitRedis = require('rate-limit-redis');
  RedisStore = rateLimitRedis.default || rateLimitRedis.RedisStore || rateLimitRedis;
} catch (e) {
  RedisStore = null;
}

function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }

  return req.ip || req.connection?.remoteAddress || 'unknown';
}

function decodeTokenCode(token) {
  if (!token || typeof token !== 'string') {
    return '';
  }

  try {
    const [, payload] = token.split('.');
    if (!payload) {
      return '';
    }

    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return decoded.code || decoded.adminId || '';
  } catch {
    return '';
  }
}

function getRequestIdentity(req) {
  if (req.user?.code || req.user?.adminId) {
    return req.user.code || req.user.adminId;
  }

  if (req.params?.code) {
    return req.params.code;
  }

  if (req.body?.code) {
    return req.body.code;
  }

  if (req.query?.code) {
    return req.query.code;
  }

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return decodeTokenCode(authHeader.substring(7));
  }

  if (req.query?.token) {
    return decodeTokenCode(req.query.token);
  }

  return '';
}

function isSkippedMediaPath(reqPath = '') {
  const path = String(reqPath || '');
  return (
    path.startsWith('/stream/') ||
    path.startsWith('/m3u/logo/') ||
    path.startsWith('/api/v1/stream/') ||
    path.startsWith('/api/v1/m3u/logo/')
  );
}

/**
 * Create rate limiter with Redis store
 */
function createRateLimiter(options) {
  const { windowMs = 15 * 60 * 1000, max = 100, keyPrefix = 'rl:', message } = options;

  const limiterOptions = {
    windowMs,
    max,
    standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false, // Disable `X-RateLimit-*` headers
    keyGenerator: (req) => {
      const requestIdentity = getRequestIdentity(req);
      const ip = getClientIp(req);
      return `${keyPrefix}${ip}:${requestIdentity}`;
    },
    handler: (req, res, _next, _options) => {
      logger.warn('Rate limit exceeded', {
        ip: getClientIp(req),
        path: req.path,
        userCode: getRequestIdentity(req)?.toString()?.slice(0, 4) ? `${getRequestIdentity(req).toString().slice(0, 4)}****` : null
      });
      
      res.status(429).json({
        error: 'Too Many Requests',
        message: message || 'Rate limit exceeded. Please try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    },
    skip: (req) => {
      // Skip rate limiting for health checks
      return (
        req.path === '/health' ||
        req.path === '/api/health' ||
        isSkippedMediaPath(req.path)
      );
    }
  };

  // Add Redis store if available
  if (options.redisClient && RedisStore) {
    try {
      limiterOptions.store = new RedisStore({
        sendCommand: (...args) => options.redisClient.call(...args),
        prefix: keyPrefix
      });
    } catch (e) {
      logger.warn('RedisStore initialization failed, using memory store');
    }
  }

  return rateLimit(limiterOptions);
}

/**
 * Rate limiter configurations
 */
function createRateLimiters(redisClient) {
  return {
    /**
     * Global API rate limiter
     * 600 requests per 15 minutes per client
     */
    global: createRateLimiter({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 600,
      keyPrefix: 'rl:global:',
      redisClient
    }),

    /**
     * Authentication rate limiter (strict)
     * 20 requests per 15 minutes per client/code
     * Protects against brute force code guessing
     */
    auth: createRateLimiter({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 20,
      keyPrefix: 'rl:auth:',
      message: 'Too many authentication attempts. Please wait a moment and try again.',
      redisClient
    }),

    /**
     * Playlist fetch limiter
     * 120 requests per minute per user/device
     */
    playlist: createRateLimiter({
      windowMs: 60 * 1000, // 1 minute
      max: 120,
      keyPrefix: 'rl:playlist:',
      message: 'Too many playlist requests. Please slow down.',
      redisClient
    }),

    /**
     * Media proxy limiter
     * Allows bursty logo and TS segment traffic per viewer.
     */
    media: createRateLimiter({
      windowMs: 60 * 1000, // 1 minute
      max: 2400,
      keyPrefix: 'rl:media:',
      message: 'Too many media requests. Please slow down.',
      redisClient
    }),

    /**
     * Admin operations rate limiter
     * 30 requests per minute per admin
     */
    admin: createRateLimiter({
      windowMs: 60 * 1000, // 1 minute
      max: 30,
      keyPrefix: 'rl:admin:',
      message: 'Too many admin operations. Please slow down.',
      redisClient
    }),

    /**
     * Admin authentication rate limiter
     * 10 attempts per 5 minutes per IP
     * More lenient than auth limiter for admin access
     */
    adminAuth: createRateLimiter({
      windowMs: 5 * 60 * 1000, // 5 minutes
      max: 10,
      keyPrefix: 'rl:admin:auth:',
      message: 'Too many login attempts. Please try again in 5 minutes.',
      redisClient
    })
  };
}

module.exports = { createRateLimiter, createRateLimiters };
