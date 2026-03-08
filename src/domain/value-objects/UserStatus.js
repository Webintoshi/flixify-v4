/**
 * UserStatus Value Object
 * 
 * Enumeration of possible user states in the system.
 * State Machine:
 *   PENDING → ACTIVE → SUSPENDED
 *              ↓        ↓
 *            EXPIRED  (permanent)
 * 
 * Business Rules:
 * - PENDING: User registered but not yet activated by admin
 * - ACTIVE: User has access to M3U content
 * - SUSPENDED: Access revoked by admin (can be reactivated)
 * - EXPIRED: Subscription period ended (requires renewal)
 */

class UserStatus {
  static PENDING = new UserStatus('pending');
  static ACTIVE = new UserStatus('active');
  static SUSPENDED = new UserStatus('suspended');
  static EXPIRED = new UserStatus('expired');

  static VALUES = [UserStatus.PENDING, UserStatus.ACTIVE, UserStatus.SUSPENDED, UserStatus.EXPIRED];

  constructor(value) {
    this._value = value;
    Object.freeze(this);
  }

  static fromString(value) {
    const normalized = value?.toLowerCase().trim();
    const status = UserStatus.VALUES.find(s => s._value === normalized);
    
    if (!status) {
      throw new Error(`Invalid user status: ${value}. Allowed: ${UserStatus.VALUES.map(s => s._value).join(', ')}`);
    }
    
    return status;
  }

  /**
   * Check if user has active access to content
   */
  get canAccessContent() {
    return this._value === 'active';
  }

  /**
   * Check if status allows transition to ACTIVE
   */
  get canActivate() {
    return this._value === 'pending' || this._value === 'suspended';
  }

  /**
   * Check if status allows transition to SUSPENDED
   */
  get canSuspend() {
    return this._value === 'active' || this._value === 'pending';
  }

  equals(other) {
    if (!(other instanceof UserStatus)) return false;
    return this._value === other._value;
  }

  toString() {
    return this._value;
  }

  toJSON() {
    return this._value;
  }

  get value() {
    return this._value;
  }
}

module.exports = UserStatus;
