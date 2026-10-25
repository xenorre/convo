import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAuthStore } from '@/store/useAuthStore';
import type { AppSocket } from '@/types/socket';
import { useConnectionStatus } from '@/hooks/useConnectionStatus';

type Handler = (...args: unknown[]) => void;

// Just enough of an emitter to tell the socket's events from its Manager's.
const emitter = () => {
  const handlers = new Map<string, Set<Handler>>();
  return {
    on(event: string, handler: Handler) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
    },
    off(event: string, handler: Handler) {
      handlers.get(event)?.delete(handler);
    },
    fire(event: string, ...args: unknown[]) {
      handlers.get(event)?.forEach((handler) => handler(...args));
    },
    count: () => [...handlers.values()].reduce((total, set) => total + set.size, 0),
  };
};

describe('useConnectionStatus', () => {
  let socket: ReturnType<typeof emitter> & { connected: boolean; io: ReturnType<typeof emitter> };

  beforeEach(() => {
    socket = Object.assign(emitter(), { connected: true, io: emitter() });
    useAuthStore.setState({ socket: socket as unknown as AppSocket });
  });

  afterEach(() => {
    useAuthStore.setState({ socket: null });
  });

  it('shows reconnecting while the Manager retries, and recovers on connect', () => {
    const { result } = renderHook(() => useConnectionStatus());
    expect(result.current).toEqual({ isConnected: true, isReconnecting: false, connectionError: null });

    act(() => socket.fire('disconnect'));
    expect(result.current).toMatchObject({ isConnected: false, connectionError: 'Connection lost' });

    act(() => socket.io.fire('reconnect_attempt', 1));
    expect(result.current).toMatchObject({ isReconnecting: true, connectionError: null });

    act(() => socket.fire('connect'));
    expect(result.current).toEqual({ isConnected: true, isReconnecting: false, connectionError: null });
  });

  it('says reconnecting failed once the Manager gives up', () => {
    const { result } = renderHook(() => useConnectionStatus());

    act(() => socket.fire('disconnect'));
    act(() => socket.io.fire('reconnect_attempt', 1));
    act(() => socket.io.fire('reconnect_failed'));

    expect(result.current).toMatchObject({
      isConnected: false,
      isReconnecting: false,
      connectionError: 'Failed to reconnect',
    });
  });

  it('removes every listener it added', () => {
    const { unmount } = renderHook(() => useConnectionStatus());
    expect(socket.count()).toBeGreaterThan(0);
    expect(socket.io.count()).toBeGreaterThan(0);

    unmount();

    expect(socket.count()).toBe(0);
    expect(socket.io.count()).toBe(0);
  });
});
