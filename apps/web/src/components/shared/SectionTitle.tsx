export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 border-b border-[var(--line)] pb-2 text-lg font-semibold text-ink-dim">
      <span className="size-1.5 rounded-full bg-[var(--accent)]" />
      {children}
    </h2>
  );
}
