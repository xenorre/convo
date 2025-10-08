import axios from 'axios';
import type { AxiosInstance, AxiosRequestConfig } from 'axios';
import { env } from '../config/env';
import { logger } from './logger';

export interface ApiError {
  message: string;
  status?: number;
  code?: string;
  details?: unknown;
}

export class ApiService {
  private instance: AxiosInstance;
  private csrfToken: string | null = null;
  private csrfTokenExpiry: number = 0;

  constructor() {
    this.instance = axios.create({
      baseURL: env.apiUrl,
      withCredentials: true,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor
    this.instance.interceptors.request.use(
      async config => {
        // Add CSRF token to requests
        await this.ensureCSRFToken();
        if (this.csrfToken && this.isWriteOperation(config.method)) {
          config.headers['x-csrf-token'] = this.csrfToken;
        }

        // Add request ID for tracing
        config.headers['X-Request-ID'] = this.generateRequestId();

        if (env.isDevelopment) {
          logger.info(`🚀 API Request: ${config.method?.toUpperCase()} ${config.url}`, {
            component: 'ApiService',
            metadata: {
              headers: config.headers,
              data: config.data,
            },
          });
        }

        return config;
      },
      error => {
        logger.error('Request interceptor error', {
          component: 'ApiService',
          metadata: { error },
        });
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.instance.interceptors.response.use(
      response => {
        if (env.isDevelopment) {
          logger.info(`✅ API Response: ${response.status} ${response.config.url}`, {
            component: 'ApiService',
            metadata: {
              data: response.data,
            },
          });
        }

        // Update CSRF token if provided in response
        const newCsrfToken = response.headers['x-csrf-token'];
        if (newCsrfToken) {
          this.csrfToken = newCsrfToken;
          this.csrfTokenExpiry = Date.now() + 30 * 60 * 1000; // 30 minutes
        }

        return response;
      },
      async error => {
        const originalRequest = error.config;

        // Handle CSRF token errors
        if (
          error.response?.status === 403 &&
          error.response?.data?.message?.includes('CSRF') &&
          !originalRequest._csrfRetry
        ) {
          logger.warn('CSRF token invalid, refreshing...');
          originalRequest._csrfRetry = true;

          try {
            await this.refreshCSRFToken();
            originalRequest.headers['x-csrf-token'] = this.csrfToken;
            return this.instance(originalRequest);
          } catch (csrfError) {
            logger.error('Failed to refresh CSRF token', {
              component: 'ApiService',
              metadata: { error: csrfError },
            });
            return Promise.reject(this.createApiError(error));
          }
        }

        // Handle authentication errors
        if (error.response?.status === 401) {
          logger.warn('Authentication failed, redirecting to login...');
          // You can dispatch a logout action here if using a state manager
          return Promise.reject(this.createApiError(error));
        }

        if (env.isDevelopment) {
          logger.error(
            `❌ API Error: ${error.response?.status || 'Network Error'} ${error.config?.url}`,
            {
              component: 'ApiService',
              metadata: {
                error: error.response?.data,
                status: error.response?.status,
              },
            }
          );
        }

        return Promise.reject(this.createApiError(error));
      }
    );
  }

  private async ensureCSRFToken(): Promise<void> {
    // Check if token is still valid (with 5 minute buffer)
    if (this.csrfToken && Date.now() < this.csrfTokenExpiry - 5 * 60 * 1000) {
      return;
    }

    // Try to get token from cookie first (in case it's already there)
    const cookieToken = this.getCsrfTokenFromCookie();
    if (cookieToken && !this.csrfToken) {
      this.csrfToken = cookieToken;
      this.csrfTokenExpiry = Date.now() + 30 * 60 * 1000; // 30 minutes
      return;
    }

    try {
      await this.refreshCSRFToken();
    } catch (error) {
      logger.error('Failed to get CSRF token', {
        component: 'ApiService',
        metadata: { error },
      });
      throw error;
    }
  }

  private async refreshCSRFToken(): Promise<void> {
    try {
      // Use the base URL without /api prefix since CSRF endpoint is at root level
      const baseUrl = env.apiUrl.replace('/api', '');

      // First request to ensure cookie is set
      await axios.get(`${baseUrl}/csrf-token`, {
        withCredentials: true,
        timeout: 10000,
      });

      // Second request to get the token (now that cookie is set)
      const response = await axios.get(`${baseUrl}/csrf-token`, {
        withCredentials: true,
        timeout: 10000,
      });

      this.csrfToken = response.data.csrfToken || this.getCsrfTokenFromCookie();
      this.csrfTokenExpiry = Date.now() + 30 * 60 * 1000; // 30 minutes

      if (!this.csrfToken) {
        throw new Error('No CSRF token received from server');
      }

      logger.info('CSRF token refreshed successfully');
    } catch (error) {
      logger.error('Failed to refresh CSRF token', {
        component: 'ApiService',
        metadata: { error },
      });
      this.csrfToken = null;
      this.csrfTokenExpiry = 0;
      throw error;
    }
  }

  private isWriteOperation(method?: string): boolean {
    const writeMethods = ['post', 'put', 'patch', 'delete'];
    return writeMethods.includes(method?.toLowerCase() || '');
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getCsrfTokenFromCookie(): string | null {
    if (typeof document === 'undefined') return null;

    const cookies = document.cookie.split(';');
    const csrfCookie = cookies.find(cookie =>
      cookie.trim().startsWith('csrfToken=')
    );

    if (csrfCookie) {
      return csrfCookie.split('=')[1];
    }

    return null;
  }

  private createApiError(error: unknown): ApiError {
    const apiError: ApiError = {
      message: 'An unexpected error occurred',
      status: 500,
    };

    // Type guard for axios error
    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as {
        response?: {
          status?: number;
          data?: { message?: string; error?: string };
        };
        request?: unknown;
        message?: string;
      };

      if (axiosError.response) {
        // Server responded with error status
        apiError.status = axiosError.response.status || 500;
        apiError.message =
          axiosError.response.data?.message ||
          axiosError.response.data?.error ||
          `HTTP ${axiosError.response.status || 500}`;
        apiError.details = axiosError.response.data;
      } else if (axiosError.request) {
        // Network error
        apiError.message = 'Network error - please check your connection';
        apiError.code = 'NETWORK_ERROR';
      } else {
        // Other error
        apiError.message = axiosError.message || 'An unexpected error occurred';
      }
    } else if (error instanceof Error) {
      apiError.message = error.message;
    }

    return apiError;
  }

  // Public API methods
  async get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.get<T>(url, config);
    return response.data;
  }

  async post<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response = await this.instance.post<T>(url, data, config);
    return response.data;
  }

  async put<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response = await this.instance.put<T>(url, data, config);
    return response.data;
  }

  async patch<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response = await this.instance.patch<T>(url, data, config);
    return response.data;
  }

  async delete<T = unknown>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response = await this.instance.delete<T>(url, config);
    return response.data;
  }

  // File upload with progress tracking
  async uploadFile<T = unknown>(
    url: string,
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<T> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await this.instance.post<T>(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: progressEvent => {
        if (onProgress && progressEvent.total) {
          const progress = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          onProgress(progress);
        }
      },
    });

    return response.data;
  }

  // Get current CSRF token (useful for testing)
  getCurrentCSRFToken(): string | null {
    return this.csrfToken;
  }

  // Manually refresh CSRF token (useful for testing)
  async manuallyRefreshCSRFToken(): Promise<void> {
    await this.refreshCSRFToken();
  }
}

// Create and export singleton instance
export const apiService = new ApiService();
export default apiService;
