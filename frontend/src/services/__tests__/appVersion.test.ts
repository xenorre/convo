import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_BUILD, isDifferentBuild, noteServerBuild, resetServerBuildNotice, useServerBuild } from '../appVersion';
import { announceNewVersion } from '@/utils/newVersionNotice';

vi.mock('@/utils/newVersionNotice', () => ({ announceNewVersion: vi.fn() }));

describe('server build', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetServerBuildNotice();
  });

  it('compares versions always, and commits only when both sides know theirs', () => {
    expect(isDifferentBuild({ version: '1.0.0', commit: null }, { version: '1.0.0', commit: null })).toBe(false);
    expect(isDifferentBuild({ version: '1.1.0', commit: null }, { version: '1.0.0', commit: null })).toBe(true);
    expect(isDifferentBuild({ version: '1.0.0', commit: 'bbb' }, { version: '1.0.0', commit: 'aaa' })).toBe(true);
    expect(isDifferentBuild({ version: '1.0.0', commit: 'bbb' }, { version: '1.0.0', commit: null })).toBe(false);
  });

  it('remembers what the server runs and stays quiet while it matches this tab', () => {
    noteServerBuild({ 'x-app-version': APP_BUILD.version });

    expect(useServerBuild.getState().build).toEqual({ version: APP_BUILD.version, commit: null });
    expect(announceNewVersion).not.toHaveBeenCalled();
  });

  it('offers a reload once when the server runs another build', () => {
    noteServerBuild({ 'x-app-version': '99.0.0', 'x-app-commit': 'abc1234' });
    noteServerBuild({ 'x-app-version': '99.0.0', 'x-app-commit': 'abc1234' });
    noteServerBuild({ 'x-app-version': '99.0.1' });

    expect(announceNewVersion).toHaveBeenCalledOnce();
    expect(useServerBuild.getState().build).toEqual({ version: '99.0.1', commit: null });
  });

  it('ignores answers without a version, such as network errors', () => {
    noteServerBuild(undefined);
    noteServerBuild({});
    expect(useServerBuild.getState().build).toBeNull();
    expect(announceNewVersion).not.toHaveBeenCalled();
  });
});
