/**
 * Admin Controller
 * 
 * Administrative endpoints for user management:
 * - GET /admin/users - List all users
 * - GET /admin/users/:code - Get user details
 * - PUT /admin/users/:code/activate - Activate user with M3U
 * - PUT /admin/users/:code/suspend - Suspend user
 * - PUT /admin/users/:code/notes - Update admin notes
 * - DELETE /admin/users/:code - Delete user
 * - GET /admin/stats - User statistics
 * 
 * All operations require admin authentication.
 */

const logger = require('../../config/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const Code = require('../../domain/value-objects/Code');

class AdminController {
  constructor(userRepository, activateUser, cacheService, adminRepository) {
    this._userRepository = userRepository;
    this._activateUser = activateUser;
    this._cacheService = cacheService;
    this._adminRepository = adminRepository;
  }

  /**
   * POST /admin/login
   * Admin login with email and password
   */
  login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress || 'unknown';

    logger.debug('Admin login attempt', { 
      email: email?.toLowerCase(),
      ip: clientIp,
      path: req.path,
      method: req.method
    });

    if (!email || !password) {
      logger.warn('Admin login missing credentials', { email: !!email, password: !!password });
      return res.status(400).json({
        status: 'error',
        message: 'Email and password are required'
      });
    }

    // Find admin by email
    const admin = await this._adminRepository.findByEmail(email);

    if (!admin) {
      logger.warn('Admin login failed - email not found', { 
        email: email?.toLowerCase(),
        ip: clientIp
      });
      return res.status(401).json({
        status: 'error',
        message: 'Invalid credentials'
      });
    }

    // Verify password (bcrypt compare)
    const bcrypt = require('bcryptjs');
    const isValidPassword = await bcrypt.compare(password, admin.password_hash);

    if (!isValidPassword) {
      logger.warn('Admin login failed - invalid password', { 
        email: email?.toLowerCase(),
        adminId: admin.id,
        ip: clientIp
      });
      return res.status(401).json({
        status: 'error',
        message: 'Invalid credentials'
      });
    }

    logger.info('Admin login successful', { 
      email: admin.email,
      adminId: admin.id,
      ip: clientIp
    });

    // Update last login
    await this._adminRepository.updateLastLogin(admin.id);

    // Generate JWT token
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { 
        adminId: admin.id,
        email: admin.email,
        role: admin.role
      },
      process.env.JWT_SECRET || 'dev-jwt-secret-key-for-local-testing-only-change-in-production',
      { expiresIn: '24h' }
    );

    logger.info('Admin logged in', { email: admin.email });

    res.json({
      status: 'success',
      data: {
        token,
        admin: {
          id: admin.id,
          name: admin.name,
          email: admin.email,
          role: admin.role
        }
      }
    });
  });

  /**
   * GET /admin/users
   * List all users with pagination and filtering
   */
  listUsers = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const status = req.query.status || null;
    const offset = (page - 1) * limit;

    const result = await this._userRepository.findAll({ limit, offset, status });

    res.json({
      status: 'success',
      data: {
        users: result.users.map(u => u.toJSON()),
        pagination: {
          page,
          limit,
          total: result.total,
          pages: Math.ceil(result.total / limit)
        }
      }
    });
  });

  /**
   * GET /admin/users/:code
   * Get specific user details with associated data counts
   */
  getUser = asyncHandler(async (req, res) => {
    const { code } = req.params;
    const codeVo = Code.create(code);

    const user = await this._userRepository.findByCode(codeVo);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    const userData = user.toJSON();
    
    // Include M3U URL for admin view
    if (user.m3uUrl) {
      userData.m3uUrl = user.m3uUrl.toLogString(); // Masked for security
    }

    // Add computed fields
    userData.canAccessContent = user.canAccessContent();
    userData.isExpired = user.isExpired();

    // Get associated data counts for delete confirmation
    try {
      const userStats = await this._adminRepository.getUserStats(user.id);
      userData.stats = userStats;
    } catch (error) {
      logger.warn('Failed to get user stats', { userId: user.id, error: error.message });
      userData.stats = { payments: 0, devices: 0 };
    }

    res.json({
      status: 'success',
      data: userData
    });
  });

  /**
   * PUT /admin/users/:code/activate
   * Activate user with M3U URL
   */
  activateUser = asyncHandler(async (req, res) => {
    const { code } = req.params;
    const { m3uUrl, expiresAt, adminNotes } = req.body;

    const activatedUser = await this._activateUser.execute({
      code,
      m3uUrl,
      expiresAt,
      adminNotes
    });

    res.json({
      status: 'success',
      data: activatedUser.toJSON(),
      message: 'User activated successfully'
    });
  });

  /**
   * PUT /admin/users/:code/suspend
   * Suspend user access
   */
  suspendUser = asyncHandler(async (req, res) => {
    const { code } = req.params;
    const { reason } = req.body;

    const codeVo = Code.create(code);
    const user = await this._userRepository.findByCode(codeVo);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    const suspendedUser = user.suspend(reason);
    const savedUser = await this._userRepository.update(suspendedUser);

    // Invalidate cache
    await this._cacheService.invalidateUser(code);

    logger.info('User suspended by admin', { 
      adminCode: req.user?.code?.substring(0, 4) + '****',
      targetCode: codeVo.toMaskedString(),
      reason
    });

    res.json({
      status: 'success',
      data: savedUser.toJSON(),
      message: 'User suspended successfully'
    });
  });

  /**
   * PUT /admin/users/:code/notes
   * Update admin notes
   */
  updateNotes = asyncHandler(async (req, res) => {
    const { code } = req.params;
    const { adminNotes } = req.body;

    const codeVo = Code.create(code);
    const user = await this._userRepository.findByCode(codeVo);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Reconstruct user with new notes
    const User = require('../../domain/entities/User');
    const updatedUser = new User({
      ...user.toPersistence(),
      admin_notes: adminNotes,
      updated_at: new Date()
    });

    const savedUser = await this._userRepository.update(updatedUser);

    // Invalidate cache
    await this._cacheService.invalidateUser(code);

    res.json({
      status: 'success',
      data: savedUser.toJSON(),
      message: 'Admin notes updated'
    });
  });

  /**
   * DELETE /admin/users/:code
   * Delete user permanently
   */
  deleteUser = asyncHandler(async (req, res) => {
    const { code } = req.params;

    const codeVo = Code.create(code);
    const user = await this._userRepository.findByCode(codeVo);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    await this._userRepository.delete(user.id);

    // Invalidate cache
    await this._cacheService.invalidateUser(code);

    logger.info('User deleted by admin', { 
      adminCode: req.user?.code?.substring(0, 4) + '****',
      targetCode: codeVo.toMaskedString()
    });

    res.json({
      status: 'success',
      message: 'User deleted successfully'
    });
  });

  /**
   * PUT /admin/users/:code/package
   * Update user package
   */
  updateUserPackage = asyncHandler(async (req, res) => {
    const { code } = req.params;
    const { packageId, expiryDate } = req.body;

    const codeVo = Code.create(code);
    const user = await this._userRepository.findByCode(codeVo);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Update user package and expiry
    const updateData = {
      package: packageId,
      expiresAt: expiryDate ? new Date(expiryDate) : null
    };

    await this._userRepository.update(user.id, updateData);

    // Invalidate cache
    await this._cacheService.invalidateUser(code);

    logger.info('User package updated by admin', { 
      adminCode: req.user?.code?.substring(0, 4) + '****',
      targetCode: codeVo.toMaskedString(),
      package: packageId
    });

    res.json({
      status: 'success',
      message: 'User package updated successfully'
    });
  });

  /**
   * PUT /admin/users/:code/m3u
   * Update user M3U URL
   */
  updateUserM3U = asyncHandler(async (req, res) => {
    const { code } = req.params;
    const { m3uUrl } = req.body;

    const codeVo = Code.create(code);
    const user = await this._userRepository.findByCode(codeVo);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Update user M3U URL
    await this._userRepository.updateById(user.id, { m3u_url: m3uUrl });

    // Invalidate cache
    await this._cacheService.invalidateUser(code);

    logger.info('User M3U updated by admin', { 
      adminCode: req.user?.code?.substring(0, 4) + '****',
      targetCode: codeVo.toMaskedString()
    });

    res.json({
      status: 'success',
      message: 'User M3U URL updated successfully'
    });
  });

  /**
   * POST /admin/users/:code/extend
   * Extend user expiry date
   */
  extendUserExpiry = asyncHandler(async (req, res) => {
    const { code } = req.params;
    const { days } = req.body;

    const codeVo = Code.create(code);
    const user = await this._userRepository.findByCode(codeVo);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Calculate new expiry date
    const currentExpiry = user.expiresAt ? new Date(user.expiresAt) : new Date();
    const newExpiry = new Date(currentExpiry);
    newExpiry.setDate(newExpiry.getDate() + parseInt(days));

    await this._userRepository.updateById(user.id, { 
      expires_at: newExpiry.toISOString(),
      status: 'active'
    });

    // Invalidate cache
    await this._cacheService.invalidateUser(code);

    logger.info('User expiry extended by admin', { 
      adminCode: req.user?.code?.substring(0, 4) + '****',
      targetCode: codeVo.toMaskedString(),
      days: days,
      newExpiry: newExpiry.toISOString()
    });

    res.json({
      status: 'success',
      message: `User expiry extended by ${days} days`,
      data: { newExpiry: newExpiry.toISOString() }
    });
  });

  /**
   * GET /admin/stats
   * User statistics
   */
  getStats = asyncHandler(async (req, res) => {
    const counts = await this._userRepository.countByStatus();

    // Get recently expired users
    const expiredUsers = await this._userRepository.findExpired();

    res.json({
      status: 'success',
      data: {
        counts,
        recentlyExpired: expiredUsers.length,
        timestamp: new Date().toISOString()
      }
    });
  });

  /**
   * GET /admin/dashboard
   * Dashboard statistics
   */
  getDashboard = asyncHandler(async (req, res) => {
    const userCounts = await this._userRepository.countByStatus();
    const expiredUsers = await this._userRepository.findExpired();
    
    // Get recent users (last 7 days)
    const recentUsers = await this._userRepository.findRecent(7);

    res.json({
      status: 'success',
      data: {
        stats: {
          totalUsers: userCounts.total,
          activeUsers: userCounts.active,
          pendingUsers: userCounts.pending,
          suspendedUsers: userCounts.suspended,
          expiredUsers: expiredUsers.length,
          recentSignups: recentUsers.length
        },
        recentUsers: recentUsers.map(u => ({
          code: u.code.toString(),
          status: u.status.toString(),
          createdAt: u.createdAt
        })),
        timestamp: new Date().toISOString()
      }
    });
  });

  /**
   * GET /admin/profile
   * Get current admin profile
   */
  getProfile = asyncHandler(async (req, res) => {
    const admin = await this._adminRepository.findById(req.user.adminId);
    
    if (!admin) {
      return res.status(404).json({
        status: 'error',
        message: 'Admin not found'
      });
    }

    res.json({
      status: 'success',
      data: {
        admin: {
          id: admin.id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
          lastLogin: admin.last_login
        }
      }
    });
  });

  /**
   * GET /admin/payments
   * List all payments
   */
  getPayments = asyncHandler(async (req, res) => {
    const { data: payments, error } = await this._adminRepository.getPayments();
    
    if (error) throw error;

    res.json({
      status: 'success',
      data: { payments }
    });
  });

  /**
   * POST /admin/payments/:id/approve
   * Approve a payment
   */
  approvePayment = asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const result = await this._adminRepository.approvePayment(id, req.user.adminId);
    
    logger.info('Payment approved', { paymentId: id, adminId: req.user.adminId });

    res.json({
      status: 'success',
      message: 'Payment approved successfully',
      data: result
    });
  });

  /**
   * POST /admin/payments/:id/reject
   * Reject a payment
   */
  rejectPayment = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    
    const result = await this._adminRepository.rejectPayment(id, req.user.adminId, reason);
    
    logger.info('Payment rejected', { paymentId: id, adminId: req.user.adminId, reason });

    res.json({
      status: 'success',
      message: 'Payment rejected',
      data: result
    });
  });

  /**
   * GET /admin/packages
   * List all packages - STATIK (Database bypass)
   */
  getPackages = asyncHandler(async (req, res) => {
    // Veritabanından almak yerine statik paketler
    const packages = [
      {
        id: '33d43b01-397f-4656-846f-d08da9c96cdf',
        name: '1 Aylık Paket',
        description: '30 gün erişim - Temel paket',
        price: 199.00,
        duration: 1,
        duration_days: 30,
        features: ['30 gün erişim', 'HD Kalite', '7/24 Destek'],
        badge: null,
        isPopular: false,
        isActive: true,
        sort_order: 1,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      },
      {
        id: 'b41ecdb8-9618-4f65-901a-862e987c3063',
        name: '3 Aylık Paket',
        description: '90 gün erişim - %5 İndirimli',
        price: 485.00,
        duration: 3,
        duration_days: 90,
        features: ['90 gün erişim', 'HD Kalite', '7/24 Destek', '%5 İndirim'],
        badge: '%5 İndirim',
        isPopular: false,
        isActive: true,
        sort_order: 2,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      },
      {
        id: '1aa84dca-7a5a-4af7-946d-3ca1ffa0e8b9',
        name: '6 Aylık Paket',
        description: '180 gün erişim - %10 İndirimli - Popüler',
        price: 820.00,
        duration: 6,
        duration_days: 180,
        features: ['180 gün erişim', 'HD Kalite', '7/24 Destek', '%10 İndirim', 'Popüler'],
        badge: 'Popüler',
        isPopular: true,
        isActive: true,
        sort_order: 3,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      },
      {
        id: '623816cc-acab-43c8-a0b5-f1cdfa686def',
        name: '12 Aylık Paket',
        description: '365 gün erişim - %20 İndirimli - En İyi Fiyat',
        price: 1490.00,
        duration: 12,
        duration_days: 365,
        features: ['365 gün erişim', 'HD Kalite', '7/24 Destek', '%20 İndirim', 'En İyi Fiyat'],
        badge: 'En İyi Fiyat',
        isPopular: false,
        isActive: true,
        sort_order: 4,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      }
    ];

    res.json({
      status: 'success',
      data: { packages }
    });
  });

  /**
   * POST /admin/packages
   * Create new package
   */
  createPackage = asyncHandler(async (req, res) => {
    const packageData = req.body;
    
    const result = await this._adminRepository.createPackage(packageData);
    
    logger.info('Package created', { packageId: result.id, name: packageData.name });

    res.status(201).json({
      status: 'success',
      message: 'Package created successfully',
      data: result
    });
  });

  /**
   * PUT /admin/packages/:id
   * Update package
   */
  updatePackage = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const packageData = req.body;
    
    const result = await this._adminRepository.updatePackage(id, packageData);
    
    logger.info('Package updated', { packageId: id });

    res.json({
      status: 'success',
      message: 'Package updated successfully',
      data: result
    });
  });

  /**
   * DELETE /admin/packages/:id
   * Delete package
   */
  deletePackage = asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    await this._adminRepository.deletePackage(id);
    
    logger.info('Package deleted', { packageId: id });

    res.json({
      status: 'success',
      message: 'Package deleted successfully'
    });
  });

  /**
   * GET /admin/admins
   * List all admins
   */
  getAdmins = asyncHandler(async (req, res) => {
    const { data: admins, error } = await this._adminRepository.getAdmins();
    
    if (error) throw error;

    // Don't expose password hashes
    const safeAdmins = admins.map(a => ({
      id: a.id,
      name: a.name,
      email: a.email,
      role: a.role,
      lastLogin: a.last_login,
      createdAt: a.created_at
    }));

    res.json({
      status: 'success',
      data: { admins: safeAdmins }
    });
  });

  /**
   * POST /admin/admins
   * Create new admin
   */
  createAdmin = asyncHandler(async (req, res) => {
    const adminData = req.body;
    
    // Hash password
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(adminData.password, 10);
    
    const result = await this._adminRepository.createAdmin({
      ...adminData,
      password: hashedPassword
    });
    
    logger.info('Admin created', { adminId: result.id, email: adminData.email });

    res.status(201).json({
      status: 'success',
      message: 'Admin created successfully',
      data: {
        id: result.id,
        name: result.name,
        email: result.email,
        role: result.role
      }
    });
  });

  /**
   * DELETE /admin/admins/:id
   * Delete admin
   */
  deleteAdmin = asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Prevent deleting yourself
    if (id === req.user.adminId) {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot delete your own account'
      });
    }
    
    await this._adminRepository.deleteAdmin(id);
    
    logger.info('Admin deleted', { adminId: id, deletedBy: req.user.adminId });

    res.json({
      status: 'success',
      message: 'Admin deleted successfully'
    });
  });

  /**
   * GET /admin/analytics
   * Get analytics data for admin dashboard
   */
  getAnalytics = asyncHandler(async (req, res) => {
    const userCounts = await this._userRepository.countByStatus();
    const expiredUsers = await this._userRepository.findExpired();
    
    // Get payments data
    const { data: payments } = await this._adminRepository.getPayments();
    const approvedPayments = (payments || []).filter(p => p.status === 'approved');
    const pendingPayments = (payments || []).filter(p => p.status === 'pending');
    
    // Calculate revenue
    const totalRevenue = approvedPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    
    // Get daily revenue for last 7 days
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d.toISOString().split('T')[0];
    });
    
    const dailyRevenue = last7Days.map(date => {
      const dayPayments = approvedPayments.filter(p => p.created_at && p.created_at.startsWith(date));
      return dayPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    });
    
    // Get packages data
    const { data: packages } = await this._adminRepository.getPackages();
    
    // Calculate package distribution (mock - would need user-package relation)
    const packageDistribution = (packages || []).slice(0, 4).map((pkg, index) => ({
      name: pkg.name || `Paket ${index + 1}`,
      count: Math.floor(userCounts.total * (0.4 - index * 0.1)) || 0,
      percentage: Math.floor((0.4 - index * 0.1) * 100) || 0
    }));
    
    // Payment methods breakdown
    const methods = {};
    approvedPayments.forEach(p => {
      const method = p.method || 'Unknown';
      if (!methods[method]) methods[method] = { name: method, amount: 0, count: 0 };
      methods[method].amount += parseFloat(p.amount || 0);
      methods[method].count++;
    });
    
    // Top users by spending
    const userSpending = {};
    approvedPayments.forEach(p => {
      if (!userSpending[p.user_id]) {
        userSpending[p.user_id] = { totalSpent: 0, payments: 0 };
      }
      userSpending[p.user_id].totalSpent += parseFloat(p.amount || 0);
      userSpending[p.user_id].payments++;
    });
    
    const topUsers = Object.entries(userSpending)
      .sort((a, b) => b[1].totalSpent - a[1].totalSpent)
      .slice(0, 5)
      .map(([userId, data]) => ({
        code: '****' + userId.slice(-4),
        totalSpent: data.totalSpent,
        payments: data.payments
      }));

    res.json({
      status: 'success',
      data: {
        revenue: {
          total: Math.floor(totalRevenue),
          change: 0,
          daily: dailyRevenue
        },
        users: {
          total: userCounts.total,
          active: userCounts.active,
          new: userCounts.total - (userCounts.active + userCounts.suspended + userCounts.pending),
          growth: 0
        },
        payments: {
          total: approvedPayments.length,
          pending: pendingPayments.length,
          methods: Object.values(methods).slice(0, 3)
        },
        packages: {
          distribution: packageDistribution
        },
        topUsers: topUsers
      }
    });
  });
}

module.exports = AdminController;
