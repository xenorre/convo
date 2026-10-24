// Three dots in an incoming-message bubble while the other person types.
// The dots bounce unless motion is reduced (index.css stops animate-bounce).
function TypingIndicator({ name }: { name: string }) {
  return (
    <div className="chat chat-start min-w-0">
      <div
        role="img"
        aria-label={`${name} is typing`}
        className="chat-bubble flex min-h-0 items-center gap-1 rounded-2xl border border-slate-700/50 bg-slate-800 px-4 py-3.5"
      >
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            aria-hidden="true"
            className="size-1.5 animate-bounce rounded-full bg-slate-400"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

export default TypingIndicator;
