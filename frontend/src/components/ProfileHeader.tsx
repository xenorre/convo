import { useAuthStore } from '@/store/useAuthStore';
import { LogOutIcon, SettingsIcon } from 'lucide-react';
import { NavLink } from 'react-router';

function ProfileHeader() {
  const { logout, authUser } = useAuthStore();
  return (
    <div className="p-6 border-b border-slate-700/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="avatar avatar-online">
            <div className="w-14 rounded-full">
              <img src={authUser?.profilePic} alt="Avatar" />
            </div>
          </div>
          <div>
            <h3 className="text-base font-medium text-slate-200 max-w-[120px] truncate">
              {authUser?.fullName}
            </h3>
            <p className="text-xs text-slate-400">Online</p>
          </div>
        </div>
        <div className="flex gap-4 items-center">
          <NavLink
            to="settings"
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            <SettingsIcon className="size-5" />
          </NavLink>
          <button
            className="text-slate-400 cursor-pointer hover:text-slate-200 transition-colors"
            onClick={logout}
          >
            <LogOutIcon className="size-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default ProfileHeader;
