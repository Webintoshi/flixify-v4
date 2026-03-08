/**
 * Demo M3U Controller
 * 
 * Test için sahte M3U verisi sağlar
 * Gerçek provider çalışmadığında kullanılır
 */

const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../../config/logger');

// Demo kanallar - gerçek logolar (data URI ile yerel)
const DEMO_CHANNELS = [
  { name: 'TRT 1', logo: '', group: 'Ulusal' },
  { name: 'ATV', logo: '', group: 'Ulusal' },
  { name: 'Show TV', logo: '', group: 'Ulusal' },
  { name: 'Star TV', logo: '', group: 'Ulusal' },
  { name: 'Kanal D', logo: '', group: 'Ulusal' },
  { name: 'Fox TV', logo: '', group: 'Ulusal' },
  { name: 'TV8', logo: '', group: 'Ulusal' },
  { name: 'Beyaz TV', logo: '', group: 'Ulusal' },
  { name: 'A Spor', logo: '', group: 'Spor' },
  { name: 'TRT Spor', logo: '', group: 'Spor' },
];

class DemoM3uController {
  /**
   * GET /m3u/:code.m3u - Demo M3U playlist
   */
  getDemoM3u = asyncHandler(async (req, res) => {
    const { code } = req.params;
    
    logger.info('Demo M3U served', { code });

    // Generate M3U content with demo streams (Big Buck Bunny - public domain)
    let m3uContent = '#EXTM3U\n';
    
    DEMO_CHANNELS.forEach((channel, index) => {
      m3uContent += `#EXTINF:-1 tvg-id="${index}" tvg-name="${channel.name}" tvg-logo="${channel.logo}" group-title="${channel.group}",${channel.name}\n`;
      // Use a public test stream (Big Buck Bunny)
      m3uContent += `http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4\n`;
    });

    res.set({
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Cache-Control': 'private, max-age=60'
    });

    res.send(m3uContent);
  });

  /**
   * Health check for demo endpoint
   */
  healthCheck = asyncHandler(async (req, res) => {
    res.json({
      status: 'success',
      mode: 'demo',
      channels: DEMO_CHANNELS.length
    });
  });
}

module.exports = DemoM3uController;
