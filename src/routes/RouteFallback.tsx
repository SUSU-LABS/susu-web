export function RouteFallback() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading page"
      className="mx-auto w-full max-w-5xl animate-pulse space-y-4 p-6"
    >
      <div className="h-8 w-1/3 rounded bg-slate-200" />
      <div className="h-4 w-2/3 rounded bg-slate-200" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-32 rounded bg-slate-200" />
        <div className="h-32 rounded bg-slate-200" />
      </div>
    </div>
  );
}
