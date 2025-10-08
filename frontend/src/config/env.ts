// Environment configuration with validation
const getEnvVar = (key: string, defaultValue?: string): string => {
  const value = import.meta.env[key] || defaultValue;
  if (!value && !defaultValue) {
    console.warn(`Environment variable ${key} is not set`);
  }
  return value || '';
};

export const env = {
  // API Configuration
  apiUrl: getEnvVar('VITE_API_URL', 'http://localhost:3000/api'),
  wsUrl: getEnvVar('VITE_WS_URL', 'http://localhost:3000'),
  
  // Environment
  nodeEnv: getEnvVar('VITE_NODE_ENV', import.meta.env.MODE),
  isDevelopment: import.meta.env.MODE === 'development',
  isProduction: import.meta.env.MODE === 'production',
  
  // Error Logging
  sentryDsn: getEnvVar('VITE_SENTRY_DSN'),
  
  // App Configuration
  appName: getEnvVar('VITE_APP_NAME', 'ConvoChat'),
  maxMessageLength: parseInt(getEnvVar('VITE_MAX_MESSAGE_LENGTH', '2000')),
  maxFileSize: parseInt(getEnvVar('VITE_MAX_FILE_SIZE', '5242880')), // 5MB
} as const;

// Validation
if (!env.apiUrl || !env.wsUrl) {
  throw new Error('Required environment variables are missing. Check your .env file.');
}