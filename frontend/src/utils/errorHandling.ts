import { AxiosError } from 'axios';
import toast from 'react-hot-toast';
import { logger } from '@/services/logger';

export interface ApiError {
  message: string;
  status: number;
  code?: string;
  details?: any;
}

export const createApiError = (error: unknown): ApiError => {
  if (error instanceof AxiosError) {
    const response = error.response;
    return {
      message: response?.data?.error || response?.data?.message || error.message || 'Request failed',
      status: response?.status || 500,
      code: response?.data?.code,
      details: response?.data?.details,
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      status: 500,
    };
  }

  return {
    message: 'An unexpected error occurred',
    status: 500,
  };
};

export const handleStoreError = (error: unknown, customMessage?: string, context?: { action?: string; component?: string }): ApiError => {
  const apiError = createApiError(error);
  
  // Show user-friendly toast message
  const userMessage = customMessage || getUserFriendlyMessage(apiError);
  toast.error(userMessage);
  
  // Log detailed error for debugging and monitoring
  logger.error('Store operation failed', {
    action: context?.action,
    component: context?.component,
    metadata: {
      status: apiError.status,
      message: apiError.message,
      code: apiError.code,
      originalError: error,
    },
  });
  
  return apiError;
};

const getUserFriendlyMessage = (error: ApiError): string => {
  switch (error.status) {
    case 400:
      return 'Invalid request. Please check your input.';
    case 401:
      return 'Please log in to continue.';
    case 403:
      return 'You do not have permission to perform this action.';
    case 404:
      return 'The requested resource was not found.';
    case 429:
      return 'Too many requests. Please try again later.';
    case 500:
      return 'Server error. Please try again later.';
    default:
      return error.message || 'Something went wrong. Please try again.';
  }
};

export const isNetworkError = (error: ApiError): boolean => {
  return error.status === 0 || error.message.toLowerCase().includes('network');
};

export const isAuthError = (error: ApiError): boolean => {
  return error.status === 401 || error.status === 403;
};