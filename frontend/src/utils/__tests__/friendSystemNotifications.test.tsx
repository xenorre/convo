import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import toast from 'react-hot-toast';
import { DEFAULT_DEVICE_SETTINGS, useSettingsStore } from '@/store/useSettingsStore';
import { notifyFriendRequest } from '../friendNotifications';
import { navigateInApp } from '../appNavigation';
import { showFriendsTab } from '../showFriendsTab';

vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(() => 'id'), { dismiss: vi.fn() }) }));
vi.mock('../appNavigation', () => ({ navigateInApp: vi.fn() }));
vi.mock('../showFriendsTab', () => ({ showFriendsTab: vi.fn(async () => {}) }));

const SystemNotification = vi.fn();
const request = { friendRequestId: 'r1', user: { _id: 'gosia', fullName: 'Gosia Wrona', profilePic: '' }, createdAt: 'now' };

describe('friend request system notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({ ...DEFAULT_DEVICE_SETTINGS, desktopNotifications: true });
    vi.stubGlobal('Notification', Object.assign(SystemNotification, { permission: 'granted' }));
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows one while Convo is out of view and opens the requests on click', () => {
    const instance: { onclick?: () => void; close: () => void } = { close: vi.fn() };
    SystemNotification.mockImplementationOnce(function () { return instance; });
    vi.spyOn(window, 'focus').mockImplementation(() => {});

    notifyFriendRequest(request);
    expect(SystemNotification).toHaveBeenCalledWith('Gosia Wrona', {
      body: 'Sent you a friend request', tag: 'friend-request-r1', icon: '/favicon.svg',
    });
    expect(toast).toHaveBeenCalledOnce();

    instance.onclick!();
    expect(toast.dismiss).toHaveBeenCalledWith('friend-request-r1');
    expect(showFriendsTab).toHaveBeenCalledOnce();
    expect(navigateInApp).toHaveBeenCalledWith('/');
  });

  it('stays in the app while the user is looking at Convo', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);

    notifyFriendRequest(request);

    expect(SystemNotification).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledOnce();
  });

  it('follows both the friend request and the system notification settings', () => {
    useSettingsStore.setState({ desktopNotifications: false });
    notifyFriendRequest(request);
    expect(SystemNotification).not.toHaveBeenCalled();

    useSettingsStore.setState({ desktopNotifications: true, friendRequestToasts: false });
    notifyFriendRequest(request);
    expect(SystemNotification).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledOnce();
  });
});
