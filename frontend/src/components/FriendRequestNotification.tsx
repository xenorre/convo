import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router';
import toast from 'react-hot-toast';
import type { Toast } from 'react-hot-toast';
import { showFriendsTab } from '@/utils/showFriendsTab';

function FriendRequestNotification({ notification, senderName }: { notification: Toast; senderName: string }) {
  const navigate = useNavigate();

  const view = () => {
    void showFriendsTab();
    navigate('/');
    toast.dismiss(notification.id);
  };

  return (
    <button
      type="button"
      className="app-toast__action"
      aria-label={`${senderName} sent you a friend request. View requests`}
      disabled={!notification.visible}
      onClick={view}
    >
      <span className="font-medium text-slate-200">{senderName}</span> sent you a friend request
      <span className="app-toast__action-hint" aria-hidden="true">
        View <ArrowRight size={13} />
      </span>
    </button>
  );
}

export default FriendRequestNotification;
