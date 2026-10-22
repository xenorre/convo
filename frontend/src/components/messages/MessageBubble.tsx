import { memo, useState } from "react";
import type { Message } from "@/types/message";
import { formatFullTimestamp, formatMessageTime } from "@/utils/chatTimestamp";
import { isPendingMessage } from "@/utils/messageEditing";
import MessageActions from "./MessageActions";
import MessageEditor from "./MessageEditor";

interface MessageBubbleProps {
  message: Message;
  myId: string;
  peerName: string;
}

function MessageBubble({ message, myId, peerName }: MessageBubbleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const isMine = message.senderId === myId;
  const isDeleted = Boolean(message.deletedAt);

  const tone = isDeleted
    ? "border border-slate-700/50 bg-transparent italic text-slate-400"
    : isMine
      ? "bg-cyan-700 text-white"
      : "border border-slate-700/50 bg-slate-800 text-slate-200";

  return (
    <div className={`group chat min-w-0 ${isMine ? "chat-end" : "chat-start"}`}>
      <div
        className={`chat-bubble relative min-w-0 max-w-[calc(100%-2.75rem)] rounded-2xl px-4 py-3 text-sm leading-relaxed [overflow-wrap:anywhere] sm:max-w-[80%] ${tone} ${
          isEditing ? "w-full" : ""
        }`}
      >
        {isDeleted ? (
          <p>{isMine ? "You deleted a message" : "Message deleted"}</p>
        ) : (
          <>
            {message.image && (
              <img src={message.image} alt="Shared" className="h-40 max-w-full rounded-xl object-cover sm:h-48" />
            )}
            {isEditing ? (
              <div className={message.image ? "mt-2" : ""}>
                <MessageEditor message={message} onDone={() => setIsEditing(false)} />
              </div>
            ) : (
              message.text && <p className={`${message.image ? "mt-2" : ""} whitespace-pre-wrap`}>{message.text}</p>
            )}
          </>
        )}
        <p className="mt-1.5 text-right text-[10px] leading-none not-italic opacity-65">
          {message.editedAt && !isDeleted && (
            <span title={`Edited ${formatFullTimestamp(message.editedAt)}`}>Edited · </span>
          )}
          {formatMessageTime(message.createdAt || new Date())}
        </p>

        {!isEditing && !isPendingMessage(message) && (
          <MessageActions
            message={message}
            isMine={isMine}
            myId={myId}
            peerName={peerName}
            onEdit={() => setIsEditing(true)}
          />
        )}
      </div>
    </div>
  );
}

// Typing in one message's editor or a new message arriving shouldn't redraw the rest.
export default memo(MessageBubble);
