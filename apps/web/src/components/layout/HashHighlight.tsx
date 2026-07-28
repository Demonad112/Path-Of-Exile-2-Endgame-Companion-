"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function tryHighlight() {
  const hash = window.location.hash.replace("#", "");
  if (!hash) return;

  let attempts = 0;
  const attempt = () => {
    const el = document.getElementById(hash);
    if (el) {
      // The character page nests its detail panels in collapsed <details>
      // accordions, so a target can exist while being invisible. Open every
      // ancestor (and the target itself, when it *is* the accordion) before
      // scrolling, or the jump lands on a closed summary with no highlight.
      let node: HTMLElement | null = el;
      while (node) {
        if (node instanceof HTMLDetailsElement) node.open = true;
        node = node.parentElement;
      }
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.remove("search-highlight");
      void el.offsetWidth; // restart animation if the same target is hit twice
      el.classList.add("search-highlight");
      el.addEventListener(
        "animationend",
        () => el.classList.remove("search-highlight"),
        { once: true }
      );
      return;
    }
    attempts += 1;
    if (attempts < 40) requestAnimationFrame(attempt);
  };
  attempt();
}

/** Scrolls to and highlights the element matching the URL hash — used by
 * the command palette to jump to a specific checklist step, cluster,
 * strategy, boss, build, or mistake from anywhere in the app. */
export function HashHighlight() {
  const pathname = usePathname();

  useEffect(() => {
    tryHighlight();
  }, [pathname]);

  useEffect(() => {
    window.addEventListener("hashchange", tryHighlight);
    return () => window.removeEventListener("hashchange", tryHighlight);
  }, []);

  return null;
}
