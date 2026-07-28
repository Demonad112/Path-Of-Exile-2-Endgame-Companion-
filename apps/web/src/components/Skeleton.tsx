/**
 * Analysis takes a moment (a 388 KB payload plus a zlib inflate for the PoB
 * cross-check). The layout must not appear frozen, and it must not jump when
 * the real content lands — so the skeleton mirrors the final structure.
 */
export function Skeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Analysing character…</span>

      <div className="flex gap-3">
        <div className="skeleton h-6 w-40 rounded-md" />
        <div className="skeleton h-6 w-28 rounded-md" />
      </div>

      <div className="rounded-xl border border-line bg-surface-raised p-4">
        <div className="skeleton mb-3 h-4 w-24 rounded" />
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-24 rounded-lg" />
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-xl border border-line bg-surface-raised p-4">
            <div className="skeleton mb-3 h-4 w-20 rounded" />
            <div className="skeleton mb-4 h-12 w-40 rounded" />
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2, 3, 4, 5].map((j) => (
                <div key={j} className="skeleton h-14 rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-line bg-surface-raised p-4">
        <div className="skeleton mb-3 h-4 w-20 rounded" />
        <div className="skeleton h-48 rounded-lg" />
      </div>
    </div>
  )
}
