/**
 * IPTV Platform Server
 * 
 * Main entry point for the application.
 * Wires together all components following Dependency Injection pattern.
 * 
 * Startup Sequence:
 * 1. Load environment configuration
 * 2. Initialize infrastructure (DB, Cache)
 * 3. Create use cases (application layer)
 * 4. Create controllers (API layer)
 * 5. Configure middleware
 * 6. Start HTTP server
 * 
 * Version: 1.0.1 - Fixed admin user management endpoints
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const hpp = require('hpp');
const { createClient } = require('@supabase/supabase-js');
const Redis = require('ioredis');
const { spawn } = require('child_process');

// Configuration
const logger = require('./config/logger');
const { applyReleaseHeaders, getReleaseInfo } = require('./config/release');

// Infrastructure
const SupabaseUserRepository = require('./infrastructure/persistence/SupabaseUserRepository');
const SupabaseAdminRepository = require('./infrastructure/persistence/SupabaseAdminRepository');
const InMemoryUserRepository = require('./infrastructure/persistence/InMemoryUserRepository');
const RedisCacheService = require('./infrastructure/cache/RedisCacheService');
const TelegramBotService = require('./infrastructure/external-services/TelegramBotService');

// Use Cases
const RegisterUser = require('./application/use-cases/RegisterUser');
const LoginUser = require('./application/use-cases/LoginUser');
const ActivateUser = require('./application/use-cases/ActivateUser');
const GetUserM3U = require('./application/use-cases/GetUserM3U');

// Controllers
const AuthController = require('./api/controllers/AuthController');
const AdminController = require('./api/controllers/AdminController');
const M3uController = require('./api/controllers/M3uController');

// Middleware
const { createAuthMiddleware, createAdminAuthMiddleware, createOptionalAuthMiddleware, createSubscriptionCheckMiddleware } = require('./api/middleware/auth');
const { createRateLimiters } = require('./api/middleware/rateLimit');
const validators = require('./api/middleware/validation');
const { errorHandler, notFoundHandler } = require('./api/middleware/errorHandler');

// Routes
const createRoutes = require('./api/routes');

function buildAllowedOrigins() {
  const configuredOrigins = (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || process.env.FRONTEND_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    configuredOrigins,
    defaultPatterns: [
      /^https?:\/\/([a-z0-9-]+\.)*flixify\.pro$/i,
      /^http:\/\/localhost:(5173|6670)$/i
    ]
  };
}

function buildCorsAllowedHeaders() {
  return (process.env.CORS_ALLOWED_HEADERS || '')
    .split(',')
    .map((header) => header.trim())
    .filter(Boolean);
}

function isAllowedOrigin(origin, allowedOrigins) {
  if (!origin) {
    return true;
  }

  if (allowedOrigins.configuredOrigins.includes(origin)) {
    return true;
  }

  return allowedOrigins.defaultPatterns.some((pattern) => pattern.test(origin));
}

function setNoStoreHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
}

function formatMemoryUsage(memoryUsage = {}) {
  return Object.fromEntries(
    Object.entries(memoryUsage).map(([key, value]) => [
      key,
      {
        bytes: value,
        mb: Number((value / (1024 * 1024)).toFixed(2))
      }
    ])
  );
}

function createRuntimeStatusProvider({
  cacheService,
  supabaseClient,
  useMockRepository,
  mediaTooling,
  telegramBotService,
  redisClient,
  releaseInfo
}) {
  const cacheTtlMs = Number.parseInt(process.env.HEALTHCHECK_CACHE_TTL_MS || '30000', 10);
  let cachedSnapshot = null;
  let cachedAt = 0;
  let inflight = null;

  return async function getRuntimeStatus(options = {}) {
    const { forceRefresh = false } = options;
    const now = Date.now();

    if (!forceRefresh && cachedSnapshot && (now - cachedAt) < cacheTtlMs) {
      return cachedSnapshot;
    }

    if (!forceRefresh && inflight) {
      return inflight;
    }

    inflight = (async () => {
      const cacheStatus = typeof cacheService?.getStatus === 'function'
        ? cacheService.getStatus()
        : {
          driver: redisClient ? 'redis' : 'memory',
          connected: false,
          fallbackEntries: 0
        };

      const cacheHealthy = redisClient
        ? await cacheService.healthCheck()
        : true;

      const cache = {
        ...cacheStatus,
        healthy: cacheHealthy
      };

      let database = {
        provider: useMockRepository ? 'memory' : 'supabase',
        healthy: false,
        degraded: false,
        error: null
      };

      if (useMockRepository) {
        database = {
          ...database,
          healthy: true,
          degraded: true
        };
      } else {
        try {
          const { error } = await supabaseClient
            .from('users')
            .select('id', { head: true, count: 'planned' })
            .limit(1);

          database = {
            ...database,
            healthy: !error,
            error: error?.message || null
          };
        } catch (error) {
          database = {
            ...database,
            healthy: false,
            error: error.message
          };
        }
      }

      const media = {
        ...mediaTooling,
        healthy: Boolean(mediaTooling?.ready)
      };

      const summaryStatus = (!database.healthy || !cache.healthy || !media.healthy)
        ? 'degraded'
        : 'ok';

      const snapshot = {
        status: summaryStatus,
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.round(process.uptime()),
        service: releaseInfo.service,
        version: releaseInfo.version,
        releaseId: releaseInfo.releaseId,
        environment: releaseInfo.environment,
        apiRoot: releaseInfo.apiRoot,
        memory: formatMemoryUsage(process.memoryUsage()),
        dependencies: {
          database,
          cache,
          media,
          telegram: {
            enabled: telegramBotService.isEnabled()
          }
        }
      };

      cachedSnapshot = snapshot;
      cachedAt = Date.now();

      return snapshot;
    })();

    try {
      return await inflight;
    } finally {
      inflight = null;
    }
  };
}

async function checkCommandAvailability(command) {
  return new Promise((resolve) => {
    const checker = process.platform === 'win32' ? 'where' : 'which';
    const child = spawn(checker, [command], { stdio: 'ignore' });

    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}

async function getMediaToolingStatus() {
  const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
  const ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';
  const ffmpegAvailable = await checkCommandAvailability(ffmpegPath);
  const ffprobeAvailable = await checkCommandAvailability(ffprobePath);

  return {
    ffmpegPath,
    ffprobePath,
    ffmpegAvailable,
    ffprobeAvailable,
    ready: ffmpegAvailable && ffprobeAvailable
  };
}

/**
 * Initialize and start server
 */
