import { useState, useCallback } from 'react';
import { apiService } from '../services/apiService';
import type { ApiError } from '../services/apiService';
import toast from 'react-hot-toast';

interface UseApiState {
  loading: boolean;
  error: ApiError | null;
}

interface UseApiOptions {
  showSuccessToast?: boolean;
  showErrorToast?: boolean;
  successMessage?: string;
}

export function useApi() {
  const [state, setState] = useState<UseApiState>({
    loading: false,
    error: null,
  });

  const makeRequest = useCallback(
    async <T>(
      requestFn: () => Promise<T>,
      options: UseApiOptions = {}
    ): Promise<T | null> => {
      const {
        showSuccessToast = false,
        showErrorToast = true,
        successMessage = 'Operation completed successfully',
      } = options;

      setState({ loading: true, error: null });

      try {
        const result = await requestFn();
        
        if (showSuccessToast) {
          toast.success(successMessage);
        }

        setState({ loading: false, error: null });
        return result;
      } catch (error) {
        const apiError = error as ApiError;
        setState({ loading: false, error: apiError });

        if (showErrorToast) {
          toast.error(apiError.message);
        }

        return null;
      }
    },
    []
  );

  const get = useCallback(
    <T>(url: string, options?: UseApiOptions) =>
      makeRequest(() => apiService.get<T>(url), options),
    [makeRequest]
  );

  const post = useCallback(
    <T>(url: string, data?: unknown, options?: UseApiOptions) =>
      makeRequest(() => apiService.post<T>(url, data), options),
    [makeRequest]
  );

  const put = useCallback(
    <T>(url: string, data?: unknown, options?: UseApiOptions) =>
      makeRequest(() => apiService.put<T>(url, data), options),
    [makeRequest]
  );

  const patch = useCallback(
    <T>(url: string, data?: unknown, options?: UseApiOptions) =>
      makeRequest(() => apiService.patch<T>(url, data), options),
    [makeRequest]
  );

  const del = useCallback(
    <T>(url: string, options?: UseApiOptions) =>
      makeRequest(() => apiService.delete<T>(url), options),
    [makeRequest]
  );

  const uploadFile = useCallback(
    <T>(url: string, file: File, options?: UseApiOptions & { onProgress?: (progress: number) => void }) =>
      makeRequest(() => apiService.uploadFile<T>(url, file, options?.onProgress), options),
    [makeRequest]
  );

  // CSRF token utilities
  const getCurrentCSRFToken = useCallback(() => {
    return apiService.getCurrentCSRFToken();
  }, []);

  const refreshCSRFToken = useCallback(async () => {
    try {
      setState({ loading: true, error: null });
      await apiService.manuallyRefreshCSRFToken();
      toast.success('CSRF token refreshed successfully');
      setState({ loading: false, error: null });
      return true;
    } catch (error) {
      const apiError = error as ApiError;
      setState({ loading: false, error: apiError });
      toast.error('Failed to refresh CSRF token: ' + apiError.message);
      return false;
    }
  }, []);

  return {
    // State
    loading: state.loading,
    error: state.error,
    
    // HTTP methods
    get,
    post,
    put,
    patch,
    delete: del,
    uploadFile,
    
    // CSRF utilities
    getCurrentCSRFToken,
    refreshCSRFToken,
    
    // Direct access to api service for advanced use cases
    apiService,
  };
}