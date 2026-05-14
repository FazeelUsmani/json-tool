export function TopBar() {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-4 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
          json-tool
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300"
          title="Your JSON never leaves your browser. CSP will enforce this in production."
        >
          100% client-side
        </span>
      </div>
    </header>
  );
}
