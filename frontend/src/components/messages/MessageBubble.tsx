import { memo, useState } from "react";
import { CheckCheckIcon, CheckIcon, Clock3Icon } from "lucide-react";
import type { Message } from "@/types/message";
import { formatFullTimestamp, formatMessageTime } from "@/utils/chatTimestamp";
import { isPendingMessage } from "@/utils/messageEditing";
import MessageActions from "./MessageActions";
import MessageEditor from "./MessageEditor";

interface MessageBubbleProps {
  message: Message;
  myId: string;
  peerName: string;
  // The newest of my messages they have read gets "Read 18:42" beneath it.
  showReadTime?: boolean;
}

// ✓ sent, ✓✓ read, a clock while it is still being sent. The shapes differ,
// so the state doesn't depend on colour alone.
function DeliveryMark({ message }: { message: Message }) {
  if (isPendingMessage(message)) {
    return (
      <span title="Sending" className="inline-flex">
        <Clock3Icon className="size-3" aria-hidden="true" />
        <span className="sr-only">Sending</span>
      </span>
    );
  }
  if (message.readAt) {
    const readLabel = `Read ${formatFullTimestamp(message.readAt)}`;
    return (
      <span title={readLabel} className="inline-flex text-cyan-100">
        <CheckCheckIcon className="size-3.5" aria-hidden="true" />
        <span className="sr-only">{readLabel}</span>
      </span>
    );
  }
  return (
    <span title="Sent" className="inline-flex">
      <CheckIcon className="size-3.5" aria-hidden="true" />
      <span className="sr-only">Sent</span>
    </span>
  );
}

function MessageBubble({ message, myId, peerName, showReadTime = false }: MessageBubbleProps) {
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
        <p className="mt-1.5 flex items-center justify-end gap-1 text-[10px] leading-none not-italic">
          <span className="opacity-65">
            {message.editedAt && !isDeleted && (
              <span title={`Edited ${formatFullTimestamp(message.editedAt)}`}>Edited · </span>
            )}
            {formatMessageTime(message.createdAt || new Date())}
          </span>
          {isMine && !isDeleted && (
            <span className={message.readAt ? "" : "opacity-65"}>
              <DeliveryMark message={message} />
            </span>
          )}
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
      {showReadTime && message.readAt && (
        <div className="chat-footer mt-1 text-[10px] text-slate-400">
          Read {formatMessageTime(message.readAt)}
        </div>
      )}
    </div>
  );
}

// Typing in one message's editor or a new message arriving shouldn't redraw the rest.
export default memo(MessageBubble);
