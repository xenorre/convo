import { AxiosError } from 'axios';
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../apiService';
import {
  advanceAuthSession,
  getAuthSessionVersion,
  registerAuthenticationFailureHandler,
  SESSION_EXPIRED_MESSAGE,
  SESSION_REVOKED_MESSAGE,
} from '../authSession';

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const authenticationFailure = vi.fn();

const unauthorized = (config: InternalAxiosRequestConfig, data: Record<string, unknown>) =>
  new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined, {
    config,
    status: 401,
    statusText: 'Unauthorized',
    headers: {},
    data,
  });

const pendingRequest = () => {
  let resolve!: (response: AxiosResponse) => void;
  let reject!: (error: unknown) => void;
  const response = new Promise<AxiosResponse>((resolveResponse, rejectResponse) => {
    resolve = resolveResponse;
    reject = rejectResponse;
  });
  const adapter = vi.fn((_config: InternalAxiosRequestConfig) => response);
  return { adapter, resolve, reject };
};

beforeEach(() => {
  advanceAuthSession();
  vi.clearAllMocks();
  registerAuthenticationFailureHandler(authenticationFailure);
  document.cookie = 'csrfToken=valid-test-csrf-token; path=/';
});

describe('API session handling', () => {
  it('preserves the revocation code and reports an authenticated request failure', async () => {
    const api = new ApiService();
    const version = getAuthSessionVersion();
    const request = api.get('/messages/contacts', {
      adapter: config => Promise.reject(unauthorized(config, {
        error: SESSION_REVOKED_MESSAGE, code: 'SESSION_REVOKED',
      })),
    });

    await expect(request).rejects.toMatchObject({
      status: 401, code: 'SESSION_REVOKED', message: SESSION_REVOKED_MESSAGE,
    });
    expect(authenticationFailure).toHaveBeenCalledExactlyOnceWith({
      version, code: 'SESSION_REVOKED', message: SESSION_REVOKED_MESSAGE,
    });
  });

  it('reports a regular protected HTTP 401 as an expired session', async () => {
    const api = new ApiService();
    const request = api.get('/messages/chats', {
      adapter: config => Promise.reject(unauthorized(config, { error: 'Unauthorized' })),
    });

    await expect(request).rejects.toMatchObject({
      status: 401, code: 'SESSION_EXPIRED', message: SESSION_EXPIRED_MESSAGE,
    });
    expect(authenticationFailure).toHaveBeenCalledOnce();
  });

  it.each(['/auth/login', '/auth/sign-up', '/auth/logout'])('does not expire another session for HTTP 401 from %s', async path => {
    const api = new ApiService();
    const request = api.post(path, {}, {
      adapter: config => Promise.reject(unauthorized(config, { error: 'Invalid credentials' })),
    });

    await expect(request).rejects.toMatchObject({ status: 401, message: 'Invalid credentials' });
    expect(authenticationFailure).not.toHaveBeenCalled();
  });

  it('ignores a delayed HTTP 401 from a previous session', async () => {
    const api = new ApiService();
    const pending = pendingRequest();
    const request = api.get('/messages/chats', { adapter: pending.adapter });
    const result = expect(request).rejects.toMatchObject({ code: 'STALE_AUTH_RESPONSE' });
    await vi.waitFor(() => expect(pending.adapter).toHaveBeenCalledOnce());
    advanceAuthSession();
    const config = pending.adapter.mock.calls[0][0];
    pending.reject(unauthorized(config, { error: SESSION_REVOKED_MESSAGE, code: 'SESSION_REVOKED' }));

    await result;
    expect(authenticationFailure).not.toHaveBeenCalled();
  });

  it('rejects delayed successful data from a previous session', async () => {
    const api = new ApiService();
    const pending = pendingRequest();
    const request = api.get('/messages/chats', { adapter: pending.adapter });
    const result = expect(request).rejects.toMatchObject({ code: 'STALE_AUTH_RESPONSE' });
    await vi.waitFor(() => expect(pending.adapter).toHaveBeenCalledOnce());
    advanceAuthSession();
    pending.resolve({
      config: pending.adapter.mock.calls[0][0],
      data: { chats: ['private old account data'] },
      status: 200,
      statusText: 'OK',
      headers: {},
    });

    await result;
    expect(authenticationFailure).not.toHaveBeenCalled();
  });

  it('reports one authentication failure when concurrent requests lose the same session', async () => {
    const api = new ApiService();
    registerAuthenticationFailureHandler(failure => {
      authenticationFailure(failure);
      advanceAuthSession();
    });
    const first = pendingRequest();
    const second = pendingRequest();
    const firstResult = expect(api.get('/messages/chats', { adapter: first.adapter }))
      .rejects.toMatchObject({ code: 'SESSION_REVOKED' });
    const secondResult = expect(api.get('/messages/contacts', { adapter: second.adapter }))
      .rejects.toMatchObject({ code: 'STALE_AUTH_RESPONSE' });
    await vi.waitFor(() => {
      expect(first.adapter).toHaveBeenCalledOnce();
      expect(second.adapter).toHaveBeenCalledOnce();
    });
    first.reject(unauthorized(first.adapter.mock.calls[0][0], {
      error: SESSION_REVOKED_MESSAGE, code: 'SESSION_REVOKED',
    }));
    await firstResult;
    second.reject(unauthorized(second.adapter.mock.calls[0][0], {
      error: SESSION_REVOKED_MESSAGE, code: 'SESSION_REVOKED',
    }));
    await secondResult;

    expect(authenticationFailure).toHaveBeenCalledOnce();
  });
});
