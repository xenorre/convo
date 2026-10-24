import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAuthStore } from '@/store/useAuthStore';
import type { AppSocket } from '@/types/socket';
import { TYPING_IDLE_MS, TYPING_REPEAT_MS, useTypingSignal } from '@/hooks/useTypingSignal';

describe('useTypingSignal', () => {
  const emit = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    emit.mockReset();
    useAuthStore.setState({ socket: { connected: true, emit } as unknown as AppSocket });
  });

  afterEach(() => {
    vi.useRealTimers();
    useAuthStore.setState({ socket: null });
  });

  const sent = () => emit.mock.calls.map(([, payload]) => payload.isTyping);

  it('says typing once, repeats it while typing goes on, and stops when idle', () => {
    const { result } = renderHook(() => useTypingSignal('anna'));

    act(() => result.current.onInput('H'));
    act(() => result.current.onInput('He'));
    expect(emit).toHaveBeenCalledWith('typing', { to: 'anna', isTyping: true });
    expect(sent()).toEqual([true]);

    act(() => vi.advanceTimersByTime(TYPING_REPEAT_MS));
    act(() => result.current.onInput('Hel'));
    expect(sent()).toEqual([true, true]);

    act(() => vi.advanceTimersByTime(TYPING_IDLE_MS));
    expect(sent()).toEqual([true, true, false]);
  });

  it('stops when the text is cleared, sent, or the conversation closes', () => {
    const { result, unmount } = renderHook(() => useTypingSignal('anna'));

    act(() => result.current.onInput('Hi'));
    act(() => result.current.onInput(''));
    act(() => result.current.onInput('Hi again'));
    act(() => result.current.stop());
    act(() => result.current.onInput('One more'));
    unmount();

    expect(sent()).toEqual([true, false, true, false, true, false]);
  });

  it('sends nothing while offline, and no stop without a start', () => {
    useAuthStore.setState({ socket: { connected: false, emit } as unknown as AppSocket });
    const { result } = renderHook(() => useTypingSignal('anna'));

    act(() => result.current.onInput('Hi'));
    useAuthStore.setState({ socket: { connected: true, emit } as unknown as AppSocket });
    act(() => result.current.stop());
    act(() => result.current.stop());

    expect(sent()).toEqual([false]);
  });
});
