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
    this._memoryStore = new Map();
  }

  _prefixedKey(key) {
    return `${this._keyPrefix}${key}`;
  }

  _now() {
    return Date.now();
  }

  _setMemoryValue(key, value, ttlSeconds = null) {
    const expiresAt =
      Number.isFinite(ttlSeconds) && ttlSeconds > 0
        ? this._now() + (ttlSeconds * 1000)
        : null;

    this._memoryStore.set(key, {
      value,
      expiresAt
    });
  }

  _getMemoryValue(key) {
    const entry = this._memoryStore.get(key);
    if (!entry) {
      return null;
    }

    if (entry.expiresAt && entry.expiresAt <= this._now()) {
      this._memoryStore.delete(key);
      return null;
    }

    return entry.value;
  }

  _deleteMemoryValue(key) {
    this._memoryStore.delete(key);
  }

  _getMemoryTtlSeconds(key) {
    const entry = this._memoryStore.get(key);
    if (!entry) {
      return -2;
    }

    if (!entry.expiresAt) {
      return -1;
    }

    const remainingMs = entry.expiresAt - this._now();
    if (remainingMs <= 0) {
      this._memoryStore.delete(key);
      return -2;
    }

    return Math.ceil(remainingMs / 1000);
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
      this._isConnected = true;
    } catch (error) {
      logger.error('Failed to connect to Redis', { error: error.message });
      // Don't throw - allow graceful degradation
    }
  }

  async get(key) {
    try {
      const memoryValue = this._getMemoryValue(key);

      if (!this._isConnected) {
        return memoryValue;
      }

      const value = await this._redis.get(this._prefixedKey(key));
      if (!value) {
        return memoryValue;
      }

      const parsedValue = JSON.parse(value);
      this._setMemoryValue(key, parsedValue);
      return parsedValue;
    } catch (error) {
      logger.warn('Redis get error', { error: error.message, key });
      return this._getMemoryValue(key);
    }
  }

  async set(key, value, ttlSeconds = null) {
    this._setMemoryValue(key, value, ttlSeconds);

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
    this._deleteMemoryValue(key);

    try {
      if (!this._isConnected) return;
      await this._redis.del(this._prefixedKey(key));
    } catch (error) {
      logger.warn('Redis delete error', { error: error.message, key });
    }
  }

  async exists(key) {
    try {
      if (!this._isConnected) {
        return this._getMemoryValue(key) !== null;
      }
      const result = await this._redis.exists(this._prefixedKey(key));
      if (result === 1) {
        return true;
      }

      return this._getMemoryValue(key) !== null;
    } catch (error) {
      logger.warn('Redis exists error', { error: error.message, key });
      return this._getMemoryValue(key) !== null;
    }
  }

  async increment(key) {
    try {
      const currentMemoryValue = Number(this._getMemoryValue(key) || 0);
      const nextMemoryValue = currentMemoryValue + 1;
      this._setMemoryValue(key, nextMemoryValue);

      if (!this._isConnected) return nextMemoryValue;
      return await this._redis.incr(this._prefixedKey(key));
    } catch (error) {
      logger.warn('Redis increment error', { error: error.message, key });
      const currentMemoryValue = Number(this._getMemoryValue(key) || 0);
      const nextMemoryValue = currentMemoryValue + 1;
      this._setMemoryValue(key, nextMemoryValue);
      return nextMemoryValue;
    }
  }

  async expire(key, ttlSeconds) {
    const value = this._getMemoryValue(key);
    if (value !== null) {
      this._setMemoryValue(key, value, ttlSeconds);
    }

    try {
      if (!this._isConnected) return;
      await this._redis.expire(this._prefixedKey(key), ttlSeconds);
    } catch (error) {
      logger.warn('Redis expire error', { error: error.message, key });
    }
  }

  async ttl(key) {
    try {
      if (!this._isConnected) return this._getMemoryTtlSeconds(key);
      const redisTtl = await this._redis.ttl(this._prefixedKey(key));
      if (redisTtl >= -1) {
        return redisTtl;
      }
      return this._getMemoryTtlSeconds(key);
    } catch (error) {
      logger.warn('Redis ttl error', { error: error.message, key });
      return this._getMemoryTtlSeconds(key);
    }
  }

  async blacklistToken(token, expiresInSeconds) {
    try {
      // Hash token for consistent key length
      const crypto = require('crypto');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const key = `blacklist:${tokenHash}`;
      await this.set(key, '1', expiresInSeconds);
      
      logger.info('Token blacklisted', { tokenHash: tokenHash.substring(0, 16) + '...' });
    } catch (error) {
      logger.warn('Redis blacklist error', { error: error.message });
    }
  }

  async isTokenBlacklisted(token) {
    try {
      const crypto = require('crypto');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const key = `blacklist:${tokenHash}`;
      return await this.exists(key);
    } catch (error) {
      logger.warn('Redis blacklist check error', { error: error.message });
      return false;
    }
  }

  async cacheUser(code, userData, ttlSeconds = 300) {
    try {
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

  getStatus() {
    return {
      driver: this._isConnected ? 'redis' : 'memory',
      connected: this._isConnected,
      fallbackEntries: this._memoryStore.size
    };
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
