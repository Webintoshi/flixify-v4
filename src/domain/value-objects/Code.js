/**
 * Code Value Object
 * 
 * 16-digit hexadecimal code for anonymous authentication.
 * Immutable, validated at construction time.
 * 
 * Business Rules:
 * - Exactly 16 characters
 * - Uppercase hexadecimal (0-9, A-F)
 * - Immutable after creation
 */

class Code {
  static CODE_LENGTH = 16;
  static CODE_PATTERN = /^[0-9A-F]{16}$/;

  constructor(value) {
    this._validate(value);
    this._value = value.toUpperCase();
    Object.freeze(this);
  }

  /**
   * Factory method: Generate new random code
   * Uses cryptographically secure random generation
   */
  static generate() {
    const crypto = require('crypto');
    const bytes = crypto.randomBytes(8); // 8 bytes = 16 hex chars
    return new Code(bytes.toString('hex').toUpperCase());
  }

  /**
   * Factory method: Create from string with validation
   */
  static create(value) {
    return new Code(value);
  }

  /**
   * Business rule validation
   * @throws {Error} if validation fails
   */
  _validate(value) {
    if (!value || typeof value !== 'string') {
      throw new Error('Code must be a non-empty string');
    }

    const normalized = value.toUpperCase().trim();

    if (normalized.length !== Code.CODE_LENGTH) {
      throw new Error(`Code must be exactly ${Code.CODE_LENGTH} characters, got ${normalized.length}`);
    }

    if (!Code.CODE_PATTERN.test(normalized)) {
      throw new Error('Code must contain only hexadecimal characters (0-9, A-F)');
    }
  }

  /**
   * Value comparison - structural equality
   */
  equals(other) {
    if (!(other instanceof Code)) return false;
    return this._value === other._value;
  }

  /**
   * String representation for storage/transmission
   */
  toString() {
    return this._value;
  }

  /**
   * JSON serialization
   */
  toJSON() {
    return this._value;
  }

  /**
   * Mask code for logging (PII protection)
   * e.g., "X7F2A9B1****E6F0"
   */
  toMaskedString() {
    return this._value.substring(0, 8) + '****' + this._value.substring(12);
  }

  get value() {
    return this._value;
  }
}

module.exports = Code;
