import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { DEFAULT_DEVICE_SETTINGS, useSettingsStore } from '@/store/useSettingsStore';
import { resolveReducedMotion, syncReducedMotionAttribute, useReducedMotion } from '../useReducedMotion';

let systemReduces = false;
const listeners = new Set<() => void>();

function setSystemMotion(reduce: boolean) {
  systemReduces = reduce;
  listeners.forEach(listener => listener());
}

describe('reduced motion preference', () => {
  beforeEach(() => {
    systemReduces = false;
    listeners.clear();
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      get matches() { return systemReduces; },
      addEventListener: (_: string, listener: (event: { matches: boolean }) => void) => {
        listeners.add(() => listener({ matches: systemReduces }));
      },
      removeEventListener: vi.fn(),
    })));
    useSettingsStore.setState(DEFAULT_DEVICE_SETTINGS);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('lets the device setting override the system preference', () => {
    expect(resolveReducedMotion('system', true)).toBe(true);
    expect(resolveReducedMotion('system', false)).toBe(false);
    expect(resolveReducedMotion('reduce', false)).toBe(true);
    expect(resolveReducedMotion('full', true)).toBe(false);
  });

  it('keeps the html attribute in sync with the setting and the system', () => {
    const root = document.createElement('html');
    const stop = syncReducedMotionAttribute(root);
    expect(root.dataset.reducedMotion).toBe('false');

    setSystemMotion(true);
    expect(root.dataset.reducedMotion).toBe('true');

    useSettingsStore.getState().updateSettings({ motion: 'full' });
    expect(root.dataset.reducedMotion).toBe('false');

    useSettingsStore.getState().updateSettings({ motion: 'reduce' });
    expect(root.dataset.reducedMotion).toBe('true');

    stop();
    useSettingsStore.getState().updateSettings({ motion: 'full' });
    expect(root.dataset.reducedMotion).toBe('true');
  });

  it('re-renders components when the setting changes', () => {
    systemReduces = true;
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);

    act(() => useSettingsStore.getState().updateSettings({ motion: 'full' }));
    expect(result.current).toBe(false);
  });
});