async function startServer() {
  logger.info('Starting IPTV Platform server...');

  // ============================================================================
  // INFRASTRUCTURE INITIALIZATION
  // ============================================================================

  // Supabase Client
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    logger.error('Missing Supabase configuration. Check SUPABASE_URL and SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabaseClient = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  // Test Supabase connection
  let useMockRepository = false;
  try {
    const { error } = await supabaseClient.from('users').select('count', { count: 'exact', head: true });
    if (error) throw error;
    logger.info('Supabase connected successfully');
  } catch (error) {
    logger.warn('Supabase connection failed, switching to IN-MEMORY MODE (data will be lost on restart)', { error: error.message });
    useMockRepository = true;
  }

  // Redis Client (optional - graceful degradation if unavailable)
  let redisClient = null;
  if (process.env.REDIS_URL) {
    redisClient = new Redis(process.env.REDIS_URL, {
      retryStrategy: (times) => {
        if (times > 3) {
          logger.warn('Redis connection failed after 3 retries, continuing without cache');
          return null; // Stop retrying
        }
        return Math.min(times * 100, 3000);
      },
      maxRetriesPerRequest: 3
    });
  }

  // ============================================================================
  // DEPENDENCY INJECTION
  // ============================================================================

  // Repositories
  const userRepository = useMockRepository 
    ? new InMemoryUserRepository()
    : new SupabaseUserRepository(supabaseClient);
  
  const adminRepository = new SupabaseAdminRepository(supabaseClient);

  // Cache Service
  const cacheService = new RedisCacheService(redisClient || {
    // Mock Redis for graceful degradation
    get: async () => null,
    set: async () => {},
    del: async () => {},
    exists: async () => false,
    incr: async () => 0,
    expire: async () => {},
    ttl: async () => -2,
    quit: async () => {}
  });

  if (redisClient) {
    await cacheService.connect();
  }

  // JWT Config
  const jwtConfig = {
    secret: process.env.JWT_SECRET || 'development-secret-do-not-use-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  };

  if (jwtConfig.secret === 'development-secret-do-not-use-in-production') {
    logger.warn('Using development JWT secret. Set JWT_SECRET in production!');
  }

  // Media tooling preflight (required for Smart Remux + codec probing)
  const mediaTooling = await getMediaToolingStatus();
  const shouldEnforceMediaTooling =
    String(process.env.ENFORCE_MEDIA_TOOLING || '').toLowerCase() === 'true' ||
    process.env.NODE_ENV === 'production';

  if (!mediaTooling.ready) {
    logger.warn('Media tooling preflight failed', mediaTooling);
    if (shouldEnforceMediaTooling) {
      throw new Error('FFmpeg/FFprobe are required in production. Install both binaries and restart.');
    }
  } else {
    logger.info('Media tooling preflight passed', {
      ffmpegPath: mediaTooling.ffmpegPath,
      ffprobePath: mediaTooling.ffprobePath
    });
  }

  // Use Cases
  const registerUser = new RegisterUser(userRepository, cacheService);
  const loginUser = new LoginUser(userRepository, cacheService, jwtConfig);
  const activateUser = new ActivateUser(userRepository, cacheService);
  const getUserM3U = new GetUserM3U(userRepository, cacheService);
  const telegramBotService = new TelegramBotService({
    token: process.env.TELEGRAM_BOT_TOKEN,
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
    webhookUrl: process.env.TELEGRAM_WEBHOOK_URL,
    webhookHeaderSecret: process.env.TELEGRAM_WEBHOOK_HEADER_SECRET,
    allowedChatIds: process.env.TELEGRAM_ALLOWED_CHAT_IDS,
    notificationChatIds: process.env.TELEGRAM_NOTIFICATION_CHAT_IDS,
    actorAdminId: process.env.TELEGRAM_BOT_ADMIN_ID,
    userRepository,
    adminRepository,
    cacheService,
    expiryAlertDays: process.env.TELEGRAM_EXPIRY_ALERT_DAYS,
    expiryAlertIntervalMs: process.env.TELEGRAM_EXPIRY_ALERT_INTERVAL_MS
  });

  // Controllers
  const authController = new AuthController(
    registerUser,
    loginUser,
    userRepository,
    cacheService,
    jwtConfig,
    telegramBotService
  );
  const adminController = new AdminController(userRepository, activateUser, cacheService, adminRepository);
  const m3uController = new M3uController(getUserM3U, cacheService, jwtConfig.secret);

  // Middleware
  const authMiddleware = createAuthMiddleware({ jwtSecret: jwtConfig.secret, cacheService });
  const adminAuthMiddleware = createAdminAuthMiddleware({ jwtSecret: jwtConfig.secret, cacheService });
  const optionalAuthMiddleware = createOptionalAuthMiddleware({ jwtSecret: jwtConfig.secret, cacheService });
  const subscriptionCheckMiddleware = createSubscriptionCheckMiddleware(userRepository);
  const rateLimiters = createRateLimiters(redisClient);

  // ============================================================================
  // EXPRESS APPLICATION
  // ============================================================================

  const app = express();
  const releaseInfo = getReleaseInfo();

  // Trust proxy (for X-Forwarded-For behind reverse proxy)
  app.set('trust proxy', 1);

  // Store Redis client in app locals for access in routes
  app.locals.redisClient = redisClient;
  app.locals.mediaTooling = mediaTooling;
  app.locals.releaseInfo = releaseInfo;
  app.locals.getRuntimeStatus = createRuntimeStatusProvider({
    cacheService,
    supabaseClient,
    useMockRepository,
    mediaTooling,
    telegramBotService,
    redisClient,
    releaseInfo
  });

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'", "https:", "http:", "wss:", "ws:"]
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: {
      policy: 'cross-origin'
    }
  }));

  const allowedOrigins = buildAllowedOrigins();
  const configuredCorsAllowedHeaders = buildCorsAllowedHeaders();

  app.use(cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin, allowedOrigins)) {
        return callback(null, true);
      }

      return callback(new Error('Origin not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: configuredCorsAllowedHeaders.length > 0 ? configuredCorsAllowedHeaders : undefined,
    exposedHeaders: ['X-Request-ID', 'X-Api-Version', 'X-Release-Id'],
    maxAge: Number.parseInt(process.env.CORS_PREFLIGHT_MAX_AGE_SEC || '86400', 10),
    optionsSuccessStatus: 204
  }));

  // HTTP Parameter Pollution protection
  app.use(hpp());

  // Compression
  app.use(compression());

  // Body parsing
  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: true, limit: '10kb' }));

  // Request logging
  app.use(logger.requestLogger());

  // Request ID header
  app.use((req, res, next) => {
    const correlationId = req.headers['x-request-id'] || require('crypto').randomUUID();
    req.correlationId = correlationId;
    res.setHeader('X-Request-ID', correlationId);
    next();
  });

  app.use((req, res, next) => {
    applyReleaseHeaders(res, req.app.locals.releaseInfo || releaseInfo);
    next();
  });

  // Global rate limiting
  app.use(rateLimiters.global);

  // ============================================================================
  // ROUTES
  // ============================================================================

  // API v1 routes
  const routes = createRoutes({
    authController,
    adminController,
    m3uController,
    authMiddleware,
    adminAuthMiddleware,
    optionalAuthMiddleware,
    subscriptionCheckMiddleware,
    rateLimiters,
    validators,
    userRepository,
    supabaseClient,
    telegramBotService
  });

  app.use('/api/v1', routes);

  app.post('/api/v1/telegram/webhook/:secret', async (req, res) => {
    const headerSecret = req.headers['x-telegram-bot-api-secret-token'];
    const isAuthorized = telegramBotService.isAuthorizedRequest(req.params.secret, headerSecret);

    if (!isAuthorized) {
      return res.status(401).json({ error: 'Unauthorized Telegram webhook' });
    }

    res.status(200).json({ ok: true });

    try {
      await telegramBotService.handleUpdate(req.body);
    } catch (error) {
      logger.error('Telegram webhook update handling failed', { error: error.message });
    }
  });

  app.get('/api/v1/telegram/health', (_req, res) => {
    res.json({
      status: 'success',
      data: {
        enabled: telegramBotService.isEnabled()
      }
    });
  });

  app.get('/', async (req, res) => {
    setNoStoreHeaders(res);
    const publicReleaseInfo = req.app.locals.releaseInfo || releaseInfo;

    res.json({
      status: 'success',
      data: {
        service: publicReleaseInfo.service,
        version: publicReleaseInfo.version,
        releaseId: publicReleaseInfo.releaseId,
        environment: publicReleaseInfo.environment,
        apiRoot: publicReleaseInfo.apiRoot,
        health: '/health',
        apiHealth: '/api/v1/health',
        ready: '/api/v1/ready',
        m3uHealth: '/api/v1/m3u/health'
      }
    });
  });

  // Development routes (REMOVE IN PRODUCTION)
  if (process.env.NODE_ENV === 'development') {
    const devRoutes = require('./api/routes/dev')(userRepository, activateUser);
    app.use('/dev', devRoutes);
  }

  // Health check at root
  app.get('/health', async (req, res) => {
    setNoStoreHeaders(res);
    const runtimeStatus = typeof req.app.locals.getRuntimeStatus === 'function'
      ? await req.app.locals.getRuntimeStatus()
      : null;
    const publicReleaseInfo = req.app.locals.releaseInfo || releaseInfo;

    res.status(200).json({
      status: runtimeStatus?.status === 'degraded' ? 'degraded' : 'healthy',
      service: publicReleaseInfo.service,
      timestamp: runtimeStatus?.timestamp || new Date().toISOString(),
      version: runtimeStatus?.version || publicReleaseInfo.version,
      releaseId: runtimeStatus?.releaseId || publicReleaseInfo.releaseId,
      environment: runtimeStatus?.environment || publicReleaseInfo.environment,
      apiRoot: runtimeStatus?.apiRoot || publicReleaseInfo.apiRoot,
      uptimeSeconds: runtimeStatus?.uptimeSeconds || Math.round(process.uptime()),
      dependencies: runtimeStatus?.dependencies || null
    });
  });

  // 404 handler
  app.use(notFoundHandler);

  // Global error handler
  app.use(errorHandler);

  // ============================================================================
  // START SERVER
  // ============================================================================

  const PORT = process.env.PORT || 3000;
  const HOST = process.env.HOST || '0.0.0.0';

  await telegramBotService.start();

  const server = app.listen(PORT, HOST, () => {
    logger.info(`Server running on http://${HOST}:${PORT}`, {
      environment: process.env.NODE_ENV || 'development',
      port: PORT,
      redis: redisClient ? 'enabled' : 'disabled'
    });
  });

  // Keep long-running media responses stable (live stream proxy / HLS segment flow).
  const keepAliveTimeoutMs = Number.parseInt(process.env.SERVER_KEEP_ALIVE_TIMEOUT_MS || '120000', 10);
  const headersTimeoutMs = Number.parseInt(
    process.env.SERVER_HEADERS_TIMEOUT_MS || String(Math.max((Number.isFinite(keepAliveTimeoutMs) ? keepAliveTimeoutMs : 120000) + 5000, 65000)),
    10
  );
  const requestTimeoutMs = Number.parseInt(process.env.SERVER_REQUEST_TIMEOUT_MS || '0', 10);

  if (Number.isFinite(keepAliveTimeoutMs) && keepAliveTimeoutMs >= 0) {
    server.keepAliveTimeout = keepAliveTimeoutMs;
  }

  if (Number.isFinite(headersTimeoutMs) && headersTimeoutMs >= 0) {
    server.headersTimeout = headersTimeoutMs;
  }

  if (Number.isFinite(requestTimeoutMs) && requestTimeoutMs >= 0) {
    server.requestTimeout = requestTimeoutMs;
  }

  server.setTimeout(0);

  // Graceful shutdown
  const shutdown = async (signal) => {
    logger.info(`${signal} received. Starting graceful shutdown...`);

    server.close(async () => {
      logger.info('HTTP server closed');

      // Close Redis connection
      if (cacheService) {
        await cacheService.close();
      }

      logger.info('Graceful shutdown complete');
      process.exit(0);
    });

    // Force shutdown after 30 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error: error.message, stack: error.stack });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason });
    process.exit(1);
  });

  return server;
}

// Start server if not in test mode
if (process.env.NODE_ENV !== 'test') {
  startServer().catch(error => {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  });
}

module.exports = { startServer };
