import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const telemetryEnv = vi.hoisted(() => ({
  isDevelopment: false,
  isProduction: true,
  appName: 'Convo',
  nodeEnv: 'production',
  metricsEndpoint: '',
  healthEndpoint: '',
}));

vi.mock('@/config/env', () => ({ env: telemetryEnv }));
vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), trackPerformance: vi.fn() },
}));

describe('optional health monitoring', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    telemetryEnv.metricsEndpoint = '';
    telemetryEnv.healthEndpoint = '';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    // Only the navigation entry is faked; Vitest itself needs performance.now().
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([{
      loadEventEnd: 1500,
      loadEventStart: 1490,
      duration: 1500,
      domContentLoadedEventEnd: 900,
      domComplete: 1400,
      responseStart: 200,
    }] as unknown as PerformanceEntryList);
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('does not start timers or requests when destinations are unset', async () => {
    const { healthMonitor } = await import('../healthMonitor');
    healthMonitor.startMonitoring();

    await vi.advanceTimersByTimeAsync(60000);

    expect(vi.getTimerCount()).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('records navigation timing when loaded after the load event', async () => {
    telemetryEnv.metricsEndpoint = 'https://telemetry.example/metrics';
    const { healthMonitor } = await import('../healthMonitor');
    const { logger } = await import('../logger');

    expect(vi.getTimerCount()).toBe(0);
    healthMonitor.startMonitoring();
    healthMonitor.startMonitoring();
    await vi.advanceTimersByTimeAsync(1000);

    expect(logger.trackPerformance).toHaveBeenCalledExactlyOnceWith('page_load', 1500, {
      component: 'HealthMonitor',
      metadata: {
        navigation: 1500,
        loadComplete: 10,
        domContentLoaded: 900,
        domReady: 1400,
        firstByte: 200,
      },
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('sends periodic health data only to the configured endpoint', async () => {
    telemetryEnv.healthEndpoint = 'https://telemetry.example/health';
    const { healthMonitor } = await import('../healthMonitor');
    healthMonitor.startMonitoring();

    await vi.advanceTimersByTimeAsync(60000);

    expect(fetch).toHaveBeenCalledOnce();
    const [url, request] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe(telemetryEnv.healthEndpoint);
    expect(JSON.parse(request?.body as string)).toMatchObject({
      status: 'healthy',
      environment: 'production',
      metrics: {
        performance: { navigation: 1500, loadComplete: 10, domContentLoaded: 900 },
      },
    });
  });
});
