"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { searchIndex, type SearchCategory, type SearchEntry } from "@/lib/searchIndex";

const CATEGORY_COLORS: Record<SearchCategory, string> = {
  Checklist: "text-[var(--good)]",
  Atlas: "text-chaos",
  Strategy: "text-[var(--accent)]",
  Boss: "text-[var(--danger)]",
  Build: "text-cold",
  Mistake: "text-[var(--danger)]",
  Character: "text-[var(--accent)]",
};

export const OPEN_SEARCH_EVENT = "app:open-search";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    const onOpenEvent = () => setOpen(true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpenEvent);
    };
  }, []);

  // Reset query/selection during render (React's recommended pattern for
  // adjusting state on a prop/state change) rather than in an effect —
  // focusing the input is the one genuine side effect, so that alone stays
  // in a useEffect below.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      setActiveIndex(0);
    }
  }

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return searchIndex.slice(0, 8);
    // Rank title matches above subtitle-only matches, so e.g. searching
    // "Xesht" surfaces the Xesht boss entry itself before a checklist step
    // that merely mentions Xesht in passing.
    return searchIndex
      .map((entry) => {
        const title = entry.title.toLowerCase();
        const subtitle = entry.subtitle.toLowerCase();
        let score = -1;
        if (title.startsWith(q)) score = 3;
        else if (title.includes(q)) score = 2;
        else if (subtitle.includes(q)) score = 1;
        return { entry, score };
      })
      .filter((r) => r.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map((r) => r.entry);
  }, [query]);

  const goTo = (entry: SearchEntry) => {
    setOpen(false);
    router.push(`${entry.href}#${entry.id}`);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[12vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-line bg-surface-raised shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIndex((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (results[activeIndex]) goTo(results[activeIndex]);
            }
          }}
          placeholder="Search steps, strategies, bosses, builds..."
          className="w-full border-b border-[var(--line)] bg-transparent px-4 py-3.5 text-sm text-ink outline-none placeholder:text-ink-mute"
        />
        <ul className="max-h-80 overflow-y-auto py-2">
          {results.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-ink-mute">
              No results
            </li>
          )}
          {results.map((entry, i) => (
            <li key={entry.id}>
              <button
                onClick={() => goTo(entry)}
                onMouseEnter={() => setActiveIndex(i)}
                className={`flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors ${
                  i === activeIndex ? "bg-surface-sunken" : ""
                }`}
              >
                <span
                  className={`mt-0.5 shrink-0 text-[10px] font-medium tracking-wide uppercase ${CATEGORY_COLORS[entry.category]}`}
                >
                  {entry.category}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">
                    {entry.title}
                  </span>
                  <span className="block truncate text-xs text-ink-mute">
                    {entry.subtitle}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-line px-4 py-2 text-[10px] text-ink-mute">
          <span>↑↓ to navigate · Enter to select</span>
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  );
}
