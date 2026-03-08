/**
 * Authentication Middleware
 * 
 * Validates JWT tokens and attaches user context to request.
 * Supports Bearer token in Authorization header.
 * 
 * Security Features:
 * - Token blacklist checking
 * - Correlation ID propagation
 * - PII-safe logging
 */

const jwt = require('jsonwebtoken');
const logger = require('../../config/logger');

/**
 * Create authentication middleware
 * @param {Object} config - { jwtSecret, cacheService }
 * @returns {Function} Express middleware
 */
function createAuthMiddleware(config) {
  const { jwtSecret, cacheService } = config;

  return async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.debug('Missing or invalid authorization header', {
        ip: req.ip,
        path: req.path
      });
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header',
        code: 'AUTH_MISSING_TOKEN'
      });
    }

    const token = authHeader.substring(7);

    try {
      // Check if token is blacklisted (after logout)
      if (cacheService) {
        const isBlacklisted = await cacheService.isTokenBlacklisted(token);
        if (isBlacklisted) {
          logger.warn('Blacklisted token used', {
            ip: req.ip,
            path: req.path
          });
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'Token has been revoked',
            code: 'AUTH_TOKEN_REVOKED'
          });
        }
      }

      // Verify token
      const decoded = jwt.verify(token, jwtSecret, {
        issuer: 'iptv-platform',
        audience: 'iptv-users'
      });

      // Validate token payload structure
      if (!decoded.code || !decoded.status) {
        logger.warn('Invalid token payload structure');
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid token',
          code: 'AUTH_INVALID_TOKEN'
        });
      }

      // Attach user context to request
      req.user = {
        code: decoded.code,
        status: decoded.status,
        token: token,
        iat: decoded.iat,
        exp: decoded.exp
      };

      logger.debug('User authenticated', {
        codeMasked: decoded.code.substring(0, 4) + '****' + decoded.code.slice(-4),
        path: req.path
      });

      next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        logger.debug('Expired token used', { path: req.path });
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Token has expired',
          code: 'AUTH_TOKEN_EXPIRED'
        });
      }

      if (error.name === 'JsonWebTokenError') {
        logger.warn('Invalid token signature', { path: req.path, ip: req.ip });
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid token',
          code: 'AUTH_INVALID_TOKEN'
        });
      }

      logger.error('Authentication error', { error: error.message, path: req.path });
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Authentication failed',
        code: 'AUTH_ERROR'
      });
    }
  };
}

/**
 * Optional auth middleware - attaches user if token present, doesn't fail without it
 */
function createOptionalAuthMiddleware(config) {
  const { jwtSecret, cacheService } = config;

  return async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);

    try {
      if (cacheService) {
        const isBlacklisted = await cacheService.isTokenBlacklisted(token);
        if (isBlacklisted) return next();
      }

      const decoded = jwt.verify(token, jwtSecret, {
        issuer: 'iptv-platform',
        audience: 'iptv-users'
      });

      if (decoded.code && decoded.status) {
        req.user = {
          code: decoded.code,
          status: decoded.status,
          token: token
        };
      }
    } catch (error) {
      // Ignore errors in optional auth
    }

    next();
  };
}

/**
 * Create admin authentication middleware
 * Validates admin JWT tokens
 */
function createAdminAuthMiddleware(config) {
  const { jwtSecret, cacheService } = config;

  return async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header',
        code: 'AUTH_MISSING_TOKEN'
      });
    }

    const token = authHeader.substring(7);

    try {
      // Verify token
      const decoded = jwt.verify(token, jwtSecret);

      // Admin tokens have adminId, not code
      if (!decoded.adminId) {
        logger.warn('Invalid admin token - no adminId');
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid admin token',
          code: 'AUTH_INVALID_TOKEN'
        });
      }

      // Attach admin context to request
      req.user = {
        adminId: decoded.adminId,
        email: decoded.email,
        role: decoded.role,
        token: token
      };

      logger.debug('Admin authenticated', {
        email: decoded.email,
        path: req.path
      });

      next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Token has expired',
          code: 'AUTH_TOKEN_EXPIRED'
        });
      }

      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid token',
          code: 'AUTH_INVALID_TOKEN'
        });
      }

      logger.error('Admin authentication error', { error: error.message, path: req.path });
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Authentication failed',
        code: 'AUTH_ERROR'
      });
    }
  };
}

/**
 * Create subscription check middleware
 * Validates user has active subscription and M3U URL
 */
function createSubscriptionCheckMiddleware(userRepository) {
  return async (req, res, next) => {
    try {
      const { code } = req.user;
      
      // Get full user details from database
      const user = await userRepository.findByCode(code);
      
      if (!user) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }
      
      // Check if user has valid subscription
      const now = new Date();
      const hasValidSubscription = user.expiresAt && new Date(user.expiresAt) > now;
      const hasM3U = !!user.m3uUrl;
      
      if (!hasValidSubscription || !hasM3U) {
        logger.debug('Subscription check failed', {
          codeMasked: code.substring(0, 4) + '****',
          hasValidSubscription,
          hasM3U
        });
        
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Active subscription and M3U URL required',
          code: 'SUBSCRIPTION_REQUIRED',
          data: {
            hasValidSubscription,
            hasM3U,
            requiresPayment: !hasValidSubscription,
            requiresM3U: !hasM3U
          }
        });
      }
      
      // Attach full user info to request
      req.userDetails = user;
      
      next();
    } catch (error) {
      logger.error('Subscription check error', { error: error.message });
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to check subscription',
        code: 'SUBSCRIPTION_CHECK_ERROR'
      });
    }
  };
}

module.exports = {
  createAuthMiddleware,
  createOptionalAuthMiddleware,
  createAdminAuthMiddleware,
  createSubscriptionCheckMiddleware
};
