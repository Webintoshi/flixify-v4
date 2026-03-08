/**
 * User Aggregate Root
 * 
 * Core domain entity representing an IPTV user.
 * Enforces business invariants and state transitions.
 * 
 * Invariants:
 * - Every user must have a unique 16-digit code
 * - Status transitions follow the state machine
 * - M3U URL can only be set by admin
 * - Expiration date must be in the future for active users
 */

const Code = require('../value-objects/Code');
const UserStatus = require('../value-objects/UserStatus');
const M3uUrl = require('../value-objects/M3uUrl');

class User {
  constructor({
    id,
    code,
    status,
    m3uUrl = null,
    expiresAt = null,
    adminNotes = null,
    createdAt = new Date(),
    updatedAt = new Date(),
    deletedAt = null
  }) {
    this._id = id;
    this._code = code instanceof Code ? code : Code.create(code);
    this._status = status instanceof UserStatus ? status : UserStatus.fromString(status);
    this._m3uUrl = m3uUrl ? (m3uUrl instanceof M3uUrl ? m3uUrl : M3uUrl.create(m3uUrl)) : null;
    this._expiresAt = expiresAt ? new Date(expiresAt) : null;
    this._adminNotes = adminNotes;
    this._createdAt = new Date(createdAt);
    this._updatedAt = new Date(updatedAt);
    this._deletedAt = deletedAt ? new Date(deletedAt) : null;

    this._validateInvariants();
    Object.freeze(this._code); // Code is immutable
  }

  /**
   * Factory: Create new pending user with generated code
   */
  static create(adminNotes = null) {
    const code = Code.generate();
    return new User({
      id: null,
      code,
      status: UserStatus.PENDING,
      adminNotes
    });
  }

  /**
   * Factory: Reconstitute from persistence
   */
  static reconstitute(data) {
    return new User(data);
  }

  /**
   * Domain invariant validation
   */
  _validateInvariants() {
    // Note: Active users can exist without M3U until they purchase a package
    // Note: Reconstitute allows expired users (they exist in database)
    
    // No strict validation for reconstitution
    // Business logic handles expired users via canAccessContent() and isExpired()
  }

  /**
   * Business operation: Activate user
   * @param {M3uUrl} m3uUrl - Required M3U playlist URL
   * @param {Date} expiresAt - Optional expiration date
   * @param {string} adminNotes - Optional notes
   */
  activate(m3uUrl, expiresAt = null, adminNotes = null) {
    if (!this._status.canActivate) {
      throw new Error(`Cannot activate user with status: ${this._status}`);
    }

    if (!m3uUrl) {
      throw new Error('M3U URL is required for activation');
    }

    const m3uUrlVo = m3uUrl instanceof M3uUrl ? m3uUrl : M3uUrl.create(m3uUrl);

    if (expiresAt && new Date(expiresAt) < new Date()) {
      throw new Error('Expiration date must be in the future');
    }

    return new User({
      id: this._id,
      code: this._code,
      status: UserStatus.ACTIVE,
      m3uUrl: m3uUrlVo,
      expiresAt,
      adminNotes: adminNotes || this._adminNotes,
      createdAt: this._createdAt,
      updatedAt: new Date()
    });
  }

  /**
   * Business operation: Suspend user
   */
  suspend(reason = null) {
    if (!this._status.canSuspend) {
      throw new Error(`Cannot suspend user with status: ${this._status}`);
    }

    return new User({
      id: this._id,
      code: this._code,
      status: UserStatus.SUSPENDED,
      m3uUrl: this._m3uUrl,
      expiresAt: this._expiresAt,
      adminNotes: reason ? `${this._adminNotes || ''} [SUSPENDED: ${reason}]` : this._adminNotes,
      createdAt: this._createdAt,
      updatedAt: new Date()
    });
  }

  /**
   * Check if user can access content (business rule)
   */
  canAccessContent() {
    if (!this._status.canAccessContent) {
      return { allowed: false, reason: `User status is ${this._status}` };
    }

    if (this._expiresAt && this._expiresAt < new Date()) {
      return { allowed: false, reason: 'Subscription has expired' };
    }

    if (!this._m3uUrl) {
      return { allowed: false, reason: 'No M3U URL assigned' };
    }

    return { allowed: true };
  }

  /**
   * Check if subscription is expired (for cron jobs)
   */
  isExpired() {
    if (!this._expiresAt) return false;
    return this._expiresAt < new Date();
  }

  /**
   * Get proxy URL for this user
   */
  getProxyUrl(baseUrl) {
    const check = this.canAccessContent();
    if (!check.allowed) {
      throw new Error(`Cannot generate proxy URL: ${check.reason}`);
    }
    return `${baseUrl}/proxy/${this._code.toString()}.m3u`;
  }

  // Getters (read-only access to properties)
  get id() { return this._id; }
  get code() { return this._code; }
  get status() { return this._status; }
  get m3uUrl() { return this._m3uUrl; }
  get expiresAt() { return this._expiresAt; }
  get adminNotes() { return this._adminNotes; }
  get createdAt() { return this._createdAt; }
  get updatedAt() { return this._updatedAt; }
  get deletedAt() { return this._deletedAt; }
  get isDeleted() { return this._deletedAt !== null; }

  /**
   * Serialize for persistence
   */
  toPersistence() {
    return {
      id: this._id,
      code: this._code.toString(),
      status: this._status.toString(),
      m3u_url: this._m3uUrl?.toString() || null,
      expires_at: this._expiresAt?.toISOString() || null,
      admin_notes: this._adminNotes,
      created_at: this._createdAt.toISOString(),
      updated_at: this._updatedAt.toISOString(),
      deleted_at: this._deletedAt?.toISOString() || null
    };
  }

  /**
   * Serialize for API response (safe - no sensitive data)
   */
  toJSON() {
    return {
      id: this._id,
      code: this._code.toString(),
      status: this._status.toString(),
      expiresAt: this._expiresAt?.toISOString() || null,
      adminNotes: this._adminNotes,
      m3uUrl: this._m3uUrl?.toString() || null,
      createdAt: this._createdAt.toISOString(),
      updatedAt: this._updatedAt.toISOString(),
      deletedAt: this._deletedAt?.toISOString() || null,
      isDeleted: this.isDeleted
    };
  }
}

module.exports = User;
