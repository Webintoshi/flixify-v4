/**
 * Cache Service Port (Interface)
 * 
 * Abstraction for caching layer (Redis implementation).
 * Used for:
 * - JWT token blacklisting
 * - User session caching
 * - Rate limiting counters
 * - M3U metadata caching
 */

class CacheService {
  /**
   * Get value by key
   * @param {string} key
   * @returns {Promise<any>}
   */
  async get(key) {
    throw new Error('Method not implemented: get');
  }

  /**
   * Set value with optional TTL
   * @param {string} key
   * @param {any} value
   * @param {number} ttlSeconds
   * @returns {Promise<void>}
   */
  async set(key, value, ttlSeconds = null) {
    throw new Error('Method not implemented: set');
  }

  /**
   * Delete key
   * @param {string} key
   * @returns {Promise<void>}
   */
  async delete(key) {
    throw new Error('Method not implemented: delete');
  }

  /**
   * Check if key exists
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  async exists(key) {
    throw new Error('Method not implemented: exists');
  }

  /**
   * Increment counter (for rate limiting)
   * @param {string} key
   * @returns {Promise<number>}
   */
  async increment(key) {
    throw new Error('Method not implemented: increment');
  }

  /**
   * Set expiry on key
   * @param {string} key
   * @param {number} ttlSeconds
   * @returns {Promise<void>}
   */
  async expire(key, ttlSeconds) {
    throw new Error('Method not implemented: expire');
  }

  /**
   * Get TTL remaining
   * @param {string} key
   * @returns {Promise<number>}
   */
  async ttl(key) {
    throw new Error('Method not implemented: ttl');
  }

  /**
   * Blacklist JWT token
   * @param {string} token
   * @param {number} expiresInSeconds
   * @returns {Promise<void>}
   */
  async blacklistToken(token, expiresInSeconds) {
    throw new Error('Method not implemented: blacklistToken');
  }

  /**
   * Check if token is blacklisted
   * @param {string} token
   * @returns {Promise<boolean>}
   */
  async isTokenBlacklisted(token) {
    throw new Error('Method not implemented: isTokenBlacklisted');
  }

  /**
   * Cache user data
   * @param {string} code
   * @param {Object} userData
   * @param {number} ttlSeconds
   * @returns {Promise<void>}
   */
  async cacheUser(code, userData, ttlSeconds = 300) {
    throw new Error('Method not implemented: cacheUser');
  }

  /**
   * Get cached user
   * @param {string} code
   * @returns {Promise<Object|null>}
   */
  async getCachedUser(code) {
    throw new Error('Method not implemented: getCachedUser');
  }

  /**
   * Invalidate user cache
   * @param {string} code
   * @returns {Promise<void>}
   */
  async invalidateUser(code) {
    throw new Error('Method not implemented: invalidateUser');
  }

  /**
   * Health check
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    throw new Error('Method not implemented: healthCheck');
  }

  /**
   * Close connection
   * @returns {Promise<void>}
   */
  async close() {
    throw new Error('Method not implemented: close');
  }
}

module.exports = CacheService;
