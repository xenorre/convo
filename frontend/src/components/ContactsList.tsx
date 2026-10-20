import { useChatStore } from "@/store/useChatStore";
import { useEffect } from "react";
import UsersLoadingSkeleton from "./UsersLoadingSkeleton";
import { useAuthStore } from "@/store/useAuthStore";
import { UserRoundIcon } from "lucide-react";

function ContactsList() {
  const {
    getAllContacts,
    allContacts,
    isUsersLoading,
    selectedUser,
    setSelectedUser,
  } = useChatStore();

  const { onlineUsers } = useAuthStore();

  useEffect(() => {
    getAllContacts();
  }, [getAllContacts]);

  if (isUsersLoading) {
    return <UsersLoadingSkeleton />;
  }

  return (
    <>
      {allContacts.map((user) => (
        <button
          type="button"
          key={user._id}
          aria-pressed={selectedUser?._id === user._id}
          className={`w-full min-w-0 cursor-pointer rounded-xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 ${selectedUser?._id === user._id ? "border-cyan-400/25 bg-cyan-500/15" : "border-transparent bg-slate-800/30 hover:border-slate-600/40 hover:bg-slate-700/40"}`}
          onClick={() => setSelectedUser(user)}
        >
          <div className="flex min-w-0 items-center gap-3">
            <div
              className={`avatar shrink-0 ${
                onlineUsers.includes(user._id.toString())
                  ? "avatar-online"
                  : "avatar-offline"
              }`}
            >
              <div className="flex! size-11 items-center justify-center rounded-full bg-slate-700/70 ring-1 ring-slate-600/40">
                {user.profilePic ? (
                  <img
                    src={user.profilePic}
                    alt=""
                    loading="lazy"
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
            <div className="min-w-0 flex-1">
              <h4
                className="truncate text-sm font-medium text-slate-200"
                title={user.fullName}
              >
                {user.fullName}
              </h4>
              <p className="mt-1 text-xs text-slate-400">
                {onlineUsers.includes(user._id.toString())
                  ? "Online"
                  : "Offline"}
              </p>
            </div>
          </div>
        </button>
      ))}
    </>
  );
}

export default ContactsList;
