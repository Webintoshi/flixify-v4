/**
 * Request Validation Middleware
 * 
 * Validates incoming requests using express-validator.
 * Provides custom validators for domain-specific rules.
 * 
 * Security:
 * - Input sanitization (trim, escape)
 * - Length limits
 * - Pattern matching
 * - Type validation
 */

const { body, param, validationResult } = require('express-validator');
const logger = require('../../config/logger');

/**
 * Format validation errors for response
 */
const formatErrors = (errors) => {
  return errors.array().map(error => ({
    field: error.path,
    message: error.msg,
    value: error.value ? '[REDACTED]' : undefined
  }));
};

/**
 * Middleware to check validation results
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    logger.debug('Validation failed', { 
      errors: errors.array().map(e => ({ field: e.path, msg: e.msg })),
      path: req.path
    });
    
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Request validation failed',
      code: 'VALIDATION_ERROR',
      details: formatErrors(errors)
    });
  }
  
  next();
};

/**
 * Validation chains for different endpoints
 */
const validators = {
  /**
   * Login validation
   * 16-digit hexadecimal code
   */
  login: [
    body('code')
      .trim()
      .notEmpty().withMessage('Code is required')
      .isLength({ min: 16, max: 16 }).withMessage('Code must be exactly 16 characters')
      .matches(/^[0-9a-fA-F]+$/).withMessage('Code must contain only hexadecimal characters (0-9, A-F)')
      .toUpperCase(),
    handleValidationErrors
  ],

  /**
   * User activation (admin)
   */
  activateUser: [
    param('code')
      .trim()
      .notEmpty().withMessage('Code is required')
      .isLength({ min: 16, max: 16 }).withMessage('Code must be exactly 16 characters')
      .matches(/^[0-9a-fA-F]+$/).withMessage('Code must contain only hexadecimal characters')
      .toUpperCase(),
    body('m3uUrl')
      .trim()
      .notEmpty().withMessage('M3U URL is required')
      .isURL({ protocols: ['http'], require_protocol: true }).withMessage('M3U URL must be a valid HTTP URL')
      .isLength({ max: 2048 }).withMessage('M3U URL exceeds maximum length'),
    body('expiresAt')
      .optional()
      .isISO8601().withMessage('Expiration date must be a valid ISO 8601 date')
      .custom((value) => {
        if (new Date(value) < new Date()) {
          throw new Error('Expiration date must be in the future');
        }
        return true;
      }),
    body('adminNotes')
      .optional()
      .trim()
      .isLength({ max: 1000 }).withMessage('Admin notes must not exceed 1000 characters')
      .escape(),
    handleValidationErrors
  ],

  /**
   * M3U proxy request validation
   */
  m3uProxy: [
    param('code')
      .trim()
      .notEmpty().withMessage('Code is required')
      .matches(/^[0-9a-fA-F]{16}$/i).withMessage('Invalid code format')
      .toUpperCase(),
    handleValidationErrors
  ],

  /**
   * Pagination validation
   */
  pagination: [
    param('page')
      .optional()
      .isInt({ min: 1 }).withMessage('Page must be a positive integer')
      .toInt(),
    param('limit')
      .optional()
      .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
      .toInt(),
    handleValidationErrors
  ],

  /**
   * Admin notes update
   */
  updateNotes: [
    body('adminNotes')
      .trim()
      .notEmpty().withMessage('Admin notes cannot be empty')
      .isLength({ max: 1000 }).withMessage('Admin notes must not exceed 1000 characters')
      .escape(),
    handleValidationErrors
  ]
};

module.exports = validators;
