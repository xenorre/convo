function UsersLoadingSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="bg-slate-800/30 p-4 rounded-lg animate-pulse">
          <div className="flex items-center space-x-3">
            <div className="size-12 bg-slate-700 rounded-full" />
            <div className="flex-1">
              <div className="h-4 bg-slate-700 rounded w-3/4 mb-2" />
              <div className="h-3 bg-slate-700 rounded w-1/2" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default UsersLoadingSkeleton;
