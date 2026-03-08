/**
 * Get User M3U Use Case
 * 
 * Retrieves M3U URL for authenticated user.
 * Validates access permissions before returning.
 * 
 * Business Rules:
 * - User must be ACTIVE
 * - Subscription must not be expired
 * - M3U URL must be assigned
 * - Returns original URL (proxy will handle streaming)
 * 
 * @param {UserRepository} userRepository
 * @param {CacheService} cacheService
 */

const Code = require('../../domain/value-objects/Code');
const logger = require('../../config/logger');

class GetUserM3U {
  constructor(userRepository, cacheService) {
    this._userRepository = userRepository;
    this._cacheService = cacheService;
  }

  /**
   * Execute use case
   * @param {Object} params
   * @param {string} params.code - User's 16-digit code
   * @returns {Promise<{ url: string, expiresAt: Date|null }>}
   * @throws {Error} if access denied
   */
  async execute({ code }) {
    logger.debug('GetUserM3U use case started');

    let codeVo;
    try {
      codeVo = Code.create(code);
    } catch (error) {
      logger.warn('Invalid code format in M3U request', { error: error.message });
      throw new Error('Invalid code format');
    }

    try {
      // Try cache first
      let userData = await this._cacheService.getCachedUser(codeVo.toString());
      let user;

      if (userData) {
        const User = require('../../domain/entities/User');
        user = User.reconstitute(userData);
        logger.debug('User retrieved from cache');
      } else {
        user = await this._userRepository.findByCode(codeVo);
        
        if (user) {
          // Cache for 2 minutes (shorter TTL for M3U access)
          await this._cacheService.cacheUser(codeVo.toString(), user.toJSON(), 120);
        }
      }

      if (!user) {
        logger.warn('M3U request for non-existent user', { 
          codeMasked: codeVo.toMaskedString() 
        });
        throw new Error('User not found');
      }

      // Check access permission (domain logic)
      const accessCheck = user.canAccessContent();
      
      if (!accessCheck.allowed) {
        logger.warn('M3U access denied', { 
          codeMasked: codeVo.toMaskedString(),
          reason: accessCheck.reason,
          status: user.status.toString()
        });
        throw new Error(`Access denied: ${accessCheck.reason}`);
      }

      logger.debug('M3U access granted', { 
        codeMasked: codeVo.toMaskedString(),
        url: user.m3uUrl.toLogString()
      });

      return {
        url: user.m3uUrl.toString(),
        expiresAt: user.expiresAt
      };
    } catch (error) {
      if (error.message.includes('not found') || error.message.includes('Access denied')) {
        throw error;
      }
      
      logger.error('GetUserM3U failed', { 
        error: error.message,
        codeMasked: codeVo.toMaskedString()
      });
      throw new Error('Failed to retrieve M3U');
    }
  }
}

module.exports = GetUserM3U;
