import { useChatStore } from "@/store/useChatStore";
import { useEffect } from "react";
import UsersLoadingSkeleton from "./UsersLoadingSkeleton";
import { useAuthStore } from "@/store/useAuthStore";

function ContactsList() {
  const { getAllContacts, allContacts, isUsersLoading, setSelectedUser } =
    useChatStore();

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
        <div
          key={user._id}
          className="bg-cyan-500/10 p-4 rounded-lg cursor-pointer hover:bg-cyan-500/20 transition-colors"
          onClick={() => setSelectedUser(user)}
        >
          <div className="flex items-center gap-3">
            <div
              className={`avatar ${
                onlineUsers.includes(user._id.toString())
                  ? "avatar-online"
                  : "avatar-offline"
              }`}
            >
              <div className="size-12 rounded-full">
                <img src={user.profilePic} alt={user.fullName} />
              </div>
            </div>
            <h4 className="text-slate-200 font-medium truncate">
              {user.fullName}
            </h4>
          </div>
        </div>
      ))}
    </>
  );
}

export default ContactsList;
