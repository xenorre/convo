function UsersLoadingSkeleton() {
  return (
    <div className="space-y-2" role="status" aria-label="Loading">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="animate-pulse rounded-xl border border-transparent bg-slate-800/30 p-3"
          aria-hidden="true"
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="size-11 shrink-0 rounded-full bg-slate-700/65" />
            <div className="min-w-0 flex-1">
              <div className="mb-2 h-3 w-3/4 rounded-full bg-slate-700/65" />
              <div className="h-2.5 w-1/3 rounded-full bg-slate-700/45" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default UsersLoadingSkeleton;
