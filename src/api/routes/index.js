/**
 * API Routes Configuration
 * 
 * Versioned API routes with proper middleware chain:
 * 1. Rate limiting
 * 2. Authentication (optional/required)
 * 3. Validation
 * 4. Controller
 * 
 * Route Structure:
 * /api/v1/auth/*     - Authentication endpoints
 * /api/v1/admin/*    - Admin operations (admin auth required)
 * /api/v1/m3u/*      - M3U proxy (user auth required)
 */

const express = require('express');
const logger = require('../../config/logger');

const PackageController = require('../controllers/PackageController');

function setNoStoreHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
}

function getRequestReleaseInfo(req) {
  return req.app?.locals?.releaseInfo || {
    service: 'iptv-platform',
    version: process.env.npm_package_version || '1.0.0',
    releaseId: process.env.RELEASE_ID || process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    apiRoot: '/api/v1'
  };
}

function createRoutes({
  authController,
  adminController,
  m3uController,
  authMiddleware,
  adminAuthMiddleware,
  subscriptionCheckMiddleware,
  rateLimiters,
  validators,
  userRepository,
  telegramBotService = null
}) {
  // Statik paketler için database bağlantısı gerekmez
  const packageController = new PackageController();
  const router = express.Router();

  // Health check (no auth required)
  router.get('/health', async (req, res) => {
    setNoStoreHeaders(res);
    const runtimeStatus = typeof req.app.locals.getRuntimeStatus === 'function'
      ? await req.app.locals.getRuntimeStatus()
      : null;
    const releaseInfo = getRequestReleaseInfo(req);

    res.json({
      status: 'success',
      data: {
        service: releaseInfo.service,
        version: runtimeStatus?.version || releaseInfo.version,
        releaseId: runtimeStatus?.releaseId || releaseInfo.releaseId,
        environment: runtimeStatus?.environment || releaseInfo.environment,
        apiRoot: runtimeStatus?.apiRoot || releaseInfo.apiRoot,
        timestamp: runtimeStatus?.timestamp || new Date().toISOString(),
        serverIp: req.socket.localAddress,
        uptimeSeconds: runtimeStatus?.uptimeSeconds || Math.round(process.uptime()),
        mediaTooling: runtimeStatus?.dependencies?.media || req.app.locals.mediaTooling || null,
        dependencies: runtimeStatus?.dependencies || null
      }
    });
  });

  router.get('/ready', async (req, res) => {
    setNoStoreHeaders(res);
    const runtimeStatus = typeof req.app.locals.getRuntimeStatus === 'function'
      ? await req.app.locals.getRuntimeStatus({ forceRefresh: true })
      : null;
    const releaseInfo = getRequestReleaseInfo(req);

    const databaseHealthy = runtimeStatus?.dependencies?.database?.healthy !== false;
    const mediaHealthy = runtimeStatus?.dependencies?.media?.healthy !== false;
    const ready = Boolean(databaseHealthy && mediaHealthy);

    return res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'degraded',
      data: runtimeStatus
        ? {
          ...runtimeStatus,
          service: runtimeStatus.service || releaseInfo.service,
          version: runtimeStatus.version || releaseInfo.version,
          releaseId: runtimeStatus.releaseId || releaseInfo.releaseId,
          environment: runtimeStatus.environment || releaseInfo.environment,
          apiRoot: runtimeStatus.apiRoot || releaseInfo.apiRoot
        }
        : {
          timestamp: new Date().toISOString(),
          service: releaseInfo.service,
          version: releaseInfo.version,
          releaseId: releaseInfo.releaseId,
          environment: releaseInfo.environment,
          apiRoot: releaseInfo.apiRoot
        }
    });
  });

  router.get('/', (req, res) => {
    setNoStoreHeaders(res);
    const releaseInfo = getRequestReleaseInfo(req);
    res.json({
      status: 'success',
      data: {
        service: releaseInfo.service,
        version: releaseInfo.version,
        releaseId: releaseInfo.releaseId,
        environment: releaseInfo.environment,
        apiRoot: releaseInfo.apiRoot,
        health: '/api/v1/health',
        ready: '/api/v1/ready',
        m3uHealth: '/api/v1/m3u/health'
      }
    });
  });

  // =============================================================================
  // AUTHENTICATION ROUTES
  // =============================================================================
  
  // POST /api/v1/auth/register - Create new user (admin only)
  router.post(
    '/auth/register',
    rateLimiters.admin,
    authMiddleware,
    authController.register
  );

  // POST /api/v1/auth/register-public - Public user registration (no auth required)
  router.post(
    '/auth/register-public',
    rateLimiters.auth,
    async (req, res) => {
      try {
        const User = require('../../domain/entities/User');
        
        // Create user
        const user = User.create('Anonymous User');
        const savedUser = await userRepository.save(user);
        
        // Get code string value
        const codeString = savedUser.code.value || savedUser.code.toString();
        
        logger.info('Public user registered', { 
          codeMasked: codeString.substring(0, 4) + '****' 
        });

        if (telegramBotService) {
          try {
            await telegramBotService.notifyNewRegistration({
              code: codeString,
              status: savedUser.status.toString(),
              createdAt: savedUser.createdAt?.toISOString?.() || new Date().toISOString(),
              source: 'public-register',
              userId: savedUser.id || null
            });
          } catch (notifyError) {
            logger.warn('Failed to send public registration telegram notification', {
              error: notifyError.message
            });
          }
        }
        
        res.status(201).json({
          status: 'success',
          data: {
            code: codeString,
            formattedCode: codeString.match(/.{4}/g).join(' '),
            status: savedUser.status.toString(),
            createdAt: savedUser.createdAt.toISOString()
          },
          message: 'Account created successfully. Save your account number - it will not be shown again.'
        });
      } catch (error) {
        logger.error('Public registration error', { error: error.message });
        res.status(500).json({
          status: 'error',
          message: 'Failed to create account'
        });
      }
    }
  );

  // POST /api/v1/auth/login - Login with code
  router.post(
    '/auth/login',
    rateLimiters.auth,
    validators.login,
    authController.login
  );

  // POST /api/v1/auth/logout - Logout (invalidate token)
  router.post(
    '/auth/logout',
    rateLimiters.global,
    authMiddleware,
    authController.logout
  );

  // GET /api/v1/auth/me - Get current user
  router.get(
    '/auth/me',
    rateLimiters.global,
    authMiddleware,
    authController.me
  );

  // POST /api/v1/auth/refresh - Refresh token
  router.post(
    '/auth/refresh',
    rateLimiters.global,
    authMiddleware,
    authController.refresh
  );

  // =============================================================================
  // ADMIN ROUTES
  // =============================================================================
  
  // POST /api/v1/admin/login - Admin login
  router.post(
    '/admin/login',
    rateLimiters.adminAuth,  // Dedicated admin auth limiter (10/5min)
    adminController.login
  );
  
  // GET /api/v1/admin/users - List users
  router.get(
    '/admin/users',
    rateLimiters.admin,
    adminAuthMiddleware,
    adminController.listUsers
  );

  // PUT /api/v1/admin/users/:code/activate - Activate user (must be BEFORE /:code)
  router.put(
    '/admin/users/:code/activate',
    rateLimiters.admin,
    adminAuthMiddleware,
    validators.activateUser,
    adminController.activateUser
  );

  // PUT /api/v1/admin/users/:code/suspend - Suspend user (must be BEFORE /:code)
  router.put(
    '/admin/users/:code/suspend',
    rateLimiters.admin,
    adminAuthMiddleware,
    validators.m3uProxy,
    adminController.suspendUser
  );

  // PUT /api/v1/admin/users/:code/notes - Update admin notes (must be BEFORE /:code)
  router.put(
    '/admin/users/:code/notes',
    rateLimiters.admin,
    adminAuthMiddleware,
    validators.m3uProxy,
    validators.updateNotes,
    adminController.updateNotes
  );

  // PUT /api/v1/admin/users/:code/package - Update user package (must be BEFORE /:code)
  router.put(
    '/admin/users/:code/package',
    rateLimiters.admin,
    adminAuthMiddleware,
    validators.m3uProxy,
    adminController.updateUserPackage
  );

  // PUT /api/v1/admin/users/:code/m3u - Update user M3U URL (must be BEFORE /:code)
  router.put(
    '/admin/users/:code/m3u',
    rateLimiters.admin,
    adminAuthMiddleware,
    validators.m3uProxy,
    adminController.updateUserM3U
  );

  // POST /api/v1/admin/users/:code/extend - Extend user expiry (must be BEFORE /:code)
  router.post(
    '/admin/users/:code/extend',
    rateLimiters.admin,
    adminAuthMiddleware,
    validators.m3uProxy,
    adminController.extendUserExpiry
  );

  // DELETE /api/v1/admin/users/:code - Delete user (must be BEFORE /:code)
  router.delete(
    '/admin/users/:code',
    rateLimiters.admin,
    adminAuthMiddleware,
    validators.m3uProxy,
    adminController.deleteUser
  );

  // GET /api/v1/admin/users/:code - Get user details (must be LAST)
  router.get(
    '/admin/users/:code',
    rateLimiters.admin,
    adminAuthMiddleware,
    validators.m3uProxy,
    adminController.getUser
  );

  // GET /api/v1/admin/stats - Get statistics
  router.get(
    '/admin/stats',
    rateLimiters.admin,
    adminAuthMiddleware,
    adminController.getStats
  );

  // GET /api/v1/admin/dashboard - Dashboard stats
  router.get(
    '/admin/dashboard',
    rateLimiters.admin,
    adminAuthMiddleware,
    adminController.getDashboard
  );

  // GET /api/v1/admin/profile - Current admin profile
  router.get(
    '/admin/profile',
    rateLimiters.admin,
    adminAuthMiddleware,
    adminController.getProfile
  );

  // GET /api/v1/admin/payments - List payments
  router.get(
    '/admin/payments',
    rateLimiters.admin,
    adminAuthMiddleware,
    adminController.getPayments
  );

  // POST /api/v1/admin/payments/:id/approve - Approve payment
  router.post(
    '/admin/payments/:id/approve',
    rateLimiters.admin,
    adminAuthMiddleware,
    adminController.approvePayment
  );

  // POST /api/v1/admin/payments/:id/reject - Reject payment
  router.post(
    '/admin/payments/:id/reject',
    rateLimiters.admin,
    adminAuthMiddleware,
    adminController.rejectPayment
  );

  // GET /api/v1/packages/public - Get public packages (no auth required)
  router.get(
    '/packages/public',
    rateLimiters.global,
    packageController.getPublicPackages.bind(packageController)
  );

  // GET /api/v1/admin/packages - List all packages (admin)
  router.get(
    '/admin/packages',
    rateLimiters.admin,
    adminAuthMiddleware,
    packageController.getAllPackages.bind(packageController)
  );

  // POST /api/v1/admin/packages - Create package (admin)
  router.post(
    '/admin/packages',
    rateLimiters.admin,
    adminAuthMiddleware,
    packageController.createPackage.bind(packageController)
  );

  // PUT /api/v1/admin/packages/:id - Update package (admin)
  router.put(
    '/admin/packages/:id',
    rateLimiters.admin,
    adminAuthMiddleware,
    packageController.updatePackage.bind(packageController)
  );

  // DELETE /api/v1/admin/packages/:id - Delete package (admin)
  router.delete(
    '/admin/packages/:id',
    rateLimiters.admin,
    adminAuthMiddleware,
    packageController.deletePackage.bind(packageController)
  );

  // GET /api/v1/admin/admins - List admins
  router.get(
    '/admin/admins',
    rateLimiters.admin,
    adminAuthMiddleware,
    adminController.getAdmins
  );

  // POST /api/v1/admin/admins - Create admin
  router.post(
    '/admin/admins',
    rateLimiters.admin,
    adminAuthMiddleware,
    adminController.createAdmin
  );

  // DELETE /api/v1/admin/admins/:id - Delete admin
  router.delete(
    '/admin/admins/:id',
    rateLimiters.admin,
    adminAuthMiddleware,
    adminController.deleteAdmin
  );

  // GET /api/v1/admin/analytics - Get analytics
  router.get(
    '/admin/analytics',
    rateLimiters.admin,
    adminAuthMiddleware,
    adminController.getAnalytics
  );

  // =============================================================================
  // M3U PROXY ROUTES
  // =============================================================================
  
  // GET /api/v1/m3u/:code.m3u - Real M3U proxy (requires subscription)
  router.get(
    '/m3u/:code.m3u',
    rateLimiters.playlist,
    authMiddleware,
    subscriptionCheckMiddleware,
    validators.m3uProxy,
    m3uController.proxyM3u  // Real M3U from provider
  );

  // GET /api/v1/catalog/series - Pre-parsed series catalog (auth + subscription required)
  router.get(
    '/catalog/series',
    rateLimiters.playlist,
    authMiddleware,
    subscriptionCheckMiddleware,
    m3uController.catalogSeries
  );

  // GET /api/v1/catalog/movies - Pre-parsed movies catalog (auth + subscription required)
  router.get(
    '/catalog/movies',
    rateLimiters.playlist,
    authMiddleware,
    subscriptionCheckMiddleware,
    m3uController.catalogMovies
  );

  // GET /api/v1/catalog/live - Pre-parsed live TV catalog (auth + subscription required)
  router.get(
    '/catalog/live',
    rateLimiters.playlist,
    authMiddleware,
    subscriptionCheckMiddleware,
    m3uController.catalogLive
  );

  // GET /api/v1/m3u/health - M3U proxy health check
  router.get(
    '/m3u/health',
    m3uController.healthCheck
  );

  // POST /api/v1/m3u/reset-circuit-breaker - Reset circuit breaker (admin only)
  router.post(
    '/m3u/reset-circuit-breaker',
    rateLimiters.admin,
    adminAuthMiddleware,
    m3uController.resetCircuitBreaker
  );

  // GET /api/v1/m3u/test-provider - Test M3U provider connectivity (diagnostic)
  router.get(
    '/m3u/test-provider',
    rateLimiters.admin,
    adminAuthMiddleware,
    m3uController.testProvider
  );
  
  // POST /api/v1/m3u/clear-cache - Clear M3U cache for a user (admin only)
  router.post(
    '/m3u/clear-cache',
    rateLimiters.admin,
    adminAuthMiddleware,
    m3uController.clearCache
  );
  
  // GET /api/v1/stream/:code - Proxy TS segments (CORS bypass)
  router.head(
    '/stream/:code',
    rateLimiters.media,
    m3uController.proxyStream
  );

  router.get(
    '/stream/:code',
    rateLimiters.media,
    m3uController.proxyStream
  );

  router.get(
    '/stream/:code/probe',
    rateLimiters.media,
    m3uController.probeStream
  );

  router.get(
    '/vod/:code/manifest.m3u8',
    rateLimiters.media,
    m3uController.proxyVodManifest
  );

  router.get(
    '/vod/:code/:assetName',
    rateLimiters.media,
    m3uController.proxyLatestVodAsset
  );

  router.get(
    '/vod/:code/:sessionId/:assetName',
    rateLimiters.media,
    m3uController.proxyVodAsset
  );

  // GET /api/v1/m3u/logo/:code - Proxy channel logos through same-origin HTTPS
  router.get(
    '/m3u/logo/:code',
    rateLimiters.media,
    m3uController.proxyLogo
  );
  
  // GET /api/v1/media/info - Get media codec information
  router.get('/media/info', rateLimiters.global, async (req, res) => {
    try {
      const { url } = req.query;
      if (!url) {
        return res.status(400).json({ error: 'URL parameter required' });
      }
      
      // Check if ffprobe is available
      const { exec } = require('child_process');
      const util = require('util');
      const execPromise = util.promisify(exec);
      
      const checker = process.platform === 'win32' ? 'where' : 'which';
      const fallbackPayload = {
        url,
        codecs: {
          video: 'Unknown (FFprobe not installed)',
          audio: 'Unknown (FFprobe not installed)'
        },
        browserCompatibility: {
          chrome: 'May vary',
          firefox: 'May vary',
          safari: 'May vary'
        },
        recommendations: [
          'Use VLC for best compatibility with MKV files',
          'Try different browsers (Chrome, Firefox, Edge)',
          'Check if audio codec is supported by your browser'
        ]
      };

      try {
        await execPromise(`${checker} ffprobe`);
      } catch {
        return res.json(fallbackPayload);
      }
      
      let stdout;
      try {
        ({ stdout } = await execPromise(
          `ffprobe -v quiet -print_format json -show_streams "${url}"`,
          { timeout: 30000 }
        ));
      } catch {
        return res.json(fallbackPayload);
      }
      
      const probeData = JSON.parse(stdout);
      const videoStream = probeData.streams.find(s => s.codec_type === 'video');
      const audioStream = probeData.streams.find(s => s.codec_type === 'audio');
      
      // Check browser compatibility
      const audioCodec = audioStream?.codec_name || 'unknown';
      const videoCodec = videoStream?.codec_name || 'unknown';
      
      const compatibility = {
        chrome: checkChromeCompatibility(videoCodec, audioCodec),
        firefox: checkFirefoxCompatibility(videoCodec, audioCodec),
        safari: checkSafariCompatibility(videoCodec, audioCodec)
      };
      
      res.json({
        url,
        format: probeData.format?.format_name || 'unknown',
        duration: probeData.format?.duration,
        bit_rate: probeData.format?.bit_rate,
        codecs: {
          video: videoCodec,
          audio: audioCodec,
          audioChannels: audioStream?.channels,
          audioSampleRate: audioStream?.sample_rate
        },
        browserCompatibility: compatibility,
        recommendations: generateRecommendations(audioCodec, videoCodec)
      });
      
    } catch (error) {
      res.status(500).json({ 
        error: 'Failed to analyze media',
        message: error.message 
      });
    }
  });
  
  // GET /api/v1/media/fix-audio - Get audio fix options
  router.get('/media/fix-audio', rateLimiters.global, async (req, res) => {
    const { url, title } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: 'URL parameter required' });
    }
    
    // Generate VLC stream URL
    const vlcUrl = `vlc://${url}`;
    
    // Generate alternative options
    res.json({
      originalUrl: url,
      title: title || 'Unknown',
      solutions: [
        {
          name: 'VLC Media Player',
          description: 'Best MKV and codec support',
          url: vlcUrl,
          downloadUrl: 'https://www.videolan.org/vlc/',
          icon: 'vlc'
        },
        {
          name: 'MX Player (Android)',
          description: 'Best for Android devices',
          instructions: 'Copy URL and open in MX Player'
        },
        {
          name: 'IINA (Mac)',
          description: 'Modern Mac video player',
          downloadUrl: 'https://iina.io/'
        },
        {
          name: 'PotPlayer (Windows)',
          description: 'Advanced Windows player',
          downloadUrl: 'https://potplayer.daum.net/'
        }
      ],
      browserTips: [
        'Try Chrome if audio not working in other browsers',
        'Disable hardware acceleration in browser settings',
        'Check if browser has audio permissions for the site'
      ]
    });
  });

  // =============================================================================
  // USER PROFILE ROUTES (NEW - Real Data)
  // =============================================================================
  
  // GET /api/v1/user/profile - Get user profile with stats
  router.get(
    '/user/profile',
    rateLimiters.global,
    authMiddleware,
    async (req, res) => {
      try {
        const user = req.user;
        
        // Get payments
        const { data: payments } = await userRepository.supabase
          .from('payments')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        
        // Get devices  
        const { data: devices } = await userRepository.supabase
          .from('devices')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('last_active', { ascending: false });
        
        const totalSpent = (payments || [])
          .filter(p => p.status === 'approved')
          .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

        res.json({
          status: 'success',
          data: {
            user: {
              id: user.id,
              code: user.code,
              email: user.email,
              status: user.status,
              expires_at: user.expires_at,
              created_at: user.created_at
            },
            stats: {
              total_payments: (payments || []).length,
              total_spent: totalSpent,
              active_devices: (devices || []).length
            }
          }
        });
      } catch (error) {
        logger.error('Get profile error', { error: error.message });
        res.status(500).json({ status: 'error', message: 'Failed to load profile' });
      }
    }
  );

  // GET /api/v1/user/payments - Get user payments
  router.get(
    '/user/payments',
    rateLimiters.global,
    authMiddleware,
    async (req, res) => {
      try {
        const user = req.user;
        
        const { data: payments, error } = await userRepository.supabase
          .from('payments')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;

        const totalSpent = (payments || [])
          .filter(p => p.status === 'approved')
          .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

        res.json({
          status: 'success',
          data: {
            payments: (payments || []).map(p => ({
              id: p.id,
              package_name: 'Temel Paket', // TODO: Join with packages table
              amount: p.amount,
              method: p.method,
              status: p.status,
              created_at: p.created_at
            })),
            summary: {
              total: (payments || []).length,
              completed: (payments || []).filter(p => p.status === 'approved').length,
              total_amount: totalSpent
            }
          }
        });
      } catch (error) {
        logger.error('Get payments error', { error: error.message });
        res.status(500).json({ status: 'error', message: 'Failed to load payments' });
      }
    }
  );

  // GET /api/v1/user/devices - Get user devices
  router.get(
    '/user/devices',
    rateLimiters.global,
    authMiddleware,
    async (req, res) => {
      try {
        const user = req.user;
        
        const { data: devices, error } = await userRepository.supabase
          .from('devices')
          .select('*')
          .eq('user_id', user.id)
          .order('last_active', { ascending: false });

        if (error) throw error;

        const formattedDevices = (devices || []).map((d, index) => ({
          id: d.id,
          name: d.device_name,
          type: d.device_type,
          browser: d.browser,
          os: d.os,
          location: d.location,
          ip_address: d.ip_address ? '***.***.***.***' : null,
          last_active: d.last_active,
          is_active: d.is_active,
          is_current: index === 0 // First device is current
        }));

        res.json({
          status: 'success',
          data: {
            devices: formattedDevices,
            summary: {
              total: (devices || []).length,
              active: (devices || []).filter(d => d.is_active).length,
              by_type: {
                computer: (devices || []).filter(d => d.device_type === 'computer').length,
                phone: (devices || []).filter(d => d.device_type === 'phone').length,
                tablet: (devices || []).filter(d => d.device_type === 'tablet').length,
                tv: (devices || []).filter(d => d.device_type === 'tv').length
              }
            }
          }
        });
      } catch (error) {
        logger.error('Get devices error', { error: error.message });
        res.status(500).json({ status: 'error', message: 'Failed to load devices' });
      }
    }
  );

  // DELETE /api/v1/user/devices/:id - Logout from device
  router.delete(
    '/user/devices/:id',
    rateLimiters.global,
    authMiddleware,
    async (req, res) => {
      try {
        const { id } = req.params;
        const user = req.user;
        
        const { error } = await userRepository.supabase
          .from('devices')
          .update({ is_active: false })
          .eq('id', id)
          .eq('user_id', user.id);

        if (error) throw error;

        res.json({
          status: 'success',
          message: 'Device logged out successfully'
        });
      } catch (error) {
        logger.error('Logout device error', { error: error.message });
        res.status(500).json({ status: 'error', message: 'Failed to logout device' });
      }
    }
  );

  return router;
}

