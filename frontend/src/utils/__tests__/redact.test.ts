import { describe, expect, it } from 'vitest';
import { AxiosHeaders } from 'axios';
import { redactSecrets } from '@/utils/redact';

describe('redactSecrets', () => {
  it('hides passwords, tokens and the CSRF header at any depth', () => {
    const headers = new AxiosHeaders({ 'x-csrf-token': 'abc', 'X-Request-ID': 'req-1' });

    expect(redactSecrets({
      headers,
      data: { email: 'ann@example.com', password: 'hunter2-long', nested: { newPassword: 'x', currentPassword: 'y' } },
    })).toEqual({
      headers: { 'x-csrf-token': '[redacted]', 'X-Request-ID': 'req-1' },
      data: { email: 'ann@example.com', password: '[redacted]', nested: { newPassword: '[redacted]', currentPassword: '[redacted]' } },
    });
    expect(redactSecrets({ data: { token: 'link-token', csrfToken: 't' } })).toEqual({
      data: { token: '[redacted]', csrfToken: '[redacted]' },
    });
  });

  it('leaves other values as they are', () => {
    expect(redactSecrets({ data: [{ text: 'hi' }], count: 2, empty: null })).toEqual({ data: [{ text: 'hi' }], count: 2, empty: null });
    expect(redactSecrets('plain')).toBe('plain');
    expect(redactSecrets({ data: new FormData() })).toEqual({ data: '[FormData]' });
  });
});
