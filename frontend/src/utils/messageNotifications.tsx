import { ArrowRight, MessageCircle } from 'lucide-react';
import { useNavigate } from 'react-router';
import toast from 'react-hot-toast';
import type { Toast } from 'react-hot-toast';
import { useSettingsStore } from '@/store/useSettingsStore';
import { navigateInApp } from '@/utils/appNavigation';
import { isWindowInView } from '@/utils/windowAttention';

const HIDDEN_PREVIEW = 'New message';

interface IncomingMessageOptions {
  messageId: string;
  senderName: string;
  preview: string;
  onOpen: () => void;
}

function MessageNotification({
  notification,
  senderName,
  preview,
  onOpen,
}: Omit<IncomingMessageOptions, 'messageId'> & { notification: Toast }) {
  const navigate = useNavigate();

  const openChat = () => {
    onOpen();
    navigate('/');
    toast.dismiss(notification.id);
  };

  return (
    <button
      type="button"
      className="app-toast__action"
      aria-label={`Open chat with ${senderName}. ${preview}`}
      disabled={!notification.visible}
      onClick={openChat}
    >
      <span className="font-medium text-slate-200">{senderName}</span>: {preview}
      <span className="app-toast__action-hint" aria-hidden="true">
        Open chat <ArrowRight size={13} />
      </span>
    </button>
  );
}

export const canShowSystemNotifications = () => typeof Notification !== 'undefined';

// Only while the user isn't looking at Convo (another tab, another app, or a
// minimized window). Clicking it brings Convo forward on that conversation.
function showSystemNotification(
  messageId: string,
  senderName: string,
  body: string,
  onOpen: () => void,
) {
  if (!canShowSystemNotifications() || Notification.permission !== 'granted') return;
  if (isWindowInView()) return;
  try {
    const notification = new Notification(senderName, { body, tag: `msg-${messageId}`, icon: '/favicon.svg' });
    notification.onclick = () => {
      window.focus();
      notification.close();
      toast.dismiss(`msg-${messageId}`);
      onOpen();
      navigateInApp('/');
    };
  } catch {
    // Some browsers only allow notifications from a service worker.
  }
}

export function notifyIncomingMessage({ messageId, ...options }: IncomingMessageOptions) {
  const { messageToasts, messagePreviews, desktopNotifications } = useSettingsStore.getState();
  const preview = messagePreviews ? options.preview : HIDDEN_PREVIEW;

  if (desktopNotifications) {
    showSystemNotification(messageId, options.senderName, preview, options.onOpen);
  }
  if (!messageToasts) return undefined;

  return toast(
    notification => <MessageNotification notification={notification} {...options} preview={preview} />,
    {
      id: `msg-${messageId}`,
      duration: 4000,
      icon: <MessageCircle size={20} strokeWidth={1.8} />,
    }
  );
}
