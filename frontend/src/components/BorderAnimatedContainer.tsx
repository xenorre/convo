import type { ReactNode } from "react";

function BorderAnimatedContainer({ children }: { children: ReactNode }) {
  return (
    <div className="surface-panel flex h-full min-h-0 w-full min-w-0 overflow-hidden rounded-2xl border border-transparent shadow-2xl shadow-slate-950/40 sm:rounded-3xl">
      {children}
    </div>
  );
}

export default BorderAnimatedContainer;
