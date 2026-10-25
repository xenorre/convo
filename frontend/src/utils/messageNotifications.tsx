import { MessageCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import MessageNotification from '@/components/MessageNotification';
import { useSettingsStore } from '@/store/useSettingsStore';
import { showSystemNotification } from '@/utils/systemNotifications';

const HIDDEN_PREVIEW = 'New message';

interface IncomingMessageOptions {
  messageId: string;
  senderName: string;
  preview: string;
  onOpen: () => void;
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
