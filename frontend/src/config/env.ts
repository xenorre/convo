// Environment configuration with validation
const getEnvVar = (key: string, defaultValue?: string): string => {
  const value = import.meta.env[key] || defaultValue;
  if (!value && defaultValue === undefined) {
    console.warn(`Environment variable ${key} is not set`);
  }
  return value || '';
};

const MODE = import.meta.env.MODE;
const isProduction = MODE === 'production';

// Compute defaults with production-aware fallbacks
const defaultApi = isProduction ? `${window.location.origin}/api` : 'http://localhost:3000/api';
const defaultWs = isProduction ? window.location.origin : 'http://localhost:3000';

export const env = {
  // API Configuration
  apiUrl: getEnvVar('VITE_API_URL', defaultApi),
  wsUrl: getEnvVar('VITE_WS_URL', defaultWs),
  
  // Environment
  nodeEnv: getEnvVar('VITE_NODE_ENV', MODE),
  isDevelopment: MODE === 'development',
  isProduction,
  
  // Error Logging
  sentryDsn: getEnvVar('VITE_SENTRY_DSN', ''),
  logEndpoint: getEnvVar('VITE_LOG_ENDPOINT', ''),
  metricsEndpoint: getEnvVar('VITE_METRICS_ENDPOINT', ''),
  healthEndpoint: getEnvVar('VITE_HEALTH_ENDPOINT', ''),
  
  // App Configuration
  appName: getEnvVar('VITE_APP_NAME', 'ConvoChat'),
  maxMessageLength: parseInt(getEnvVar('VITE_MAX_MESSAGE_LENGTH', '2000')),
  maxFileSize: parseInt(getEnvVar('VITE_MAX_FILE_SIZE', '5242880')), // 5MB
} as const;

// Validation
if (!env.apiUrl || !env.wsUrl) {
  throw new Error('Required environment variables are missing. Check your .env file.');
}
