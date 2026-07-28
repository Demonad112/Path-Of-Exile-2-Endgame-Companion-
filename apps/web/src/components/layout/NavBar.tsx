"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { OPEN_SEARCH_EVENT } from "./CommandPalette";

function ChecklistIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-4">
      <path
        d="M4 5.5h12M4 10h12M4 14.5h7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="2" cy="5.5" r="1" fill="currentColor" />
      <circle cx="2" cy="10" r="1" fill="currentColor" />
      <circle cx="2" cy="14.5" r="1" fill="currentColor" />
    </svg>
  );
}

function AtlasIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-4">
      <circle cx="10" cy="3.5" r="1.6" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="4" cy="16" r="1.6" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="16" cy="16" r="1.6" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M10 5.1V9M10 9L4 14.4M10 9l6 5.4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DashboardIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-4">
      <rect x="3" y="3" width="6" height="7" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="11" y="3" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="11" y="9" width="6" height="8" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="3" y="12" width="6" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function CharacterIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-4">
      <circle cx="10" cy="6" r="3" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M4 17c0-3.3 2.7-6 6-6s6 2.7 6 6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

const LINKS: { href: string; label: string; icon: ReactNode }[] = [
  { href: "/checklist", label: "Checklist", icon: <ChecklistIcon /> },
  { href: "/atlas", label: "Atlas Tree", icon: <AtlasIcon /> },
  { href: "/dashboard", label: "Dashboard", icon: <DashboardIcon /> },
  { href: "/character", label: "Character", icon: <CharacterIcon /> },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-20 flex items-center gap-1 border-b border-line bg-surface/80 px-3 py-3 backdrop-blur-md sm:px-4">
      <Link href="/" className="mr-2 flex shrink-0 items-center gap-2 lg:mr-5">
        <svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="none">
          <path
            d="M12 2 L20 12 L12 22 L4 12 Z"
            stroke="var(--accent)"
            strokeWidth="1.5"
            fill="rgba(227,179,65,0.12)"
          />
          <path d="M12 6 L16 12 L12 18 L8 12 Z" fill="var(--accent)" opacity="0.8" />
        </svg>
        {/* Full wordmark only where there's room for it alongside the nav —
            below lg the links themselves take priority. */}
        <span className="text-gradient-gold hidden font-semibold tracking-wide lg:inline">
          PoE2 Endgame Companion
        </span>
      </Link>
      <div className="flex gap-1">
        {LINKS.map((link) => {
          const active = pathname?.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              // Labels are hidden on small screens (four of them plus the
              // wordmark overflowed a 390px viewport and forced the whole
              // document to scroll sideways); the icon carries the meaning,
              // with the label exposed to assistive tech and tooltips.
              aria-label={link.label}
              title={link.label}
              // Taller hit area on touch screens; unchanged on desktop.
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-2.5 text-sm font-medium transition-colors sm:px-3 sm:py-1.5 ${
                active
                  ? "border-[var(--accent)]/30 bg-[var(--accent-dim)] text-[var(--accent)]"
                  : "border-transparent text-ink-mute hover:bg-surface-sunken hover:text-ink-dim"
              }`}
            >
              {link.icon}
              <span className="hidden sm:inline">{link.label}</span>
            </Link>
          );
        })}
      </div>
      <button
        onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))}
        aria-label="Search"
        className="ml-auto flex shrink-0 items-center gap-2 rounded-md border border-line px-2.5 py-2.5 text-xs text-ink-mute transition-colors hover:border-line hover:text-ink-dim sm:py-1.5"
      >
        <svg viewBox="0 0 20 20" fill="none" className="size-3.5">
          <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M16 16l-3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="hidden sm:inline">Search</span>
        {/* Keyboard hint is noise on touch devices. */}
        <kbd className="hidden rounded border border-line px-1 py-0.5 font-mono text-[10px] text-ink-mute sm:inline">
          ⌘K
        </kbd>
      </button>
    </nav>
  );
}
