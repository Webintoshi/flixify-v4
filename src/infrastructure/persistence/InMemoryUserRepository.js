/**
 * In-Memory User Repository (Development/Mock Mode)
 * 
 * Used for local development without Supabase connection.
 * Data is NOT persisted - all data lost on server restart.
 */

const UserRepository = require('../../application/ports/UserRepository');
const User = require('../../domain/entities/User');
const Code = require('../../domain/value-objects/Code');
const logger = require('../../config/logger');

class InMemoryUserRepository extends UserRepository {
  constructor() {
    super();
    this._users = new Map();
    this._initializeMockData();
  }

  _initializeMockData() {
    // Add test users
    const testUsers = [
      { code: 'A7F2A9B1C4D8E6F0', status: 'active', m3uUrl: 'http://example.com/test.m3u', adminNotes: 'Test active user' },
      { code: 'B8C3D4E5F6A7B8C9', status: 'pending', adminNotes: 'Test pending user' },
    ];

    testUsers.forEach(data => {
      const user = User.reconstitute({
        id: require('crypto').randomUUID(),
        ...data,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      this._users.set(user.code.toString(), user);
    });

    logger.info('Mock repository initialized with test data');
  }

  async findById(id) {
    for (const user of this._users.values()) {
      if (user.id === id) return user;
    }
    return null;
  }

  async findByCode(code) {
    const codeStr = code.toString ? code.toString() : code;
    return this._users.get(codeStr) || null;
  }

  async findAll({ limit = 50, offset = 0, status = null } = {}) {
    let users = Array.from(this._users.values());
    
    if (status) {
      users = users.filter(u => u.status.toString() === status);
    }

    const total = users.length;
    const paginated = users.slice(offset, offset + limit);

    return { users: paginated, total };
  }

  async findByStatus(status) {
    const statusStr = status.toString ? status.toString() : status;
    return Array.from(this._users.values()).filter(u => u.status.toString() === statusStr);
  }

  async findExpired() {
    const now = new Date();
    return Array.from(this._users.values()).filter(u => {
      return u.status.toString() === 'active' && u.expiresAt && u.expiresAt < now;
    });
  }

  async save(user) {
    const codeStr = user.code.toString();
    if (this._users.has(codeStr)) {
      throw new Error(`User with code ${codeStr} already exists`);
    }
    this._users.set(codeStr, user);
    logger.info('Mock: User saved', { code: codeStr });
    return user;
  }

  async update(user) {
    if (!user.id) throw new Error('Cannot update user without ID');
    const codeStr = user.code.toString();
    this._users.set(codeStr, user);
    logger.info('Mock: User updated', { code: codeStr });
    return user;
  }

  async delete(id) {
    for (const [code, user] of this._users.entries()) {
      if (user.id === id) {
        this._users.delete(code);
        return;
      }
    }
  }

  async existsByCode(code) {
    const codeStr = code.toString ? code.toString() : code;
    return this._users.has(codeStr);
  }

  async countByStatus() {
    const counts = { pending: 0, active: 0, suspended: 0, expired: 0, total: 0 };
    for (const user of this._users.values()) {
      const status = user.status.toString();
      if (counts[status] !== undefined) counts[status]++;
      counts.total++;
    }
    return counts;
  }
}

module.exports = InMemoryUserRepository;
