import type { ReactNode } from "react";

/**
 * A collapsible section built on native <details>.
 *
 * Deliberately not a stateful React disclosure: <details> gives keyboard
 * support, correct semantics for assistive tech, browser find-in-page
 * expansion and fragment-navigation expansion for free, and it renders
 * correctly before hydration — which matters on a statically exported site
 * where the character page is otherwise entirely client-driven.
 *
 * The `instrument` slot is the point of the collapsed row: a summary that
 * merely describes its section ("where each resistance comes from") hides
 * information behind a description of that information. Passing the actual
 * measurement — the DPS figure, four resistance pips, a danger bar — lets the
 * whole page be triaged without opening anything.
 */
export function Accordion({
  id,
  title,
  summary,
  badge,
  instrument,
  defaultOpen = false,
  children,
}: {
  id?: string;
  title: string;
  /** One-line preview shown while collapsed, so the section is scannable. */
  summary?: ReactNode;
  /** Short status chip, e.g. a count or a warning marker. */
  badge?: ReactNode;
  /** Right-aligned live readout — the section's headline measurement. */
  instrument?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      id={id}
      open={defaultOpen}
      className="group overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] shadow-[var(--lift)] transition-colors open:border-l-2 open:border-l-[var(--accent)] open:bg-[var(--surface-raised)] open:shadow-[var(--lift-raised)]"
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]/60 [&::-webkit-details-marker]:hidden">
        <svg
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
          className="size-3.5 shrink-0 text-ink-mute transition-transform group-open:rotate-90 group-open:text-[var(--accent)]"
        >
          <path
            d="M7.5 5l5 5-5 5"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-ink-dim group-open:text-ink">
              {title}
            </span>
            {badge}
          </span>
          {summary && (
            <span className="mt-0.5 block text-xs text-ink-mute group-open:hidden">
              {summary}
            </span>
          )}
        </span>

        {instrument && (
          // Hidden once open — the panel itself now shows the real thing, and
          // leaving a duplicate readout in the header just competes with it.
          <span className="shrink-0 group-open:hidden">{instrument}</span>
        )}
      </summary>

      <div className="border-t border-[var(--line)] px-4 py-4">{children}</div>
    </details>
  );
}
