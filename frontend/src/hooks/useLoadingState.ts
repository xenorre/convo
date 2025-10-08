import { useState, useCallback } from 'react';

export interface LoadingState {
  isLoading: boolean;
  error: string | null;
  success: boolean;
}

export const useLoadingState = () => {
  const [state, setState] = useState<LoadingState>({
    isLoading: false,
    error: null,
    success: false,
  });

  const setLoading = useCallback(() => {
    setState({ isLoading: true, error: null, success: false });
  }, []);

  const setSuccess = useCallback(() => {
    setState({ isLoading: false, error: null, success: true });
  }, []);

  const setError = useCallback((error: string) => {
    setState({ isLoading: false, error, success: false });
  }, []);

  const reset = useCallback(() => {
    setState({ isLoading: false, error: null, success: false });
  }, []);

  return {
    ...state,
    setLoading,
    setSuccess,
    setError,
    reset,
  };
};