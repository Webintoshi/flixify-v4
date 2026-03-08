/**
 * Redis Cache Service Implementation
 * 
 * Provides caching for:
 * - User data (TTL: 5 minutes)
 * - JWT token blacklist (TTL: token expiry)
 * - Rate limiting counters
 * 
 * Fallback Strategy:
 * - If Redis is unavailable, operations continue (cache-aside pattern)
 * - Log warnings for Redis failures
 */

const CacheService = require('../../application/ports/CacheService');
const logger = require('../../config/logger');

class RedisCacheService extends CacheService {
  constructor(redisClient) {
    super();
    this._redis = redisClient;
    this._isConnected = false;
    this._keyPrefix = 'iptv:';
  }

  _prefixedKey(key) {
    return `${this._keyPrefix}${key}`;
  }

  async connect() {
    try {
      this._redis.on('connect', () => {
        this._isConnected = true;
        logger.info('Redis connected successfully');
      });

      this._redis.on('error', (error) => {
        this._isConnected = false;
        logger.error('Redis connection error', { error: error.message });
      });

      this._redis.on('reconnecting', () => {
        logger.warn('Redis reconnecting...');
      });

      // Test connection
      await this._redis.ping();
    } catch (error) {
      logger.error('Failed to connect to Redis', { error: error.message });
      // Don't throw - allow graceful degradation
    }
  }

  async get(key) {
    try {
      if (!this._isConnected) return null;
      
      const value = await this._redis.get(this._prefixedKey(key));
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.warn('Redis get error', { error: error.message, key });
      return null;
    }
  }

  async set(key, value, ttlSeconds = null) {
    try {
      if (!this._isConnected) return;
      
      const serialized = JSON.stringify(value);
      const prefixed = this._prefixedKey(key);
      
      if (ttlSeconds) {
        await this._redis.setex(prefixed, ttlSeconds, serialized);
      } else {
        await this._redis.set(prefixed, serialized);
      }
    } catch (error) {
      logger.warn('Redis set error', { error: error.message, key });
    }
  }

  async delete(key) {
    try {
      if (!this._isConnected) return;
      await this._redis.del(this._prefixedKey(key));
    } catch (error) {
      logger.warn('Redis delete error', { error: error.message, key });
    }
  }

  async exists(key) {
    try {
      if (!this._isConnected) return false;
      const result = await this._redis.exists(this._prefixedKey(key));
      return result === 1;
    } catch (error) {
      logger.warn('Redis exists error', { error: error.message, key });
      return false;
    }
  }

  async increment(key) {
    try {
      if (!this._isConnected) return 0;
      return await this._redis.incr(this._prefixedKey(key));
    } catch (error) {
      logger.warn('Redis increment error', { error: error.message, key });
      return 0;
    }
  }

  async expire(key, ttlSeconds) {
    try {
      if (!this._isConnected) return;
      await this._redis.expire(this._prefixedKey(key), ttlSeconds);
    } catch (error) {
      logger.warn('Redis expire error', { error: error.message, key });
    }
  }

  async ttl(key) {
    try {
      if (!this._isConnected) return -2;
      return await this._redis.ttl(this._prefixedKey(key));
    } catch (error) {
      logger.warn('Redis ttl error', { error: error.message, key });
      return -2;
    }
  }

  async blacklistToken(token, expiresInSeconds) {
    try {
      if (!this._isConnected) return;
      
      // Hash token for consistent key length
      const crypto = require('crypto');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const key = `blacklist:${tokenHash}`;
      
      await this._redis.setex(
        this._prefixedKey(key),
        expiresInSeconds,
        '1'
      );
      
      logger.info('Token blacklisted', { tokenHash: tokenHash.substring(0, 16) + '...' });
    } catch (error) {
      logger.warn('Redis blacklist error', { error: error.message });
    }
  }

  async isTokenBlacklisted(token) {
    try {
      if (!this._isConnected) return false;
      
      const crypto = require('crypto');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const key = `blacklist:${tokenHash}`;
      
      const exists = await this._redis.exists(this._prefixedKey(key));
      return exists === 1;
    } catch (error) {
      logger.warn('Redis blacklist check error', { error: error.message });
      return false;
    }
  }

  async cacheUser(code, userData, ttlSeconds = 300) {
    try {
      if (!this._isConnected) return;
      
      const key = `user:${code}`;
      await this.set(key, userData, ttlSeconds);
      
      logger.debug('User cached', { code });
    } catch (error) {
      logger.warn('Redis cacheUser error', { error: error.message, code });
    }
  }

  async getCachedUser(code) {
    try {
      const key = `user:${code}`;
      return await this.get(key);
    } catch (error) {
      logger.warn('Redis getCachedUser error', { error: error.message, code });
      return null;
    }
  }

  async invalidateUser(code) {
    try {
      const key = `user:${code}`;
      await this.delete(key);
      
      logger.debug('User cache invalidated', { code });
    } catch (error) {
      logger.warn('Redis invalidateUser error', { error: error.message, code });
    }
  }

  async healthCheck() {
    try {
      if (!this._isConnected) return false;
      const result = await this._redis.ping();
      return result === 'PONG';
    } catch (error) {
      return false;
    }
  }

  async close() {
    try {
      await this._redis.quit();
      this._isConnected = false;
      logger.info('Redis connection closed');
    } catch (error) {
      logger.error('Redis close error', { error: error.message });
    }
  }
}

module.exports = RedisCacheService;
