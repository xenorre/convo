import toast from 'react-hot-toast';
import { navigateInApp } from '@/utils/appNavigation';
import { isWindowInView } from '@/utils/windowAttention';

export const canShowSystemNotifications = () => typeof Notification !== 'undefined';

interface SystemNotificationOptions {
  // Also the id of the matching in-app pop-up, which a click dismisses.
  tag: string;
  title: string;
  body: string;
  onOpen: () => void;
}

// Shown only while the user isn't looking at Convo (another tab, another app,
// or a minimized window). Clicking it brings Convo forward and runs `onOpen`
// on the chats page.
export function showSystemNotification({ tag, title, body, onOpen }: SystemNotificationOptions) {
  if (!canShowSystemNotifications() || Notification.permission !== 'granted') return false;
  if (isWindowInView()) return false;
  try {
    const notification = new Notification(title, { body, tag, icon: '/favicon.svg' });
    notification.onclick = () => {
      window.focus();
      notification.close();
      toast.dismiss(tag);
      onOpen();
      navigateInApp('/');
    };
    return true;
  } catch {
    // Some browsers only allow notifications from a service worker.
    return false;
  }
}
