/**
 * Register User Use Case
 * 
 * Creates a new pending user with a generated 16-digit code.
 * 
 * Business Rules:
 * - Code is generated cryptographically
 * - User starts in PENDING status
 * - Code uniqueness enforced by database
 * 
 * @param {UserRepository} userRepository
 * @param {CacheService} cacheService
 */

const User = require('../../domain/entities/User');
const logger = require('../../config/logger');

class RegisterUser {
  constructor(userRepository, cacheService) {
    this._userRepository = userRepository;
    this._cacheService = cacheService;
  }

  /**
   * Execute use case
   * @param {Object} params
   * @param {string} [params.adminNotes] - Optional admin notes
   * @returns {Promise<{ user: User, code: string }>}
   */
  async execute({ adminNotes = null } = {}) {
    logger.info('RegisterUser use case started');

    try {
      // Generate new user with unique code
      const user = User.create(adminNotes);
      
      logger.debug('Generated new user code', { 
        codeMasked: user.code.toMaskedString() 
      });

      // Persist to database
      const savedUser = await this._userRepository.save(user);
      
      logger.info('User registered successfully', { 
        userId: savedUser.id,
        codeMasked: savedUser.code.toMaskedString(),
        status: savedUser.status.toString()
      });

      return {
        user: savedUser,
        code: savedUser.code.toString()
      };
    } catch (error) {
      logger.error('RegisterUser failed', { error: error.message });
      throw error;
    }
  }
}

module.exports = RegisterUser;
