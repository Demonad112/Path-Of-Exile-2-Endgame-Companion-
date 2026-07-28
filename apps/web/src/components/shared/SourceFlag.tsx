import type { SourceRef } from "@/lib/types";

const STYLES: Record<string, string> = {
  unverified: "bg-accent/20 text-[var(--warn)] border-accent/40",
  conflicting: "bg-danger/20 text-[var(--danger)] border-danger/40",
};

const LABELS: Record<string, string> = {
  unverified: "Unverified",
  conflicting: "Conflicting sources",
};

export function SourceFlag({ source }: { source: SourceRef }) {
  if (source.verified === "confirmed") return null;

  return (
    <span
      title={source.note ?? "Verify in-game — source data may be stale."}
      className={`inline-flex cursor-help items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium ${STYLES[source.verified]}`}
    >
      ⚠ {LABELS[source.verified]}
    </span>
  );
}
