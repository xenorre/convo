import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const telemetryEnv = vi.hoisted(() => ({
  isDevelopment: false,
  sentryDsn: '',
  logEndpoint: '',
  metricsEndpoint: '',
}));

vi.mock('@/config/env', () => ({ env: telemetryEnv }));

describe('optional production telemetry', () => {
  beforeEach(() => {
    vi.resetModules();
    telemetryEnv.logEndpoint = '';
    telemetryEnv.metricsEndpoint = '';
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('does not contact nonexistent default endpoints in production', async () => {
    const { logger } = await import('../logger');

    logger.info('Page ready');
    logger.warn('Slow request');
    logger.error('Request failed');
    logger.trackPerformance('page_load', 1200);

    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends logs only to the configured destination', async () => {
    telemetryEnv.logEndpoint = 'https://telemetry.example/logs';
    const { logger } = await import('../logger');

    logger.error('Request failed', { component: 'Chat' });

    expect(fetch).toHaveBeenCalledOnce();
    const [url, request] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe(telemetryEnv.logEndpoint);
    expect(JSON.parse(request?.body as string)).toMatchObject({
      level: 'error',
      message: 'Request failed',
      context: { component: 'Chat' },
    });
  });

  it('preserves independently configured performance reporting', async () => {
    telemetryEnv.metricsEndpoint = 'https://telemetry.example/metrics';
    const { logger } = await import('../logger');

    logger.trackPerformance('page_load', 1200);

    expect(fetch).toHaveBeenCalledOnce();
    const [url, request] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe(telemetryEnv.metricsEndpoint);
    expect(JSON.parse(request?.body as string)).toMatchObject({
      metric: 'page_load',
      value: 1200,
    });
  });
});
