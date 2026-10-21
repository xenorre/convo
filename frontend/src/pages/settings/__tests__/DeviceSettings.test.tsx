import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { DEFAULT_DEVICE_SETTINGS, useSettingsStore } from '@/store/useSettingsStore';
import NotificationsSettings from '../NotificationsSettings';
import PreferencesSettings from '../PreferencesSettings';

const renderIn = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

function stubNotification(permission: NotificationPermission, answer: NotificationPermission = permission) {
  const requestPermission = vi.fn(async () => answer);
  vi.stubGlobal('Notification', Object.assign(vi.fn(), { permission, requestPermission }));
  return requestPermission;
}

describe('device settings', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState(DEFAULT_DEVICE_SETTINGS);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('toggles message pop-ups and previews and remembers them on this device', async () => {
    stubNotification('default');
    const user = userEvent.setup();
    renderIn(<NotificationsSettings />);

    const popups = screen.getByRole('switch', { name: 'In-app pop-ups' });
    const previews = screen.getByRole('switch', { name: 'Show message text' });
    expect(popups).toHaveAttribute('aria-checked', 'true');

    await user.click(popups);
    await user.click(screen.getByText('Show message text'));

    expect(popups).toHaveAttribute('aria-checked', 'false');
    expect(previews).toHaveAttribute('aria-checked', 'false');
    expect(JSON.parse(localStorage.getItem('convo:device-settings')!).state).toMatchObject({
      messageToasts: false,
      messagePreviews: false,
    });
  });

  it('asks the browser for permission before turning on system notifications', async () => {
    const requestPermission = stubNotification('default', 'granted');
    const user = userEvent.setup();
    renderIn(<NotificationsSettings />);
    const toggle = screen.getByRole('switch', { name: 'System notifications' });

    await user.click(toggle);

    expect(requestPermission).toHaveBeenCalledOnce();
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(useSettingsStore.getState().desktopNotifications).toBe(true);
  });

  it('stays off and explains how to unblock when permission is refused', async () => {
    stubNotification('default', 'denied');
    const user = userEvent.setup();
    renderIn(<NotificationsSettings />);
    const toggle = screen.getByRole('switch', { name: 'System notifications' });

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAccessibleDescription(/blocked for Convo/);
    expect(useSettingsStore.getState().desktopNotifications).toBe(false);
  });

  it('shows system notifications as off when the browser no longer allows them', () => {
    stubNotification('denied');
    useSettingsStore.setState({ desktopNotifications: true });
    renderIn(<NotificationsSettings />);

    expect(screen.getByRole('switch', { name: 'System notifications' })).toHaveAttribute('aria-checked', 'false');
  });

  it('disables system notifications in browsers without support', () => {
    renderIn(<NotificationsSettings />);

    const toggle = screen.getByRole('switch', { name: 'System notifications' });
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAccessibleDescription(/doesn't support/);
  });

  it('picks an animation preference with the radio group', async () => {
    const user = userEvent.setup();
    renderIn(<PreferencesSettings />);

    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Reduce' }));

    expect(screen.getByRole('radio', { name: 'Reduce' })).toBeChecked();
    expect(useSettingsStore.getState().motion).toBe('reduce');

    await user.keyboard('{ArrowRight}');
    expect(useSettingsStore.getState().motion).toBe('full');
  });
});
