/**
 * Activate User Use Case (Admin Operation)
 * 
 * Activates a pending/suspended user by assigning M3U URL and expiration.
 * 
 * Business Rules:
 * - Only admins can activate
 * - M3U URL must be valid HTTP URL
 * - Expiration date must be in the future
 * - User status changes from PENDING/SUSPENDED to ACTIVE
 * - Cache invalidated after update
 * 
 * @param {UserRepository} userRepository
 * @param {CacheService} cacheService
 */

const Code = require('../../domain/value-objects/Code');
const M3uUrl = require('../../domain/value-objects/M3uUrl');
const logger = require('../../config/logger');

class ActivateUser {
  constructor(userRepository, cacheService) {
    this._userRepository = userRepository;
    this._cacheService = cacheService;
  }

  /**
   * Execute use case
   * @param {Object} params
   * @param {string} params.code - User's 16-digit code
   * @param {string} params.m3uUrl - M3U playlist URL (HTTP only)
   * @param {string} [params.expiresAt] - ISO date string for expiration
   * @param {string} [params.adminNotes] - Optional notes
   * @returns {Promise<User>}
   */
  async execute({ code, m3uUrl, expiresAt = null, adminNotes = null }) {
    logger.info('ActivateUser use case started');

    // Validate inputs
    let codeVo;
    let m3uUrlVo;

    try {
      codeVo = Code.create(code);
    } catch (error) {
      logger.warn('Invalid code format in activate request', { error: error.message });
      throw new Error('Invalid code format');
    }

    try {
      m3uUrlVo = M3uUrl.create(m3uUrl);
    } catch (error) {
      logger.warn('Invalid M3U URL in activate request', { error: error.message });
      throw new Error(`Invalid M3U URL: ${error.message}`);
    }

    // Validate expiration date
    let expirationDate = null;
    if (expiresAt) {
      expirationDate = new Date(expiresAt);
      if (isNaN(expirationDate.getTime())) {
        throw new Error('Invalid expiration date format');
      }
      if (expirationDate < new Date()) {
        throw new Error('Expiration date must be in the future');
      }
    }

    try {
      // Find user
      const user = await this._userRepository.findByCode(codeVo);
      
      if (!user) {
        logger.warn('Activate attempt for non-existent user', { 
          codeMasked: codeVo.toMaskedString() 
        });
        throw new Error('User not found');
      }

      // Check if user can be activated
      if (!user.status.canActivate) {
        logger.warn('Activate attempt for user that cannot be activated', { 
          codeMasked: codeVo.toMaskedString(),
          currentStatus: user.status.toString()
        });
        throw new Error(`Cannot activate user with status: ${user.status}`);
      }

      // Perform activation (creates new immutable instance)
      const activatedUser = user.activate(m3uUrlVo, expirationDate, adminNotes);

      // Persist changes
      const savedUser = await this._userRepository.update(activatedUser);

      // Invalidate cache
      await this._cacheService.invalidateUser(codeVo.toString());

      logger.info('User activated successfully', { 
        userId: savedUser.id,
        codeMasked: savedUser.code.toMaskedString(),
        m3uUrl: savedUser.m3uUrl?.toLogString(),
        expiresAt: savedUser.expiresAt?.toISOString()
      });

      return savedUser;
    } catch (error) {
      if (error.message.includes('not found') || 
          error.message.includes('Cannot activate')) {
        throw error;
      }
      
      logger.error('ActivateUser failed', { 
        error: error.message,
        codeMasked: codeVo.toMaskedString()
      });
      throw new Error('Failed to activate user');
    }
  }
}

module.exports = ActivateUser;
