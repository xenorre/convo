function MessagesLoadingSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-3xl space-y-5"
      role="status"
      aria-label="Loading messages"
    >
      {[...Array(6)].map((_, idx) => (
        <div
          key={idx}
          className={`flex animate-pulse ${idx % 2 === 0 ? "justify-start" : "justify-end"}`}
          aria-hidden="true"
        >
          <div
            className={`w-[62%] max-w-64 rounded-2xl border border-slate-700/30 bg-slate-800/65 p-4 ${idx % 2 === 0 ? "rounded-bl-md" : "rounded-br-md"}`}
          >
            <div className="h-2.5 w-4/5 rounded-full bg-slate-700/65" />
            {idx % 3 !== 0 && (
              <div className="mt-2 h-2.5 w-3/5 rounded-full bg-slate-700/45" />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default MessagesLoadingSkeleton;
