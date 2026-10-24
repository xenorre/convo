import { UserRoundIcon } from "lucide-react";

interface AvatarProps {
  src?: string;
  // Omit to hide the presence dot.
  isOnline?: boolean;
  // "small" is the 32px version used in the minimized chats bar.
  size?: "regular" | "small";
}

// The 44px list avatar used across the sidebar, with an optional presence dot.
function Avatar({ src, isOnline, size = "regular" }: AvatarProps) {
  const presence = isOnline === undefined ? "" : isOnline ? "avatar-online" : "avatar-offline";
  const isSmall = size === "small";

  return (
    <div className={`avatar shrink-0 ${presence}`}>
      <div
        className={`flex! items-center justify-center rounded-full bg-slate-700/70 ring-1 ring-slate-600/40 ${isSmall ? "size-8" : "size-11"}`}
      >
        {src ? (
          <img src={src} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <UserRoundIcon className={`text-slate-300 ${isSmall ? "size-4" : "size-5"}`} aria-hidden="true" />
        )}
      </div>
    </div>
  );
}

export default Avatar;
