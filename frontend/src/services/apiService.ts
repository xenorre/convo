import axios from 'axios';
import type { AxiosInstance, AxiosRequestConfig } from 'axios';
import { env } from '../config/env';
import { logger } from './logger';
import { redactSecrets } from '@/utils/redact';
import { noteServerBuild } from './appVersion';
import {
  getAuthSessionVersion,
  isCurrentAuthSession,
  isSessionError,
  reportAuthenticationFailure,
  SESSION_EXPIRED_MESSAGE,
  SESSION_REVOKED_MESSAGE,
} from './authSession';

type SessionRequestConfig = AxiosRequestConfig & {
  _authSessionVersion?: number;
  _csrfRetry?: boolean;
};

const staleSessionError = (): ApiError => ({
  status: 0,
  code: 'STALE_AUTH_RESPONSE',
  message: 'This response belongs to an earlier session.',
});

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
      baseURL: env.apiBaseUrl,
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
        const sessionConfig = config as SessionRequestConfig;
        sessionConfig._authSessionVersion ??= getAuthSessionVersion();
        // Safe requests do not need a CSRF token. In particular, the initial
        // auth check must not wait for a separate token bootstrap waterfall.
        if (this.isWriteOperation(config.method)) await this.ensureCSRFToken();
        if (!isCurrentAuthSession(sessionConfig._authSessionVersion)) {
          return Promise.reject(staleSessionError());
        }
        if (this.csrfToken && this.isWriteOperation(config.method)) {
          config.headers['x-csrf-token'] = this.csrfToken;
        }

        // Add request ID for tracing
        config.headers['X-Request-ID'] = this.generateRequestId();

        if (env.isDevelopment) {
          logger.info(`🚀 API Request: ${config.method?.toUpperCase()} ${config.url}`, {
            component: 'ApiService',
            metadata: redactSecrets({
              headers: config.headers,
              data: config.data,
            }) as Record<string, unknown>,
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
        noteServerBuild(response.headers as Record<string, unknown>);
        const sessionVersion = (response.config as SessionRequestConfig)._authSessionVersion;
        if (sessionVersion !== undefined && !isCurrentAuthSession(sessionVersion)) {
          return Promise.reject(staleSessionError());
        }
        if (env.isDevelopment) {
          logger.info(`✅ API Response: ${response.status} ${response.config.url}`, {
            component: 'ApiService',
            metadata: redactSecrets({
              data: response.data,
            }) as Record<string, unknown>,
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
        noteServerBuild(error.response?.headers as Record<string, unknown> | undefined);
        if (isSessionError(error)) return Promise.reject(error);
        const originalRequest = error.config;
        const sessionVersion = (originalRequest as SessionRequestConfig | undefined)?._authSessionVersion;
        if (sessionVersion !== undefined && !isCurrentAuthSession(sessionVersion)) {
          return Promise.reject(staleSessionError());
        }

        // Handle CSRF token errors
        if (
          error.response?.status === 403 &&
          error.response?.data?.message?.includes('CSRF') &&
          originalRequest &&
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
          const apiError = this.createApiError(error);
          const path = originalRequest?.url?.split('?')[0]?.replace(/\/$/, '');
          // Failed credentials and manual logout do not expire another session.
          if (!/\/auth\/(login|sign-up|logout)$/.test(path || '')) {
            apiError.code = apiError.code === 'SESSION_REVOKED' ? 'SESSION_REVOKED' : 'SESSION_EXPIRED';
            apiError.message = apiError.code === 'SESSION_REVOKED'
              ? error.response.data?.error || error.response.data?.message || SESSION_REVOKED_MESSAGE
              : SESSION_EXPIRED_MESSAGE;
            reportAuthenticationFailure({
              version: sessionVersion ?? getAuthSessionVersion(),
              code: apiError.code,
              message: apiError.message,
            });
          }
          return Promise.reject(apiError);
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
          data?: { message?: string; error?: string; code?: string };
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
        apiError.code = axiosError.response.data?.code;
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
  private sessionConfig(config?: AxiosRequestConfig): SessionRequestConfig {
    return { ...config, _authSessionVersion: getAuthSessionVersion() };
  }

  async get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.get<T>(url, this.sessionConfig(config));
    return response.data;
  }

  async post<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response = await this.instance.post<T>(url, data, this.sessionConfig(config));
    return response.data;
  }

  async put<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response = await this.instance.put<T>(url, data, this.sessionConfig(config));
    return response.data;
  }

  async patch<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response = await this.instance.patch<T>(url, data, this.sessionConfig(config));
    return response.data;
  }

  async delete<T = unknown>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response = await this.instance.delete<T>(url, this.sessionConfig(config));
    return response.data;
  }

  // File upload with progress tracking
  async uploadFile<T = unknown>(
    url: string,
    file: File,
    onProgress?: (progress: number) => void,
    fieldName: string = 'file',
    additionalData?: Record<string, string>,
    method: 'post' | 'put' = 'post'
  ): Promise<T> {
    const formData = new FormData();
    formData.append(fieldName, file);
    
    // Add any additional form fields
    if (additionalData) {
      Object.entries(additionalData).forEach(([key, value]) => {
        formData.append(key, value);
      });
    }

    const response = await this.instance.request<T>(this.sessionConfig({
      method,
      url,
      data: formData,
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
    }));

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
