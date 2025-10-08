import { ENV } from "#config/env.js";
import logger from "#config/logger.js";

/**
 * Production-ready CORS configuration
 * Follows security best practices for different environments
 */

const getAllowedOrigins = () => {
  const origins = [];
  
  // Development origins
  if (ENV.NODE_ENV === 'development') {
    origins.push(
      /^https?:\/\/localhost:\d+$/,
      /^https?:\/\/127\.0\.0\.1:\d+$/,
      /^https?:\/\/192\.168\.\d+\.\d+:\d+$/,
      /^https?:\/\/10\.\d+\.\d+\.\d+:\d+$/,
      /^https?:\/\/172\.(1[6-9]|2[0-9]|3[01])\.\d+\.\d+:\d+$/
    );
  }
  
  // Production origins
  if (ENV.CLIENT_URL) {
    // Handle multiple client URLs separated by commas
    const clientUrls = ENV.CLIENT_URL.split(',').map(url => url.trim());
    origins.push(...clientUrls);
  }
  
  // Preview/staging origins
  if (ENV.PREVIEW_URL) {
    const previewUrls = ENV.PREVIEW_URL.split(',').map(url => url.trim());
    origins.push(...previewUrls);
  }
  
  return origins;
};

const isOriginAllowed = (origin, allowedOrigins) => {
  if (!origin) {
    // Allow requests with no origin (mobile apps, server-to-server, etc.)
    return ENV.NODE_ENV === 'development';
  }
  
  return allowedOrigins.some(allowedOrigin => {
    if (typeof allowedOrigin === 'string') {
      return allowedOrigin === origin;
    }
    if (allowedOrigin instanceof RegExp) {
      return allowedOrigin.test(origin);
    }
    return false;
  });
};

export const corsConfig = {
  origin: function (origin, callback) {
    const allowedOrigins = getAllowedOrigins();
    
    if (isOriginAllowed(origin, allowedOrigins)) {
      logger.debug(`CORS: Allowing origin ${origin || 'no-origin'}`);
      callback(null, true);
    } else {
      logger.warn(`CORS: Blocking origin ${origin}`, {
        origin,
        allowedOrigins: allowedOrigins.map(o => o.toString()),
        environment: ENV.NODE_ENV
      });
      callback(new Error(`CORS policy violation: Origin ${origin} not allowed`));
    }
  },
  
  credentials: true,
  
  methods: [
    'GET',
    'POST', 
    'PUT', 
    'PATCH', 
    'DELETE', 
    'OPTIONS',
    'HEAD'
  ],
  
  allowedHeaders: [
    // Standard headers
    'Content-Type',
    'Authorization',
    'Accept',
    'Accept-Language',
    'Accept-Encoding',
    
    // Custom headers
    'x-csrf-token',
    'x-request-id',
    'x-client-version',
    'x-api-version',
    
    // Cache control
    'Cache-Control',
    'If-None-Match',
    'If-Modified-Since'
  ],
  
  exposedHeaders: [
    'x-request-id',
    'x-ratelimit-limit',
    'x-ratelimit-remaining',
    'x-ratelimit-reset',
    'x-total-count',
    'link'
  ],
  
  optionsSuccessStatus: 200,
  
  // Cache preflight requests for 24 hours in production
  maxAge: ENV.NODE_ENV === 'production' ? 86400 : 0
};

// Rate limiting configuration for CORS preflight requests
export const preflightRateLimit = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: ENV.NODE_ENV === 'production' ? 100 : 1000, // Limit per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too Many Requests',
    message: 'Too many preflight requests from this IP'
  }
};

// Security headers configuration
export const securityHeaders = {
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ENV.NODE_ENV === 'development' 
        ? ["'self'", "'unsafe-inline'", "'unsafe-eval'"]
        : ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "data:", "https:"],
      connectSrc: ENV.NODE_ENV === 'development'
        ? ["'self'", "ws:", "wss:", "http:", "https:"]
        : ["'self'", "wss:", "https:"],
      mediaSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'self'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"]
    }
  },
  
  // Cross-Origin policies
  crossOriginEmbedderPolicy: ENV.NODE_ENV === 'production',
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "same-origin" },
  
  // Transport security
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  
  // Other security headers
  noSniff: true,
  frameguard: { action: 'sameorigin' },
  xssFilter: false, // Modern browsers handle this
  referrerPolicy: { policy: "strict-origin-when-cross-origin" }
};

// Trusted proxies configuration
export const trustedProxies = ENV.NODE_ENV === 'production' 
  ? [
      // Common cloud provider IP ranges
      '10.0.0.0/8',
      '172.16.0.0/12', 
      '192.168.0.0/16',
      
      // Add your specific proxy IPs here
      // AWS ALB: '172.31.0.0/16'
      // Cloudflare: 'cloudflare'
      // '1.2.3.4'
    ]
  : true; // Trust all in development

export default corsConfig;