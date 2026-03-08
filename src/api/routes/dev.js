/**
 * Development Routes (REMOVE IN PRODUCTION)
 * 
 * Quick test endpoints for local development
 */

const express = require('express');
const router = express.Router();
const logger = require('../../config/logger');

// Rate limit key cleanup endpoint
// Usage: GET /dev/clear-rate-limit?ip=xxx.xxx.xxx.xxx&prefix=rl:auth:
router.get('/clear-rate-limit', async (req, res) => {
  try {
    const { ip, prefix = 'rl:auth:' } = req.query;
    
    if (!ip) {
      return res.status(400).json({ 
        error: 'IP parameter required',
        usage: '/dev/clear-rate-limit?ip=xxx.xxx.xxx.xxx&prefix=rl:auth:'
      });
    }
    
    // Try to get Redis client from app locals
    const redisClient = req.app.locals.redisClient;
    
    if (!redisClient) {
      return res.json({ 
        message: 'No Redis client available. Rate limits are in-memory and will clear on restart.',
        ip,
        prefix
      });
    }
    
    // Find and delete rate limit keys for this IP
    const pattern = `${prefix}*`;
    const keys = await redisClient.keys(pattern);
    const matchingKeys = keys.filter(k => k.includes(ip));
    
    if (matchingKeys.length === 0) {
      return res.json({ 
        message: 'No rate limit keys found for this IP',
        ip,
        pattern,
        allKeys: keys.slice(0, 10) // Show first 10 keys for debugging
      });
    }
    
    // Delete matching keys
    for (const key of matchingKeys) {
      await redisClient.del(key);
      logger.info('Rate limit key cleared', { key, ip });
    }
    
    res.json({
      message: 'Rate limit keys cleared successfully',
      ip,
      clearedKeys: matchingKeys,
      remainingKeys: keys.length - matchingKeys.length
    });
  } catch (error) {
    logger.error('Clear rate limit error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Auto-create test user with real M3U
developmentRoutes = (userRepository, activateUser) => {
  
  // GET /dev/setup - Create test user with real M3U
  router.get('/setup', async (req, res) => {
    try {
      const User = require('../../domain/entities/User');
      const Code = require('../../domain/value-objects/Code');
      
      // Check if test user exists
      const existing = await userRepository.findByCode('A1B2C3D4E5F6A7B8');
      if (existing) {
        return res.json({ 
          message: 'Test user already exists', 
          code: 'A1B2C3D4E5F6A7B8',
          loginUrl: 'http://localhost:5173',
          m3uUrl: '/api/v1/m3u/A1B2C3D4E5F6A7B8.m3u'
        });
      }
      
      // Create user
      const user = User.create('Development test user');
      const savedUser = await userRepository.save(user);
      
      // Activate with real M3U
      const M3uUrl = require('../../domain/value-objects/M3uUrl');
      const activatedUser = savedUser.activate(
        M3uUrl.create('http://sifiriptvdns.com:80/playlist/ZMDNKBkEdd/TcZHZNyps2/m3u_plus'),
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        'Real M3U - Test user'
      );
      
      await userRepository.update(activatedUser);
      
      logger.info('Development test user created', { code: 'A1B2C3D4E5F6A7B8' });
      
      res.json({
        message: 'Test user created successfully!',
        code: 'A1B2C3D4E5F6A7B8',
        m3uUrl: 'http://sifiriptvdns.com:80/playlist/ZMDNKBkEdd/TcZHZNyps2/m3u_plus',
        proxyUrl: 'http://localhost:9199/api/v1/m3u/A1B2C3D4E5F6A7B8.m3u',
        loginUrl: 'http://localhost:5173',
        instructions: 'Go to http://localhost:5173 and login with code: A1B2C3D4E5F6A7B8'
      });
    } catch (error) {
      logger.error('Dev setup error', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });
  
  return router;
};

module.exports = developmentRoutes;
