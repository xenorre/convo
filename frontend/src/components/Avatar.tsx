import { UserRoundIcon } from "lucide-react";

interface AvatarProps {
  src?: string;
  // Omit to hide the presence dot.
  isOnline?: boolean;
}

// The 44px list avatar used across the sidebar, with an optional presence dot.
function Avatar({ src, isOnline }: AvatarProps) {
  const presence = isOnline === undefined ? "" : isOnline ? "avatar-online" : "avatar-offline";

  return (
    <div className={`avatar shrink-0 ${presence}`}>
      <div className="flex! size-11 items-center justify-center rounded-full bg-slate-700/70 ring-1 ring-slate-600/40">
        {src ? (
          <img src={src} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <UserRoundIcon className="size-5 text-slate-300" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}

export default Avatar;
