import { Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import NewVersionNotification from '@/components/NewVersionNotification';

// Stays until the user reloads or dismisses it: an old tab keeps working,
// but may not match what the server now expects.
export function announceNewVersion() {
  return toast((notification) => <NewVersionNotification notification={notification} />, {
    id: 'new-version',
    duration: Infinity,
    icon: <Sparkles size={20} strokeWidth={1.8} />,
  });
}
