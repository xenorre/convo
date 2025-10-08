import { describe, it, expect } from 'vitest';
import { sanitizeInput, validateEmail, validateMessage } from '../sanitize';

describe('sanitizeInput', () => {
  it('removes HTML-like brackets', () => {
    const input = 'Hello <script>alert("xss")</script> World';
    const result = sanitizeInput(input);
    expect(result).toBe('Hello scriptalert("xss")/script World');
  });

  it('trims whitespace', () => {
    const input = '  Hello World  ';
    const result = sanitizeInput(input);
    expect(result).toBe('Hello World');
  });

  it('limits length to 2000 characters', () => {
    const input = 'a'.repeat(3000);
    const result = sanitizeInput(input);
    expect(result).toHaveLength(2000);
  });

  it('handles empty strings', () => {
    const result = sanitizeInput('');
    expect(result).toBe('');
  });
});

describe('validateEmail', () => {
  it('validates correct email formats', () => {
    expect(validateEmail('test@example.com')).toBe(true);
    expect(validateEmail('user.name@domain.co.uk')).toBe(true);
    expect(validateEmail('test+label@gmail.com')).toBe(true);
  });

  it('rejects invalid email formats', () => {
    expect(validateEmail('invalid-email')).toBe(false);
    expect(validateEmail('test@')).toBe(false);
    expect(validateEmail('@example.com')).toBe(false);
    expect(validateEmail('test@.com')).toBe(false);
    expect(validateEmail('')).toBe(false);
  });

  it('rejects emails that are too long', () => {
    const longEmail = 'a'.repeat(250) + '@example.com';
    expect(validateEmail(longEmail)).toBe(false);
  });
});

describe('validateMessage', () => {
  it('validates messages within length limit', () => {
    expect(validateMessage('Hello world')).toBe(true);
    expect(validateMessage('a'.repeat(2000))).toBe(true);
  });

  it('rejects empty or whitespace-only messages', () => {
    expect(validateMessage('')).toBe(false);
    expect(validateMessage('   ')).toBe(false);
    expect(validateMessage('\t\n')).toBe(false);
  });

  it('accepts messages at max length after sanitization', () => {
    // Since sanitizeInput trims to 2000 chars, this should be valid
    const longMessage = 'a'.repeat(2001);
    expect(validateMessage(longMessage)).toBe(true);
  });

  it('handles messages with special characters', () => {
    expect(validateMessage('Hello! @#$%^&*()_+')).toBe(true);
    expect(validateMessage('🎉 Hello World! 🌟')).toBe(true);
  });
});