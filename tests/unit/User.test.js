/**
 * User Entity Unit Tests
 */

const User = require('../../src/domain/entities/User');
const Code = require('../../src/domain/value-objects/Code');
const UserStatus = require('../../src/domain/value-objects/UserStatus');

describe('User Entity', () => {
  const validUserData = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    code: 'A7F2A9B1C4D8E6F0',
    status: 'pending',
    adminNotes: 'Test user'
  };

  describe('creation', () => {
    test('should create user with valid data', () => {
      const user = new User(validUserData);
      expect(user.code.toString()).toBe('A7F2A9B1C4D8E6F0');
      expect(user.status.toString()).toBe('pending');
    });

    test('should create with generated code', () => {
      const user = User.create();
      expect(user.code.toString()).toHaveLength(16);
      expect(user.status.toString()).toBe('pending');
    });

    test('should reconstitute from persistence', () => {
      const user = User.reconstitute(validUserData);
      expect(user.code.toString()).toBe('A7F2A9B1C4D8E6F0');
    });

    test('should allow active user without M3U URL (for data integrity)', () => {
      // Note: This was changed to handle existing database records
      // Validation now happens at application level, not entity construction
      const user = new User({
        ...validUserData,
        status: 'active'
      });
      expect(user.status.toString()).toBe('active');
      expect(user.m3uUrl).toBeNull();
    });

    test('should accept active user with M3U URL', () => {
      const user = new User({
        ...validUserData,
        status: 'active',
        m3uUrl: 'http://example.com/playlist.m3u'
      });
      expect(user.status.toString()).toBe('active');
    });
  });

  describe('activation', () => {
    test('should activate pending user', () => {
      const user = new User(validUserData);
      const activated = user.activate('http://example.com/playlist.m3u');
      
      expect(activated.status.toString()).toBe('active');
      expect(activated.m3uUrl.toString()).toBe('http://example.com/playlist.m3u');
    });

    test('should throw error when activating without M3U URL', () => {
      const user = new User(validUserData);
      expect(() => user.activate(null)).toThrow('M3U URL is required for activation');
    });

    test('should throw error when activating already active user', () => {
      const user = new User({
        ...validUserData,
        status: 'active',
        m3uUrl: 'http://example.com/playlist.m3u'
      });
      
      expect(() => user.activate('http://example.com/other.m3u')).toThrow('Cannot activate user with status');
    });

    test('should throw error for past expiration date', () => {
      const user = new User(validUserData);
      const pastDate = new Date(Date.now() - 86400000).toISOString(); // Yesterday
      
      expect(() => user.activate('http://example.com/playlist.m3u', pastDate)).toThrow('Expiration date must be in the future');
    });

    test('should set expiration date when activating', () => {
      const user = new User(validUserData);
      const futureDate = new Date(Date.now() + 86400000).toISOString(); // Tomorrow
      
      const activated = user.activate('http://example.com/playlist.m3u', futureDate);
      expect(activated.expiresAt).toBeInstanceOf(Date);
    });

    test('should create new instance (immutable)', () => {
      const user = new User(validUserData);
      const activated = user.activate('http://example.com/playlist.m3u');
      
      expect(activated).not.toBe(user);
      expect(user.status.toString()).toBe('pending');
    });
  });

  describe('suspension', () => {
    test('should suspend active user', () => {
      const user = new User({
        ...validUserData,
        status: 'active',
        m3uUrl: 'http://example.com/playlist.m3u'
      });
      
      const suspended = user.suspend('Violation');
      expect(suspended.status.toString()).toBe('suspended');
    });

    test('should add suspension reason to notes', () => {
      const user = new User({
        ...validUserData,
        status: 'active',
        m3uUrl: 'http://example.com/playlist.m3u'
      });
      
      const suspended = user.suspend('Payment overdue');
      expect(suspended.adminNotes).toContain('SUSPENDED: Payment overdue');
    });

    test('should throw error when suspending already suspended user', () => {
      const user = new User({
        ...validUserData,
        status: 'suspended'
      });
      
      expect(() => user.suspend()).toThrow('Cannot suspend user with status');
    });
  });

  describe('content access', () => {
    test('pending user cannot access content', () => {
      const user = new User(validUserData);
      const check = user.canAccessContent();
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('pending');
    });

    test('active user with M3U can access content', () => {
      const user = new User({
        ...validUserData,
        status: 'active',
        m3uUrl: 'http://example.com/playlist.m3u'
      });
      
      const check = user.canAccessContent();
      expect(check.allowed).toBe(true);
    });

    test('active user without M3U cannot access content', () => {
      // Active user can be created without M3U (data integrity)
      // but cannot access content
      const user = new User({
        ...validUserData,
        status: 'active',
        m3uUrl: null
      });
      
      const check = user.canAccessContent();
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('No M3U URL assigned');
    });

    test('expired user cannot access content', () => {
      // Expired user can exist in database (data integrity)
      // but cannot access content
      const pastDate = new Date(Date.now() - 86400000);
      const user = new User({
        ...validUserData,
        status: 'active',
        m3uUrl: 'http://example.com/playlist.m3u',
        expiresAt: pastDate.toISOString()
      });
      
      expect(user.isExpired()).toBe(true);
      
      const check = user.canAccessContent();
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('expired');
    });
  });

  describe('expiration check', () => {
    test('should detect expired subscription', () => {
      const pastDate = new Date(Date.now() - 86400000);
      const user = new User({
        ...validUserData,
        expiresAt: pastDate.toISOString()
      });
      
      expect(user.isExpired()).toBe(true);
    });

    test('should not detect non-expired subscription', () => {
      const futureDate = new Date(Date.now() + 86400000);
      const user = new User({
        ...validUserData,
        expiresAt: futureDate.toISOString()
      });
      
      expect(user.isExpired()).toBe(false);
    });

    test('should not be expired without expiration date', () => {
      const user = new User(validUserData);
      expect(user.isExpired()).toBe(false);
    });
  });

  describe('proxy URL generation', () => {
    test('should generate proxy URL for active user', () => {
      const user = new User({
        ...validUserData,
        status: 'active',
        m3uUrl: 'http://example.com/playlist.m3u'
      });
      
      const proxyUrl = user.getProxyUrl('http://localhost:3000');
      expect(proxyUrl).toBe('http://localhost:3000/proxy/A7F2A9B1C4D8E6F0.m3u');
    });

    test('should throw error for inactive user', () => {
      const user = new User(validUserData);
      expect(() => user.getProxyUrl('http://localhost:3000')).toThrow('User status is pending');
    });
  });
});
