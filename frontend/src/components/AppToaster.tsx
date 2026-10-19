import { Check, CircleAlert, Info, LoaderCircle, X } from 'lucide-react';
import toast, { resolveValue, Toaster } from 'react-hot-toast';
import type { Toast } from 'react-hot-toast';

const variants = {
  success: { title: 'All set', Icon: Check },
  error: { title: 'Needs your attention', Icon: CircleAlert },
  loading: { title: 'Working on it', Icon: LoaderCircle },
  blank: { title: 'Heads up', Icon: Info },
  custom: { title: 'Heads up', Icon: Info },
};

function Notification({ notification }: { notification: Toast }) {
  const { title, Icon } = variants[notification.type];

  return (
    <div
      className={`app-toast ${notification.className || ''}`}
      data-type={notification.type}
      data-visible={notification.visible}
      style={notification.style}
    >
      <span className="app-toast__icon" aria-hidden="true">
        {notification.icon !== undefined ? notification.icon : (
          <Icon
            size={20}
            strokeWidth={1.8}
            className={notification.type === 'loading' ? 'animate-spin' : undefined}
          />
        )}
      </span>
      <div className="app-toast__content" {...notification.ariaProps} aria-atomic="true">
        <p className="app-toast__title">{title}</p>
        <div className="app-toast__message">
          {resolveValue(notification.message, notification)}
        </div>
      </div>
      <button
        type="button"
        className="app-toast__close"
        aria-label="Dismiss notification"
        disabled={!notification.visible}
        onClick={() => toast.dismiss(notification.id)}
      >
        <X size={16} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </div>
  );
}

export function AppToaster() {
  return (
    <Toaster
      position="bottom-right"
      gutter={12}
      containerClassName="app-toaster"
      containerStyle={{
        top: 'max(20px, env(safe-area-inset-top))',
        right: 'max(16px, env(safe-area-inset-right))',
        left: 'max(16px, env(safe-area-inset-left))',
        bottom: 'max(16px, env(safe-area-inset-bottom))',
      }}
      toastOptions={{
        duration: 5000,
        removeDelay: 200,
        success: { duration: 4000 },
        error: { duration: 6000 },
        loading: { duration: Infinity },
      }}
    >
      {notification => <Notification notification={notification} />}
    </Toaster>
  );
}
