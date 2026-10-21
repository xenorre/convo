import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import toast from 'react-hot-toast';
import { DEFAULT_DEVICE_SETTINGS, useSettingsStore } from '@/store/useSettingsStore';
import { notifyIncomingMessage } from '../messageNotifications';
import { navigateInApp } from '../appNavigation';

vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(() => 'toast-id'), { dismiss: vi.fn() }) }));
vi.mock('../appNavigation', () => ({ navigateInApp: vi.fn() }));

const SystemNotification = vi.fn();
const message = { messageId: 'm1', senderName: 'Anna', preview: 'See you at 5', onOpen: vi.fn() };

function toastPreview() {
  const render = vi.mocked(toast).mock.calls[0][0] as (t: unknown) => { props: { preview: string } };
  return render({ id: 't', visible: true }).props.preview;
}

describe('incoming message alerts follow device settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState(DEFAULT_DEVICE_SETTINGS);
    vi.stubGlobal('Notification', Object.assign(SystemNotification, { permission: 'granted' }));
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows only the in-app pop-up by default', () => {
    notifyIncomingMessage(message);

    expect(toast).toHaveBeenCalledOnce();
    expect(toastPreview()).toBe('See you at 5');
    expect(SystemNotification).not.toHaveBeenCalled();
  });

  it('skips the pop-up when it is turned off', () => {
    useSettingsStore.setState({ messageToasts: false });

    expect(notifyIncomingMessage(message)).toBeUndefined();
    expect(toast).not.toHaveBeenCalled();
  });

  it('hides the message text everywhere when previews are off', () => {
    useSettingsStore.setState({ messagePreviews: false, desktopNotifications: true });

    notifyIncomingMessage(message);

    expect(toastPreview()).toBe('New message');
    expect(SystemNotification).toHaveBeenCalledWith('Anna', expect.objectContaining({ body: 'New message' }));
  });

  it('sends a system notification whenever the user is not looking at Convo', () => {
    useSettingsStore.setState({ desktopNotifications: true });
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);

    // Hidden tab.
    notifyIncomingMessage(message);
    expect(SystemNotification).toHaveBeenCalledExactlyOnceWith('Anna', {
      body: 'See you at 5', tag: 'msg-m1', icon: '/favicon.svg',
    });

    // Visible window behind another app.
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    hasFocus.mockReturnValue(false);
    notifyIncomingMessage({ ...message, messageId: 'm2' });
    expect(SystemNotification).toHaveBeenCalledTimes(2);

    // Looking at Convo.
    hasFocus.mockReturnValue(true);
    notifyIncomingMessage({ ...message, messageId: 'm3' });
    expect(SystemNotification).toHaveBeenCalledTimes(2);
  });

  it('opens the conversation when the system notification is clicked', () => {
    useSettingsStore.setState({ desktopNotifications: true });
    const instance: { onclick?: () => void; close: () => void } = { close: vi.fn() };
    SystemNotification.mockImplementationOnce(function () { return instance; });
    const focus = vi.spyOn(window, 'focus').mockImplementation(() => {});

    notifyIncomingMessage(message);
    instance.onclick!();

    expect(focus).toHaveBeenCalled();
    expect(instance.close).toHaveBeenCalled();
    expect(toast.dismiss).toHaveBeenCalledWith('msg-m1');
    expect(message.onOpen).toHaveBeenCalledOnce();
    expect(navigateInApp).toHaveBeenCalledWith('/');
  });

  it('never sends a system notification without browser permission', () => {
    useSettingsStore.setState({ desktopNotifications: true });
    vi.stubGlobal('Notification', Object.assign(vi.fn(), { permission: 'denied' }));

    notifyIncomingMessage(message);

    expect(toast).toHaveBeenCalledOnce();
  });
});
