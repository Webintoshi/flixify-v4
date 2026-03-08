/**
 * Global Error Handler Middleware
 * 
 * RFC 7807 compliant error responses (Problem Details).
 * Centralized error logging and categorization.
 * 
 * Error Categories:
 * - ValidationError: 400 Bad Request
 * - AuthenticationError: 401 Unauthorized
 * - AuthorizationError: 403 Forbidden
 * - NotFoundError: 404 Not Found
 * - ConflictError: 409 Conflict
 * - RateLimitError: 429 Too Many Requests
 * - ServiceError: 503 Service Unavailable
 */

const logger = require('../../config/logger');

/**
 * Custom error classes
 */
class AppError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = []) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

class ConflictError extends AppError {
  constructor(message = 'Conflict detected') {
    super(message, 409, 'CONFLICT');
  }
}

class ServiceUnavailableError extends AppError {
  constructor(service = 'Service') {
    super(`${service} is temporarily unavailable`, 503, 'SERVICE_UNAVAILABLE');
  }
}

/**
 * RFC 7807 Problem Details response
 */
function createProblemDetails(error, req) {
  const problem = {
    type: `https://api.iptv-platform.com/errors/${error.code || 'INTERNAL_ERROR'}`,
    title: error.name || 'Error',
    status: error.statusCode || 500,
    detail: error.message,
    code: error.code || 'INTERNAL_ERROR',
    instance: req.originalUrl,
    timestamp: new Date().toISOString()
  };

  // Add correlation ID for troubleshooting
  if (req.correlationId) {
    problem.correlationId = req.correlationId;
  }

  // Include validation details if available
  if (error.details) {
    problem.validationErrors = error.details;
  }

  // Include stack trace in development
  if (process.env.NODE_ENV === 'development' && error.stack) {
    problem.stack = error.stack.split('\n').slice(0, 5);
  }

  return problem;
}

/**
 * Global error handler middleware
 */
function errorHandler(err, req, res, next) {
  // Determine status code
  let statusCode = err.statusCode || 500;
  let errorCode = err.code || 'INTERNAL_ERROR';

  // Handle specific error types
  if (err.name === 'UnauthorizedError') {
    statusCode = 401;
    errorCode = 'AUTHENTICATION_ERROR';
  } else if (err.name === 'SyntaxError' && err.body) {
    // JSON parse error
    statusCode = 400;
    errorCode = 'INVALID_JSON';
  }

  // Log error appropriately
  const logData = {
    error: err.message,
    code: errorCode,
    statusCode,
    path: req.originalUrl,
    method: req.method,
    ip: req.ip,
    correlationId: req.correlationId,
    userCode: req.user?.code ? req.user.code.substring(0, 4) + '****' : null
  };

  if (statusCode >= 500) {
    logData.stack = err.stack;
    logger.error('Server error', logData);
  } else if (statusCode >= 400) {
    logger.warn('Client error', logData);
  }

  // Send RFC 7807 response
  const problem = createProblemDetails({
    ...err,
    statusCode,
    code: errorCode,
    name: err.name || 'Error'
  }, req);

  res.status(statusCode).json(problem);
}

/**
 * 404 Not Found handler
 */
function notFoundHandler(req, res) {
  logger.debug('Route not found', { path: req.originalUrl, method: req.method });
  
  res.status(404).json({
    type: 'https://api.iptv-platform.com/errors/NOT_FOUND',
    title: 'Not Found',
    status: 404,
    detail: `Route ${req.method} ${req.originalUrl} not found`,
    code: 'NOT_FOUND',
    instance: req.originalUrl,
    timestamp: new Date().toISOString()
  });
}

/**
 * Async handler wrapper - catches errors in async route handlers
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  ServiceUnavailableError,
  errorHandler,
  notFoundHandler,
  asyncHandler
};
