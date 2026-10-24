import { beforeAll, describe, expect, it } from 'vitest';
import {
  containsPersonalWord,
  isPasswordPolicyCode,
  loadStrengthChecker,
  passwordProblem,
  personalWords,
} from '@/utils/passwordPolicy';

const account = { fullName: 'Dawid Zalewski', email: 'dzalewski97@example.com' };

describe('password policy', () => {
  // Awaited, not returned: a function returned from beforeAll runs as teardown.
  beforeAll(async () => {
    await loadStrengthChecker();
  }, 30_000);

  it('uses the same personal words as the server', () => {
    expect(personalWords(account)).toEqual(['dawid', 'zalewski', 'dzalewski97']);
    expect(containsPersonalWord('my-ZALEWSKI-pass', account)).toBe(true);
    // Short names would match inside ordinary words.
    expect(containsPersonalWord('planning-ahead-2026', { fullName: 'Ann Li' })).toBe(false);
  });

  it('reports the first broken rule in the server’s words', () => {
    expect(passwordProblem('short', account)).toBe('Use at least 12 characters');
    expect(passwordProblem('x'.repeat(129), account)).toBe('Use at most 128 characters');
    expect(passwordProblem('dawid-is-the-best', account)).toBe("Don't use your name or email in your password");
    expect(passwordProblem('long-enough-here', account, 2)).toMatch(/^This password is too easy to guess/);
    expect(passwordProblem('long-enough-here', account, 3)).toBeNull();
    // Without a score (checker unavailable) only the local rules apply.
    expect(passwordProblem('long-enough-here', account)).toBeNull();
  });

  it('scores common passwords low and long unrelated phrases high', async () => {
    const check = await loadStrengthChecker();
    expect(check('password1234', []).score).toBeLessThan(3);
    expect(check('qwertyuiop123', []).score).toBeLessThan(3);
    expect(check('violet-anchor-harbor-71', []).score).toBeGreaterThanOrEqual(3);
  });

  it('recognises the server’s password refusals', () => {
    expect(isPasswordPolicyCode('PASSWORD_BREACHED')).toBe(true);
    expect(isPasswordPolicyCode('INVALID_CURRENT_PASSWORD')).toBe(false);
    expect(isPasswordPolicyCode(undefined)).toBe(false);
  });
});
