import type { ReactNode } from "react";

interface PersonRowProps {
  avatar: ReactNode;
  name: string;
  detail: ReactNode;
  children?: ReactNode;
}

// A non-clickable row with the chat list's card look; `children` are actions.
function PersonRow({ avatar, name, detail, children }: PersonRowProps) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-transparent bg-slate-800/30 p-3">
      {avatar}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-200" title={name}>
          {name}
        </p>
        <p className="mt-1 truncate text-xs text-slate-400">{detail}</p>
      </div>
      {children && <div className="flex shrink-0 items-center gap-1">{children}</div>}
    </div>
  );
}

export default PersonRow;
