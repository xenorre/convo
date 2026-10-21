import { ArrowRight, MessageCircle } from 'lucide-react';
import { useNavigate } from 'react-router';
import toast from 'react-hot-toast';
import type { Toast } from 'react-hot-toast';
import { useSettingsStore } from '@/store/useSettingsStore';
import { showSystemNotification } from '@/utils/systemNotifications';

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

export function notifyIncomingMessage({ messageId, ...options }: IncomingMessageOptions) {
  const { messageToasts, messagePreviews, desktopNotifications } = useSettingsStore.getState();
  const preview = messagePreviews ? options.preview : HIDDEN_PREVIEW;

  if (desktopNotifications) {
    showSystemNotification({
      tag: `msg-${messageId}`,
      title: options.senderName,
      body: preview,
      onOpen: options.onOpen,
    });
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
