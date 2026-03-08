/**
 * Structured Logging Configuration
 * 
 * Uses Winston for JSON-structured logging with correlation IDs.
 * PII redaction for sensitive fields.
 * 
 * Requirements:
 * - Structured JSON logs for parsing
 * - Correlation ID propagation
 * - PII masking (codes, tokens)
 * - Different levels per environment
 */

const winston = require('winston');

// Sensitive fields to redact
const SENSITIVE_FIELDS = ['code', 'token', 'password', 'secret', 'authorization', 'cookie', 'm3uUrl'];

/**
 * Redact sensitive information from log objects
 */
const redactSensitiveData = winston.format((info) => {
  const redacted = { ...info };
  
  const redactValue = (key, value) => {
    if (!value) return value;
    if (SENSITIVE_FIELDS.some(field => key.toLowerCase().includes(field))) {
      if (typeof value === 'string') {
        if (value.length <= 8) return '***';
        return value.substring(0, 4) + '****' + value.substring(value.length - 4);
      }
      return '[REDACTED]';
    }
    return value;
  };

  Object.keys(redacted).forEach(key => {
    redacted[key] = redactValue(key, redacted[key]);
  });

  // Redact nested objects
  if (redacted.metadata && typeof redacted.metadata === 'object') {
    Object.keys(redacted.metadata).forEach(key => {
      redacted.metadata[key] = redactValue(key, redacted.metadata[key]);
    });
  }

  return redacted;
});

/**
 * Add correlation ID to logs
 */
const addCorrelationId = winston.format((info) => {
  const correlationId = info.correlationId || global.correlationId || 'unknown';
  return {
    ...info,
    correlationId,
    timestamp: new Date().toISOString()
  };
});

// Determine log level from environment
const LOG_LEVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
const LOG_FORMAT = process.env.LOG_FORMAT || (process.env.NODE_ENV === 'production' ? 'json' : 'combined');

// Create format chain
const formats = [
  addCorrelationId(),
  redactSensitiveData(),
  winston.format.errors({ stack: true })
];

if (LOG_FORMAT === 'json') {
  formats.push(winston.format.json());
} else {
  formats.push(winston.format.printf(({ level, message, timestamp, correlationId, ...metadata }) => {
    let msg = `${timestamp} [${correlationId}] ${level.toUpperCase()}: ${message}`;
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
  }));
}

const logger = winston.createLogger({
  level: LOG_LEVEL,
  defaultMeta: {
    service: 'iptv-platform',
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0'
  },
  format: winston.format.combine(...formats),
  transports: [
    new winston.transports.Console({
      stderrLevels: ['error', 'warn']
    })
  ],
  // Handle uncaught exceptions
  exceptionHandlers: [
    new winston.transports.Console()
  ],
  rejectionHandlers: [
    new winston.transports.Console()
  ]
});

/**
 * Create child logger with additional context
 */
logger.child = (meta) => {
  return logger.child(meta);
};

/**
 * HTTP request logging middleware
 */
logger.requestLogger = () => {
  return (req, res, next) => {
    const start = Date.now();
    const correlationId = req.headers['x-request-id'] || req.headers['x-correlation-id'] || require('crypto').randomUUID();
    
    req.correlationId = correlationId;
    res.setHeader('X-Request-ID', correlationId);
    global.correlationId = correlationId;

    res.on('finish', () => {
      const duration = Date.now() - start;
      const logData = {
        correlationId,
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration,
        userAgent: req.get('user-agent'),
        ip: req.ip || req.connection.remoteAddress
      };

      if (res.statusCode >= 500) {
        logger.error('HTTP Request Error', logData);
      } else if (res.statusCode >= 400) {
        logger.warn('HTTP Request Warning', logData);
      } else {
        logger.info('HTTP Request', logData);
      }
    });

    next();
  };
};

module.exports = logger;
