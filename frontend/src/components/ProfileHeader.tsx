import { useAuthStore } from "@/store/useAuthStore";
import { LogOutIcon, SettingsIcon, UserRoundIcon } from "lucide-react";
import { NavLink } from "react-router";

function ProfileHeader() {
  const { logout, authUser } = useAuthStore();
  return (
    <div className="border-b border-slate-700/50 px-4 py-4 sm:py-5">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="avatar avatar-online shrink-0">
            <div className="flex! size-11 items-center justify-center rounded-full bg-slate-700/70 ring-1 ring-slate-600/40">
              {authUser?.profilePic ? (
                <img
                  src={authUser.profilePic}
                  alt="Your avatar"
                  className="size-full object-cover"
                />
              ) : (
                <UserRoundIcon
                  className="size-5 text-slate-300"
                  aria-hidden="true"
                />
              )}
            </div>
          </div>
          <div className="min-w-0">
            <h3
              className="truncate text-sm font-semibold text-slate-100"
              title={authUser?.fullName}
            >
              {authUser?.fullName}
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">Online</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <NavLink
            to="settings"
            aria-label="Open settings"
            title="Settings"
            className="inline-flex size-11 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-700/50 hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
          >
            <SettingsIcon className="size-[18px]" aria-hidden="true" />
          </NavLink>
          <button
            type="button"
            aria-label="Log out"
            title="Log out"
            className="inline-flex size-11 cursor-pointer items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-700/50 hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
            onClick={logout}
          >
            <LogOutIcon className="size-[18px]" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default ProfileHeader;
