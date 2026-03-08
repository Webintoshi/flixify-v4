/**
 * M3uUrl Value Object
 * 
 * Represents an M3U playlist URL.
 * Validates URL format and security constraints.
 * 
 * Security Rules:
 * - Must be valid URL format
 * - HTTP protocol only (HTTPS blocked to avoid mixed content issues)
 * - No localhost/private network access (SSRF protection)
 * - Maximum length: 2048 characters
 */

class M3uUrl {
  static MAX_LENGTH = 2048;
  static ALLOWED_PROTOCOLS = ['http:'];
  static BLOCKED_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'];

  constructor(value) {
    this._validate(value);
    this._value = value.trim();
    Object.freeze(this);
  }

  static create(value) {
    return value ? new M3uUrl(value) : null;
  }

  /**
   * Security-focused validation
   * @throws {Error} if validation fails
   */
  _validate(value) {
    if (!value || typeof value !== 'string') {
      throw new Error('M3U URL must be a non-empty string');
    }

    const trimmed = value.trim();

    if (trimmed.length > M3uUrl.MAX_LENGTH) {
      throw new Error(`M3U URL exceeds maximum length of ${M3uUrl.MAX_LENGTH} characters`);
    }

    let parsed;
    try {
      parsed = new URL(trimmed);
    } catch (error) {
      throw new Error('M3U URL must be a valid URL format');
    }

    // Protocol validation (HTTP only - business requirement)
    if (!M3uUrl.ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
      throw new Error(`M3U URL must use HTTP protocol. HTTPS not allowed to avoid mixed content issues.`);
    }

    // SSRF Protection: Block private network access
    const hostname = parsed.hostname.toLowerCase();
    
    if (M3uUrl.BLOCKED_HOSTS.includes(hostname)) {
      throw new Error('M3U URL cannot reference localhost or private networks');
    }

    // Block private IP ranges
    if (this._isPrivateIP(hostname)) {
      throw new Error('M3U URL cannot reference private IP addresses');
    }
  }

  /**
   * Check if hostname is a private IP address
   */
  _isPrivateIP(hostname) {
    // IPv4 private ranges
    const privateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^127\./,
      /^169\.254\./,
      /^0\./,
    ];

    return privateRanges.some(range => range.test(hostname));
  }

  equals(other) {
    if (!(other instanceof M3uUrl)) return false;
    return this._value === other._value;
  }

  /**
   * Get URL for logging (mask sensitive parts)
   */
  toLogString() {
    try {
      const url = new URL(this._value);
      // Mask query parameters that might contain auth tokens
      return `${url.protocol}//${url.hostname}${url.pathname}`;
    } catch {
      return '[invalid-url]';
    }
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

module.exports = M3uUrl;
