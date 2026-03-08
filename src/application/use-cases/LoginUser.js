/**
 * Login User Use Case
 * 
 * Authenticates user by 16-digit code and generates JWT.
 * 
 * Business Rules:
 * - Code must exist in system
   * - Any status can login (suspended users can view but not stream)
 * - JWT contains code, expires in 24h
 * - Failed logins are logged for security monitoring
 * 
 * @param {UserRepository} userRepository
 * @param {CacheService} cacheService
 * @param {Object} jwtConfig
 */

const Code = require('../../domain/value-objects/Code');
const logger = require('../../config/logger');

class LoginUser {
  constructor(userRepository, cacheService, jwtConfig) {
    this._userRepository = userRepository;
    this._cacheService = cacheService;
    this._jwtConfig = jwtConfig;
  }

  /**
   * Execute use case
   * @param {Object} params
   * @param {string} params.code - 16-digit code
   * @returns {Promise<{ token: string, user: Object }>}
   * @throws {Error} if code invalid or not found
   */
  async execute({ code }) {
    logger.info('LoginUser use case started');

    // Validate code format (defensive programming)
    let codeVo;
    try {
      codeVo = Code.create(code);
    } catch (validationError) {
      logger.warn('Invalid code format in login attempt', { 
        error: validationError.message,
        codeLength: code?.length 
      });
      throw new Error('Invalid code format');
    }

    try {
      // Check cache first
      let user = await this._cacheService.getCachedUser(codeVo.toString());
      
      if (!user) {
        // Fetch from database
        user = await this._userRepository.findByCode(codeVo);
        
        if (user) {
          // Cache for 5 minutes
          await this._cacheService.cacheUser(
            codeVo.toString(), 
            user.toJSON(),
            300
          );
        }
      } else {
        // Reconstitute from cached data
        const User = require('../../domain/entities/User');
        user = User.reconstitute(user);
      }

      if (!user) {
        logger.warn('Login attempt with non-existent code', { 
          codeMasked: codeVo.toMaskedString() 
        });
        throw new Error('Invalid code');
      }

      // Generate JWT
      const jwt = require('jsonwebtoken');
      const token = jwt.sign(
        { 
          code: user.code.toString(),
          status: user.status.toString(),
          type: 'access'
        },
        this._jwtConfig.secret,
        { 
          expiresIn: this._jwtConfig.expiresIn,
          issuer: 'iptv-platform',
          audience: 'iptv-users'
        }
      );

      logger.info('User logged in successfully', { 
        userId: user.id,
        codeMasked: user.code.toMaskedString(),
        status: user.status.toString()
      });

      return {
        token,
        user: user.toJSON()
      };
    } catch (error) {
      if (error.message === 'Invalid code') throw error;
      
      logger.error('LoginUser failed', { 
        error: error.message,
        codeMasked: codeVo.toMaskedString()
      });
      throw new Error('Authentication failed');
    }
  }
}

module.exports = LoginUser;
