import axios from "axios";
import { env } from "./env";

const axiosInstance = axios.create({
  baseURL: env.apiUrl,
  withCredentials: true,
  timeout: 10000, // 10 seconds timeout
});

// Request interceptor for logging in development
if (env.isDevelopment) {
  axiosInstance.interceptors.request.use(
    (config) => {
      console.log(`🚀 ${config.method?.toUpperCase()} ${config.url}`);
      return config;
    },
    (error) => {
      console.error('Request error:', error);
      return Promise.reject(error);
    }
  );

  axiosInstance.interceptors.response.use(
    (response) => {
      console.log(`✅ ${response.status} ${response.config.url}`);
      return response;
    },
    (error) => {
      console.error(`❌ ${error.response?.status || 'Network Error'} ${error.config?.url}`);
      return Promise.reject(error);
    }
  );
}

export default axiosInstance;
