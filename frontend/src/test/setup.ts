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
    dismiss: vi.fn(),
  },
  Toaster: () => null,
}));

// Mock environment variables
vi.mock('@/config/env', () => ({
  env: {
    apiUrl: 'http://localhost:3000/api',
    apiBaseUrl: 'http://localhost:3000/api/v1',
    wsUrl: 'http://localhost:3000',
    isDevelopment: true,
    maxMessageLength: 2000,
  },
}));

// Global test utilities
globalThis.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock IntersectionObserver
globalThis.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock File and FileReader
globalThis.FileReader = class {
  onloadend: (() => void) | null = null;
  result: string | ArrayBuffer | null = null;
  
  readAsDataURL() {
    setTimeout(() => {
      this.result = `data:image/jpeg;base64,${btoa('mock-image')}`;
      this.onloadend?.();
    });
  }
} as unknown as typeof FileReader;
