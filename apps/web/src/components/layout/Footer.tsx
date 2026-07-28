"use client";

import { useResetProgress } from "@/hooks/useResetProgress";

export function Footer() {
  const resetProgress = useResetProgress();

  const handleReset = () => {
    if (
      window.confirm(
        "Reset all saved progress? This clears your checklist, Atlas allocation, and dashboard selections in this browser. This can't be undone."
      )
    ) {
      resetProgress();
    }
  };

  return (
    <footer className="mt-auto border-t border-line px-4 py-6 text-xs text-ink-mute md:px-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 sm:flex-row">
        <p>
          Unofficial fan project — not affiliated with or endorsed by Grinding
          Gear Games. MIT licensed.
        </p>
        <div className="flex items-center gap-4">
          <a
            href="https://github.com/Demonad112/Poe2-endgame"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-ink-dim"
          >
            View source
          </a>
          <button
            onClick={handleReset}
            className="hover:text-danger"
          >
            Reset all progress
          </button>
        </div>
      </div>
    </footer>
  );
}
