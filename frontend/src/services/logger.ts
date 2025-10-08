import { env } from '@/config/env';

export interface LogContext {
  userId?: string;
  action?: string;
  component?: string;
  metadata?: Record<string, unknown>;
}

export interface LogLevel {
  ERROR: 'error';
  WARN: 'warn';
  INFO: 'info';
  DEBUG: 'debug';
}

const LOG_LEVELS: LogLevel = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
};

class Logger {
  private isDevelopment = env.isDevelopment;

  private formatMessage(level: string, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` | ${JSON.stringify(context)}` : '';
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${contextStr}`;
  }

  private sendToRemoteLogging(level: string, message: string, context?: LogContext) {
    // In production, you would send this to a logging service like:
    // - Sentry
    // - LogRocket
    // - DataDog
    // - Custom logging endpoint
    
    if (env.sentryDsn && level === LOG_LEVELS.ERROR) {
      // Example: Send to Sentry (would need @sentry/react installed)
      // Sentry.captureException(new Error(message), { extra: context });
      console.warn('Sentry logging not implemented yet');
    }
    
    // Example: Send to custom logging endpoint
    if (!this.isDevelopment) {
      try {
        fetch('/api/logs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            level,
            message,
            context,
            timestamp: new Date().toISOString(),
            url: window.location.href,
            userAgent: navigator.userAgent,
          }),
        }).catch(() => {
          // Silently fail if logging endpoint is unavailable
        });
      } catch {
        // Silently fail
      }
    }
  }

  error(message: string, context?: LogContext) {
    const formattedMessage = this.formatMessage(LOG_LEVELS.ERROR, message, context);
    console.error(formattedMessage);
    this.sendToRemoteLogging(LOG_LEVELS.ERROR, message, context);
  }

  warn(message: string, context?: LogContext) {
    const formattedMessage = this.formatMessage(LOG_LEVELS.WARN, message, context);
    console.warn(formattedMessage);
    
    if (!this.isDevelopment) {
      this.sendToRemoteLogging(LOG_LEVELS.WARN, message, context);
    }
  }

  info(message: string, context?: LogContext) {
    const formattedMessage = this.formatMessage(LOG_LEVELS.INFO, message, context);
    console.info(formattedMessage);
    
    if (!this.isDevelopment) {
      this.sendToRemoteLogging(LOG_LEVELS.INFO, message, context);
    }
  }

  debug(message: string, context?: LogContext) {
    if (this.isDevelopment) {
      const formattedMessage = this.formatMessage(LOG_LEVELS.DEBUG, message, context);
      console.debug(formattedMessage);
    }
  }

  // Track user actions for analytics
  trackAction(action: string, context?: Omit<LogContext, 'action'>) {
    this.info(`User action: ${action}`, { ...context, action });
    
    // In production, you might also send to analytics services:
    // - Google Analytics
    // - Mixpanel
    // - Segment
    // - Custom analytics endpoint
  }

  // Performance monitoring
  trackPerformance(metric: string, value: number, context?: LogContext) {
    this.info(`Performance metric: ${metric} = ${value}ms`, context);
    
    if (!this.isDevelopment) {
      // Send to performance monitoring service
      try {
        fetch('/api/metrics', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            metric,
            value,
            context,
            timestamp: new Date().toISOString(),
          }),
        }).catch(() => {
          // Silently fail
        });
      } catch {
        // Silently fail
      }
    }
  }
}

export const logger = new Logger();

// Global error handler
window.addEventListener('error', (event) => {
  logger.error('Uncaught error', {
    component: 'GlobalErrorHandler',
    metadata: {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack,
    },
  });
});

// Global promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
  logger.error('Unhandled promise rejection', {
    component: 'GlobalErrorHandler',
    metadata: {
      message: event.reason?.message || String(event.reason),
      stack: event.reason?.stack,
      reason: event.reason,
    },
  });
});
