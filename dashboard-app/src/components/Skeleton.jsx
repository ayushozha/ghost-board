export function CardSkeleton() {
  return (
    <div className="animate-pulse bg-gray-800/50 rounded-xl p-6">
      <div className="h-4 bg-gray-700 rounded w-3/4 mb-4"></div>
      <div className="h-3 bg-gray-700 rounded w-1/2 mb-2"></div>
      <div className="h-3 bg-gray-700 rounded w-2/3"></div>
    </div>
  );
}

export function TimelineSkeleton() {
  return (
    <div className="flex gap-4 animate-pulse">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="flex flex-col items-center gap-2">
          <div className="w-4 h-4 bg-gray-700 rounded-full"></div>
          <div className="h-2 bg-gray-700 rounded w-16"></div>
        </div>
      ))}
    </div>
  );
}

export function FeedSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex gap-3 p-3 bg-gray-800/30 rounded-lg">
          <div className="w-8 h-8 bg-gray-700 rounded-full flex-shrink-0"></div>
          <div className="flex-1">
            <div className="h-3 bg-gray-700 rounded w-24 mb-2"></div>
            <div className="h-2 bg-gray-700 rounded w-full mb-1"></div>
            <div className="h-2 bg-gray-700 rounded w-3/4"></div>
          </div>
        </div>
      ))}
    </div>
  );
}
