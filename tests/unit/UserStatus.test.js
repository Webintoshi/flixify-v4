/**
 * UserStatus Value Object Unit Tests
 */

const UserStatus = require('../../src/domain/value-objects/UserStatus');

describe('UserStatus Value Object', () => {
  describe('creation', () => {
    test('should create pending status', () => {
      const status = UserStatus.fromString('pending');
      expect(status.toString()).toBe('pending');
    });

    test('should create active status', () => {
      const status = UserStatus.fromString('active');
      expect(status.toString()).toBe('active');
    });

    test('should create suspended status', () => {
      const status = UserStatus.fromString('suspended');
      expect(status.toString()).toBe('suspended');
    });

    test('should create expired status', () => {
      const status = UserStatus.fromString('expired');
      expect(status.toString()).toBe('expired');
    });

    test('should handle uppercase input', () => {
      const status = UserStatus.fromString('ACTIVE');
      expect(status.toString()).toBe('active');
    });

    test('should handle mixed case input', () => {
      const status = UserStatus.fromString('Pending');
      expect(status.toString()).toBe('pending');
    });

    test('should throw error for invalid status', () => {
      expect(() => UserStatus.fromString('invalid')).toThrow('Invalid user status');
    });

    test('should throw error for empty string', () => {
      expect(() => UserStatus.fromString('')).toThrow('Invalid user status');
    });

    test('should throw error for null', () => {
      expect(() => UserStatus.fromString(null)).toThrow('Invalid user status');
    });
  });

  describe('content access', () => {
    test('pending should not have content access', () => {
      expect(UserStatus.PENDING.canAccessContent).toBe(false);
    });

    test('active should have content access', () => {
      expect(UserStatus.ACTIVE.canAccessContent).toBe(true);
    });

    test('suspended should not have content access', () => {
      expect(UserStatus.SUSPENDED.canAccessContent).toBe(false);
    });

    test('expired should not have content access', () => {
      expect(UserStatus.EXPIRED.canAccessContent).toBe(false);
    });
  });

  describe('transitions', () => {
    test('pending can be activated', () => {
      expect(UserStatus.PENDING.canActivate).toBe(true);
    });

    test('suspended can be activated', () => {
      expect(UserStatus.SUSPENDED.canActivate).toBe(true);
    });

    test('active cannot be activated', () => {
      expect(UserStatus.ACTIVE.canActivate).toBe(false);
    });

    test('expired cannot be activated', () => {
      expect(UserStatus.EXPIRED.canActivate).toBe(false);
    });

    test('active can be suspended', () => {
      expect(UserStatus.ACTIVE.canSuspend).toBe(true);
    });

    test('pending can be suspended', () => {
      expect(UserStatus.PENDING.canSuspend).toBe(true);
    });

    test('suspended cannot be suspended', () => {
      expect(UserStatus.SUSPENDED.canSuspend).toBe(false);
    });
  });

  describe('equality', () => {
    test('same status should be equal', () => {
      expect(UserStatus.PENDING.equals(UserStatus.PENDING)).toBe(true);
    });

    test('different statuses should not be equal', () => {
      expect(UserStatus.PENDING.equals(UserStatus.ACTIVE)).toBe(false);
    });

    test('same status from string should be equal', () => {
      const status1 = UserStatus.fromString('pending');
      const status2 = UserStatus.fromString('pending');
      expect(status1.equals(status2)).toBe(true);
    });

    test('should not be equal to non-UserStatus', () => {
      expect(UserStatus.ACTIVE.equals('active')).toBe(false);
    });
  });

  describe('immutability', () => {
    test('should be frozen', () => {
      expect(Object.isFrozen(UserStatus.ACTIVE)).toBe(true);
    });
  });
});