// Helper functions for browser compatibility
function checkChromeCompatibility(videoCodec, audioCodec) {
  const supportedAudio = ['aac', 'mp3', 'opus', 'vorbis', 'flac'];
  const supportedVideo = ['h264', 'vp8', 'vp9', 'av1'];
  
  const audioOK = supportedAudio.includes(audioCodec.toLowerCase());
  const videoOK = supportedVideo.includes(videoCodec.toLowerCase());
  
  if (audioOK && videoOK) return 'Fully Supported';
  if (videoOK && !audioOK) return 'Video OK, Audio may have issues';
  return 'Limited Support';
}

function checkFirefoxCompatibility(videoCodec, audioCodec) {
  const supportedAudio = ['aac', 'mp3', 'opus', 'vorbis', 'flac', 'ac3'];
  const supportedVideo = ['h264', 'vp8', 'vp9', 'av1'];
  
  const audioOK = supportedAudio.includes(audioCodec.toLowerCase());
  const videoOK = supportedVideo.includes(videoCodec.toLowerCase());
  
  if (audioOK && videoOK) return 'Fully Supported';
  if (videoOK && !audioOK) return 'Video OK, Audio may have issues';
  return 'Limited Support';
}

function checkSafariCompatibility(videoCodec, audioCodec) {
  const supportedAudio = ['aac', 'mp3'];
  const supportedVideo = ['h264'];
  
  const audioOK = supportedAudio.includes(audioCodec.toLowerCase());
  const videoOK = supportedVideo.includes(videoCodec.toLowerCase());
  
  if (audioOK && videoOK) return 'Fully Supported';
  return 'Limited Support (Use alternative player)';
}

function generateRecommendations(audioCodec, videoCodec) {
  const recs = [];
  
  if (audioCodec.toLowerCase() === 'ac3' || audioCodec.toLowerCase() === 'dts') {
    recs.push('Audio codec (AC3/DTS) not supported by most browsers. Use VLC.');
  }
  if (audioCodec.toLowerCase() === 'eac3') {
    recs.push('Enhanced AC3 may have compatibility issues. Try Chrome or VLC.');
  }
  if (videoCodec.toLowerCase() === 'hevc' || videoCodec.toLowerCase() === 'h265') {
    recs.push('H265/HEVC video requires hardware support. Use VLC if stuttering.');
  }
  
  if (recs.length === 0) {
    recs.push('Should work in most modern browsers');
  }
  
  return recs;
}

module.exports = createRoutes;
