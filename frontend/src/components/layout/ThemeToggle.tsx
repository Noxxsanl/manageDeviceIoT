"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

function subscribeToClient() {
  return () => {};
}

export default function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribeToClient, () => true, () => false);

  const activeTheme = mounted ? theme || resolvedTheme : "light";

  return (
    <button
      type="button"
      onClick={() => setTheme(activeTheme === "dark" ? "light" : "dark")}
      className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/85 text-slate-700 shadow-sm transition hover:bg-slate-100 dark:border-slate-700/80 dark:bg-slate-900/90 dark:text-slate-100 dark:hover:bg-slate-800"
      aria-label="Toggle theme"
    >
      {activeTheme === "dark" ? (
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" fill="currentColor" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
          <path d="M12 18.5a6.5 6.5 0 100-13 6.5 6.5 0 000 13z" stroke="currentColor" strokeWidth="1.8" />
          <path d="M12 1.5v2.5M12 20.5v2.5M4.5 12h2.5M17 12h2.5M6.22 6.22l1.77 1.77M15.01 15.01l1.77 1.77M6.22 17.78l1.77-1.77M15.01 8.99l1.77-1.77" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}
