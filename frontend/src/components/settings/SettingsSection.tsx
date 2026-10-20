import { ArrowLeftIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

// Same treatments as the existing "Find Contacts" button and ghost buttons.
export const primaryButtonClass =
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-5 py-2 text-sm font-medium text-cyan-300 transition-colors hover:bg-cyan-500/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-cyan-500/10";

export const secondaryButtonClass =
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-700/60 bg-slate-800/40 px-5 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700/50 hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 disabled:cursor-not-allowed disabled:opacity-50";

interface SettingsSectionProps {
  title: string;
  description: string;
  children: ReactNode;
}

// Right-hand panel of a settings section, laid out like the chat header.
export function SettingsSection({ title, description, children }: SettingsSectionProps) {
  return (
    <>
      <header className="flex min-h-20 shrink-0 items-center gap-2 border-b border-slate-700/50 bg-slate-800/35 px-3 py-3 sm:gap-3 sm:px-6">
        <Link
          to="/settings"
          aria-label="Back to settings"
          className="icon-button -ml-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 md:hidden"
        >
          <ArrowLeftIcon className="size-5" aria-hidden="true" />
        </Link>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-slate-100 sm:text-base">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-400">{description}</p>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-xl space-y-4">{children}</div>
      </div>
    </>
  );
}

interface SettingsCardProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function SettingsCard({ title, description, children }: SettingsCardProps) {
  return (
    <section className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-4 sm:p-5">
      <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
      {description && (
        <p className="mt-1 text-xs leading-relaxed text-slate-400">{description}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}
