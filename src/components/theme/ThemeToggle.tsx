"use client";

import { useEffect, useState } from "react";
import {
  applyTheme,
  readStoredTheme,
  storeTheme,
  type Theme,
} from "@/lib/theme";

/** Compact corner control — no “light/dusk” labels. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const next = readStoredTheme();
    setTheme(next);
    applyTheme(next);
  }, []);

  function toggle() {
    const next: Theme = theme === "light" ? "dusk" : "light";
    setTheme(next);
    applyTheme(next);
    storeTheme(next);
  }

  const isDusk = theme === "dusk";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDusk ? "switch to light theme" : "switch to dusk theme"}
      title={isDusk ? "light" : "dusk"}
      className="fixed right-4 top-4 z-50 flex h-9 w-9 items-center justify-center border border-[var(--ink)]/15 bg-[var(--paper)]/80 text-[var(--ink)] backdrop-blur-sm transition hover:border-[var(--ink)]/30 hover:bg-[var(--accent)] sm:right-6 sm:top-5"
    >
      {isDusk ? (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="opacity-90">
          <circle cx="8" cy="8" r="3.25" fill="currentColor" />
          <g stroke="currentColor" strokeWidth="1.25" strokeLinecap="round">
            <path d="M8 1.5v1.75M8 12.75V14.5M1.5 8h1.75M12.75 8H14.5M3.4 3.4l1.2 1.2M11.4 11.4l1.2 1.2M3.4 12.6l1.2-1.2M11.4 4.6l1.2-1.2" />
          </g>
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="opacity-90">
          <path
            fill="currentColor"
            d="M9.6 1.6a5.8 5.8 0 1 0 4.8 4.8 4.6 4.6 0 0 1-4.8-4.8z"
          />
        </svg>
      )}
    </button>
  );
}
