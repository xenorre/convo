import { UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import FriendRequestNotification from '@/components/FriendRequestNotification';
import { useSettingsStore } from '@/store/useSettingsStore';
import type { FriendRequest } from '@/types/friends';
import { showFriendsTab } from '@/utils/showFriendsTab';
import { showSystemNotification } from '@/utils/systemNotifications';

export function notifyFriendRequest(request: FriendRequest) {
  const { friendRequestToasts, desktopNotifications } = useSettingsStore.getState();
  if (!friendRequestToasts) return undefined;

  const id = `friend-request-${request.friendRequestId}`;
  if (desktopNotifications) {
    showSystemNotification({
      tag: id,
      title: request.user.fullName,
      body: 'Sent you a friend request',
      onOpen: () => void showFriendsTab(),
    });
  }

  return toast(
    notification => <FriendRequestNotification notification={notification} senderName={request.user.fullName} />,
    {
      id,
      duration: 6000,
      icon: <UserPlus size={20} strokeWidth={1.8} />,
    },
  );
}
