import { useEffect, useRef } from 'react';
import { logger } from '@/services/logger';

export const usePerformanceMonitor = (componentName: string, threshold: number = 100) => {
  const startTimeRef = useRef<number | undefined>(undefined);
  const renderCountRef = useRef(0);

  useEffect(() => {
    startTimeRef.current = performance.now();
    renderCountRef.current += 1;

    return () => {
      if (startTimeRef.current) {
        const renderTime = performance.now() - startTimeRef.current;
        
        if (renderTime > threshold) {
          logger.warn(`Slow component render detected`, {
            component: componentName,
            metadata: {
              renderTime: Math.round(renderTime),
              threshold,
              renderCount: renderCountRef.current,
            },
          });
        }

        logger.trackPerformance(`${componentName}_render_time`, renderTime, {
          component: componentName,
          metadata: { renderCount: renderCountRef.current },
        });
      }
    };
  });

  return {
    trackAction: (action: string, metadata?: Record<string, any>) => {
      logger.trackAction(action, {
        component: componentName,
        metadata,
      });
    },
    trackCustomMetric: (metric: string, value: number) => {
      logger.trackPerformance(`${componentName}_${metric}`, value, {
        component: componentName,
      });
    },
  };
};