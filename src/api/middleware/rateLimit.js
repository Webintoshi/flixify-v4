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
      // Use IP + user code if authenticated
      const userCode = req.user?.code || '';
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      return `${keyPrefix}${ip}:${userCode}`;
    },
    handler: (req, res, next, options) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        userCode: req.user?.code ? req.user.code.substring(0, 4) + '****' : null
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
      return req.path === '/health' || req.path === '/api/health';
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
     * 100 requests per 15 minutes per IP
     */
    global: createRateLimiter({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100,
      keyPrefix: 'rl:global:',
      redisClient
    }),

    /**
     * Authentication rate limiter (strict)
     * 5 requests per 15 minutes per IP
     * Protects against brute force code guessing
     */
    auth: createRateLimiter({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5,
      keyPrefix: 'rl:auth:',
      message: 'Too many authentication attempts. Please try again in 15 minutes.',
      redisClient
    }),

    /**
     * M3U proxy rate limiter
     * 60 requests per minute per user
     * Allows frequent playlist refreshes but prevents abuse
     */
    m3u: createRateLimiter({
      windowMs: 60 * 1000, // 1 minute
      max: 60,
      keyPrefix: 'rl:m3u:',
      message: 'Too many M3U requests. Please slow down.',
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
