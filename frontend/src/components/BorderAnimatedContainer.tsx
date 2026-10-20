import type { ReactNode } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

function BorderAnimatedContainer({ children }: { children: ReactNode }) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div
      className={`flex h-full min-h-0 w-full min-w-0 overflow-hidden rounded-2xl border border-transparent shadow-2xl shadow-slate-950/40 sm:rounded-3xl ${
        prefersReducedMotion
          ? "bg-slate-800 border-white/15"
          : "[background:linear-gradient(45deg,#172033,theme(colors.slate.800)_50%,#172033)_padding-box,conic-gradient(from_var(--border-angle),theme(colors.slate.600/.48)_80%,_theme(colors.cyan.500)_86%,_theme(colors.cyan.300)_90%,_theme(colors.cyan.500)_94%,_theme(colors.slate.600/.48))_border-box] animate-border"
      }`}
    >
      {children}
    </div>
  );
}

export default BorderAnimatedContainer;
