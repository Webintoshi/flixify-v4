/**
 * Code Value Object Unit Tests
 * 
 * Test Coverage:
 * - Valid code creation
 * - Invalid code rejection
 * - Code generation
 * - Equality comparison
 * - Masking for PII protection
 */

const Code = require('../../src/domain/value-objects/Code');

describe('Code Value Object', () => {
  describe('creation', () => {
    test('should create code with valid 16-digit hex', () => {
      const code = Code.create('A7F2A9B1C4D8E6F0');
      expect(code.toString()).toBe('A7F2A9B1C4D8E6F0');
    });

    test('should normalize lowercase to uppercase', () => {
      const code = Code.create('a7f2a9b1c4d8e6f0');
      expect(code.toString()).toBe('A7F2A9B1C4D8E6F0');
    });

    test('should throw error for empty string', () => {
      expect(() => Code.create('')).toThrow('Code must be a non-empty string');
    });

    test('should throw error for null', () => {
      expect(() => Code.create(null)).toThrow('Code must be a non-empty string');
    });

    test('should throw error for code shorter than 16 chars', () => {
      expect(() => Code.create('X7F2A9B1C4D8E6F')).toThrow('Code must be exactly 16 characters');
    });

    test('should throw error for code longer than 16 chars', () => {
      expect(() => Code.create('A7F2A9B1C4D8E6F01')).toThrow('Code must be exactly 16 characters');
    });

    test('should throw error for non-hex characters', () => {
      expect(() => Code.create('G7F2A9B1C4D8E6F0')).toThrow('Code must contain only hexadecimal characters');
    });

    test('should throw error for special characters', () => {
      expect(() => Code.create('X7F2A9B1C4D8E6F!')).toThrow('Code must contain only hexadecimal characters');
    });
  });

  describe('generation', () => {
    test('should generate valid 16-digit code', () => {
      const code = Code.generate();
      expect(code.toString()).toHaveLength(16);
      expect(code.toString()).toMatch(/^[0-9A-F]{16}$/);
    });

    test('should generate unique codes', () => {
      const codes = new Set();
      for (let i = 0; i < 100; i++) {
        codes.add(Code.generate().toString());
      }
      expect(codes.size).toBe(100);
    });

    test('generated codes should be uppercase', () => {
      const code = Code.generate();
      expect(code.toString()).toBe(code.toString().toUpperCase());
    });
  });

  describe('equality', () => {
    test('should be equal for same value', () => {
      const code1 = Code.create('A7F2A9B1C4D8E6F0');
      const code2 = Code.create('A7F2A9B1C4D8E6F0');
      expect(code1.equals(code2)).toBe(true);
    });

    test('should be equal for different case', () => {
      const code1 = Code.create('A7F2A9B1C4D8E6F0');
      const code2 = Code.create('a7f2a9b1c4d8e6f0');
      expect(code1.equals(code2)).toBe(true);
    });

    test('should not be equal for different values', () => {
      const code1 = Code.create('A7F2A9B1C4D8E6F0');
      const code2 = Code.create('A3B8C9D2E1F4A5B6');
      expect(code1.equals(code2)).toBe(false);
    });

    test('should not be equal to non-Code object', () => {
      const code = Code.create('A7F2A9B1C4D8E6F0');
      expect(code.equals('A7F2A9B1C4D8E6F0')).toBe(false);
      expect(code.equals(null)).toBe(false);
    });
  });

  describe('masking', () => {
    test('should mask middle digits for logging', () => {
      const code = Code.create('A7F2A9B1C4D8E6F0');
      expect(code.toMaskedString()).toBe('A7F2A9B1****E6F0');
    });
  });

  describe('serialization', () => {
    test('should serialize to string', () => {
      const code = Code.create('A7F2A9B1C4D8E6F0');
      expect(code.toJSON()).toBe('A7F2A9B1C4D8E6F0');
    });

    test('should be immutable', () => {
      const code = Code.create('A7F2A9B1C4D8E6F0');
      expect(Object.isFrozen(code)).toBe(true);
    });
  });
});
