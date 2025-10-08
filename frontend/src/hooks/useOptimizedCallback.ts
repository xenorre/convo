import { useCallback, useRef } from 'react';

// Optimized callback hook to prevent unnecessary re-renders
export const useOptimizedCallback = <T extends (...args: any[]) => any>(
  callback: T,
  deps: React.DependencyList
): T => {
  const callbackRef = useRef<T>(callback);
  
  // Update the ref when dependencies change
  const memoizedCallback = useCallback((...args: Parameters<T>) => {
    return callbackRef.current(...args);
  }, deps);
  
  callbackRef.current = callback;
  
  return memoizedCallback as T;
};