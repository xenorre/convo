import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock socket.io-client
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    connected: false,
  })),
}));

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
  },
  Toaster: () => null,
}));

// Mock environment variables
vi.mock('@/config/env', () => ({
  env: {
    apiUrl: 'http://localhost:3000/api',
    wsUrl: 'http://localhost:3000',
    isDevelopment: true,
    maxMessageLength: 2000,
    maxFileSize: 5242880,
  },
}));

// Global test utilities
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock File and FileReader
global.FileReader = class {
  onloadend: (() => void) | null = null;
  result: string | ArrayBuffer | null = null;
  
  readAsDataURL(_file: File) {
    setTimeout(() => {
      this.result = `data:image/jpeg;base64,${btoa('mock-image')}`;
      this.onloadend?.();
    });
  }
} as any;