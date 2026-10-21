import {
  ArrowLeftIcon,
  BellIcon,
  ChevronRightIcon,
  InfoIcon,
  KeyRoundIcon,
  ShieldIcon,
  SlidersHorizontalIcon,
  UserRoundIcon,
} from "lucide-react";
import { Link, NavLink } from "react-router";

const SETTINGS_SECTIONS = [
  { id: "profile", label: "Profile", description: "Photo and name", icon: UserRoundIcon },
  { id: "account", label: "Account", description: "Password and sign-in", icon: KeyRoundIcon },
  { id: "privacy", label: "Privacy", description: "Messages, requests, blocking", icon: ShieldIcon },
  { id: "notifications", label: "Notifications", description: "Message alerts", icon: BellIcon },
  { id: "preferences", label: "Preferences", description: "Animations", icon: SlidersHorizontalIcon },
  { id: "about", label: "About", description: "Version and shortcuts", icon: InfoIcon },
] as const;

const itemBase =
  "flex w-full min-w-0 items-center gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400";
const itemSelected = "border-cyan-400/25 bg-cyan-500/15";
const itemIdle =
  "border-transparent bg-slate-800/30 hover:border-slate-600/40 hover:bg-slate-700/40";
// /settings shows the first section on desktop, so it looks selected there only.
const itemImplicit = `${itemIdle} md:border-cyan-400/25 md:bg-cyan-500/15`;

function SettingsNav({ activeSection }: { activeSection?: string }) {
  return (
    <>
      <div className="border-b border-slate-700/50 px-4 py-4 sm:py-5">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            to="/"
            aria-label="Back to chats"
            title="Back to chats"
            className="icon-button -ml-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
          >
            <ArrowLeftIcon className="size-5" aria-hidden="true" />
          </Link>
          <h1 className="truncate text-base font-semibold text-slate-100">Settings</h1>
        </div>
      </div>

      <nav
        aria-label="Settings sections"
        className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 pb-4 pt-4 sm:px-4"
      >
        {SETTINGS_SECTIONS.map(({ id, label, description, icon: Icon }, index) => (
          <NavLink
            key={id}
            to={`/settings/${id}`}
            className={({ isActive }) =>
              `${itemBase} ${
                isActive ? itemSelected : !activeSection && index === 0 ? itemImplicit : itemIdle
              }`
            }
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-slate-700/70 ring-1 ring-slate-600/40">
              <Icon className="size-5 text-slate-300" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-200">{label}</span>
              <span className="mt-1 block truncate text-xs text-slate-400">{description}</span>
            </span>
            <ChevronRightIcon className="size-4 shrink-0 text-slate-400 md:hidden" aria-hidden="true" />
          </NavLink>
        ))}
      </nav>
    </>
  );
}

export default SettingsNav;
