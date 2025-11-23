export default function TableSkeleton() {
  return (
    <div className="animate-pulse space-y-3 p-4">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="h-6 bg-gray-200 rounded"></div>
      ))}
    </div>
  );
}
