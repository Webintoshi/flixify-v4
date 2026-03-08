/**
 * User Controller
 * Handles user profile, payments, devices, and activity
 */

const asyncHandler = require('express-async-handler');

class UserController {
  constructor(userRepository, paymentRepository, deviceRepository) {
    this._userRepository = userRepository;
    this._paymentRepository = paymentRepository;
    this._deviceRepository = deviceRepository;
  }

  /**
   * Get user profile with stats
   * GET /api/v1/user/profile
   */
  getProfile = asyncHandler(async (req, res) => {
    const user = req.user;
    
    // Get device stats
    const devices = await this._deviceRepository.findByUserId(user.id);
    const deviceStats = {
      computer: devices.filter(d => d.device_type === 'computer').length,
      phone: devices.filter(d => d.device_type === 'phone').length,
      tablet: devices.filter(d => d.device_type === 'tablet').length,
      tv: devices.filter(d => d.device_type === 'tv').length,
    };

    // Get payment stats
    const payments = await this._paymentRepository.findByUserId(user.id);
    const totalSpent = payments
      .filter(p => p.status === 'approved')
      .reduce((sum, p) => sum + parseFloat(p.amount), 0);

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
          total_payments: payments.length,
          total_spent: totalSpent,
          active_devices: devices.filter(d => d.is_active).length,
          device_breakdown: deviceStats
        }
      }
    });
  });

  /**
   * Get user payments
   * GET /api/v1/user/payments
   */
  getPayments = asyncHandler(async (req, res) => {
    const user = req.user;
    const payments = await this._paymentRepository.findByUserId(user.id);

    res.json({
      status: 'success',
      data: {
        payments: payments.map(p => ({
          id: p.id,
          package_name: p.package_name || 'Temel Paket',
          amount: p.amount,
          method: p.method,
          status: p.status,
          created_at: p.created_at,
          receipt_url: p.receipt_url
        })),
        summary: {
          total: payments.length,
          completed: payments.filter(p => p.status === 'approved').length,
          total_amount: payments
            .filter(p => p.status === 'approved')
            .reduce((sum, p) => sum + parseFloat(p.amount), 0)
        }
      }
    });
  });

  /**
   * Get user devices
   * GET /api/v1/user/devices
   */
  getDevices = asyncHandler(async (req, res) => {
    const user = req.user;
    const devices = await this._deviceRepository.findByUserId(user.id);

    const formattedDevices = devices.map(d => ({
      id: d.id,
      name: d.device_name,
      type: d.device_type,
      browser: d.browser,
      os: d.os,
      location: d.location,
      ip_address: d.ip_address ? d.ip_address.toString().replace(/\.\d+$/, '.***') : null,
      last_active: d.last_active,
      is_active: d.is_active,
      is_current: false // Will be set based on session
    }));

    // Mark current device (simplified - in production use session/device fingerprint)
    if (formattedDevices.length > 0) {
      formattedDevices[0].is_current = true;
    }

    res.json({
      status: 'success',
      data: {
        devices: formattedDevices,
        summary: {
          total: devices.length,
          active: devices.filter(d => d.is_active).length,
          by_type: {
            computer: devices.filter(d => d.device_type === 'computer').length,
            phone: devices.filter(d => d.device_type === 'phone').length,
            tablet: devices.filter(d => d.device_type === 'tablet').length,
            tv: devices.filter(d => d.device_type === 'tv').length
          }
        }
      }
    });
  });

  /**
   * Get user activity logs
   * GET /api/v1/user/activity
   */
  getActivity = asyncHandler(async (req, res) => {
    const user = req.user;
    const { limit = 20 } = req.query;
    
    // Get from activity_logs via repository
    const activities = await this._userRepository.getActivityLogs(user.id, parseInt(limit));

    res.json({
      status: 'success',
      data: {
        activities: activities.map(a => ({
          id: a.id,
          action: a.action,
          entity_type: a.entity_type,
          details: a.details,
          ip_address: a.ip_address ? a.ip_address.toString().replace(/\.\d+$/, '.***') : null,
          created_at: a.created_at
        }))
      }
    });
  });

  /**
   * Register new device
   * POST /api/v1/user/devices
   */
  registerDevice = asyncHandler(async (req, res) => {
    const user = req.user;
    const { device_name, device_type, browser, os } = req.body;

    const device = await this._deviceRepository.create({
      user_id: user.id,
      device_name: device_name || 'Unknown Device',
      device_type: device_type || 'computer',
      browser: browser || 'Unknown',
      os: os || 'Unknown',
      ip_address: req.ip,
      location: 'Istanbul, Turkiye', // Could use geolocation service
      is_active: true
    });

    res.status(201).json({
      status: 'success',
      data: { device }
    });
  });

  /**
   * Logout from device
   * DELETE /api/v1/user/devices/:id
   */
  logoutDevice = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const user = req.user;

    await this._deviceRepository.deactivate(id, user.id);

    res.json({
      status: 'success',
      message: 'Device logged out successfully'
    });
  });
}

module.exports = UserController;
