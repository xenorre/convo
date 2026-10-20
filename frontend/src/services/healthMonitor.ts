import { logger } from './logger';
import { env } from '@/config/env';

interface HealthMetrics {
  timestamp: number;
  uptime: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  performance: {
    navigation: number;
    loadComplete: number;
    domContentLoaded: number;
  };
  errors: {
    jsErrors: number;
    networkErrors: number;
    renderErrors: number;
  };
  features: {
    webSocket: boolean;
    localStorage: boolean;
    sessionStorage: boolean;
    geolocation: boolean;
    notifications: boolean;
  };
}

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  environment: string;
  timestamp: number;
  metrics: HealthMetrics;
  checks: Record<string, boolean>;
}

class HealthMonitor {
  private startTime: number;
  private errorCounts: { js: number; network: number; render: number };
  private isMonitoring: boolean = false;

  constructor() {
    this.startTime = Date.now();
    this.errorCounts = { js: 0, network: 0, render: 0 };
  }

  startMonitoring() {
    if (this.isMonitoring || (!env.metricsEndpoint && !env.healthEndpoint)) return;
    
    this.isMonitoring = true;
    
    // Monitor JavaScript errors
    window.addEventListener('error', () => {
      this.errorCounts.js++;
    });

    // Monitor unhandled promise rejections
    window.addEventListener('unhandledrejection', () => {
      this.errorCounts.js++;
    });

    // Monitor performance
    if (env.metricsEndpoint) {
      const schedulePerformanceMetrics = () => {
        setTimeout(() => {
          this.logPerformanceMetrics();
        }, 1000);
      };

      if (document.readyState === 'complete') {
        schedulePerformanceMetrics();
      } else {
        window.addEventListener('load', schedulePerformanceMetrics, { once: true });
      }
    }

    // Periodic health checks
    if (env.healthEndpoint) {
      setInterval(() => {
        this.performHealthCheck();
      }, 60000); // Every minute
    }

    logger.info('Health monitoring started', { component: 'HealthMonitor' });
  }

  private logPerformanceMetrics() {
    const timing = this.getNavigationTiming();
    if (!timing) return;
    
    const metrics = {
      navigation: timing.loadEventEnd || timing.duration,
      loadComplete: timing.loadEventEnd - timing.loadEventStart,
      domContentLoaded: timing.domContentLoadedEventEnd,
      domReady: timing.domComplete,
      firstByte: timing.responseStart,
    };

    logger.trackPerformance('page_load', metrics.navigation, {
      component: 'HealthMonitor',
      metadata: metrics,
    });

    // Log slow page loads
    if (metrics.navigation > 3000) {
      logger.warn('Slow page load detected', {
        component: 'HealthMonitor',
        metadata: { loadTime: metrics.navigation },
      });
    }
  }

  private getMemoryInfo(): HealthMetrics['memory'] {
    const memory = (performance as Performance & {
      memory?: { usedJSHeapSize: number; totalJSHeapSize: number };
    }).memory;
    if (memory) {
      return {
        used: memory.usedJSHeapSize,
        total: memory.totalJSHeapSize,
        percentage: Math.round((memory.usedJSHeapSize / memory.totalJSHeapSize) * 100),
      };
    }
    
    return { used: 0, total: 0, percentage: 0 };
  }

  private checkFeatureSupport(): HealthMetrics['features'] {
    return {
      webSocket: 'WebSocket' in window,
      localStorage: (() => {
        try {
          localStorage.setItem('test', 'test');
          localStorage.removeItem('test');
          return true;
        } catch {
          return false;
        }
      })(),
      sessionStorage: (() => {
        try {
          sessionStorage.setItem('test', 'test');
          sessionStorage.removeItem('test');
          return true;
        } catch {
          return false;
        }
      })(),
      geolocation: 'geolocation' in navigator,
      notifications: 'Notification' in window,
    };
  }

  private getPerformanceMetrics(): HealthMetrics['performance'] {
    const timing = this.getNavigationTiming();
    if (!timing) {
      return { navigation: 0, loadComplete: 0, domContentLoaded: 0 };
    }

    return {
      navigation: timing.loadEventEnd || timing.duration || 0,
      loadComplete: timing.loadEventEnd - timing.loadEventStart || 0,
      domContentLoaded: timing.domContentLoadedEventEnd || 0,
    };
  }

  private getNavigationTiming(): PerformanceNavigationTiming | undefined {
    return performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined;
  }

  private performHealthCheck(): void {
    const status = this.getHealthStatus();
    
    if (status.status === 'unhealthy') {
      logger.error('Health check failed - application is unhealthy', {
        component: 'HealthMonitor',
        metadata: status as unknown as Record<string, unknown>,
      });
    } else if (status.status === 'degraded') {
      logger.warn('Health check warning - application is degraded', {
        component: 'HealthMonitor',
        metadata: status as unknown as Record<string, unknown>,
      });
    }

    // Send to monitoring endpoint if configured
    if (!env.isDevelopment && env.healthEndpoint) {
      this.sendHealthMetrics(status);
    }
  }

  private async sendHealthMetrics(status: HealthStatus): Promise<void> {
    try {
      await fetch(env.healthEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(status),
      });
    } catch (error) {
      // Silently fail - don't spam logs with monitoring failures
      if (env.isDevelopment) {
        console.debug('Failed to send health metrics:', error);
      }
    }
  }

  getHealthStatus(): HealthStatus {
    const now = Date.now();
    const uptime = now - this.startTime;
    const memory = this.getMemoryInfo();
    
    // Health checks
    const checks = {
      uptime: uptime > 0,
      memoryUsage: memory.percentage < 90,
      errorRate: this.errorCounts.js < 10, // Less than 10 JS errors
      features: this.checkFeatureSupport().localStorage, // At least localStorage works
    };

    // Determine overall health status
    const failedChecks = Object.values(checks).filter(check => !check).length;
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (failedChecks >= 2) {
      status = 'unhealthy';
    } else if (failedChecks === 1) {
      status = 'degraded';
    }

    const healthStatus: HealthStatus = {
      status,
      version: env.appName,
      environment: env.nodeEnv,
      timestamp: now,
      metrics: {
        timestamp: now,
        uptime,
        memory,
        performance: this.getPerformanceMetrics(),
        errors: {
          jsErrors: this.errorCounts.js,
          networkErrors: this.errorCounts.network,
          renderErrors: this.errorCounts.render,
        },
        features: this.checkFeatureSupport(),
      },
      checks,
    };

    return healthStatus;
  }

  // Public method to get health status for health endpoint
  async getHealthEndpointResponse(): Promise<{
    status: string;
    timestamp: number;
    version: string;
    uptime: number;
  }> {
    const health = this.getHealthStatus();
    
    return {
      status: health.status,
      timestamp: health.timestamp,
      version: health.version,
      uptime: health.metrics.uptime,
    };
  }

  // Method to increment error counts from external sources
  recordError(type: 'network' | 'render'): void {
    this.errorCounts[type]++;
  }
}

export const healthMonitor = new HealthMonitor();

// Export health endpoint handler for use with custom server
export const handleHealthCheck = async (): Promise<Response> => {
  try {
    const health = await healthMonitor.getHealthEndpointResponse();
    const status = health.status === 'healthy' ? 200 : 503;
    
    return new Response(JSON.stringify(health), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch {
    return new Response(
      JSON.stringify({
        status: 'unhealthy',
        timestamp: Date.now(),
        error: 'Health check failed',
      }),
      {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      }
    );
  }
};
