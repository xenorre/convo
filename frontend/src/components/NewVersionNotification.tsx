import { RefreshCw } from 'lucide-react';
import type { Toast } from 'react-hot-toast';

function NewVersionNotification({ notification }: { notification: Toast }) {
  return (
    <button
      type="button"
      className="app-toast__action"
      aria-label="A new version of Convo is available. Reload to use it"
      disabled={!notification.visible}
      onClick={() => window.location.reload()}
    >
      A new version of Convo is available
      <span className="app-toast__action-hint" aria-hidden="true">
        Reload <RefreshCw size={13} />
      </span>
    </button>
  );
}

export default NewVersionNotification;
