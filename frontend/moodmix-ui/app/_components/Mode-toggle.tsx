"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

type Props = { className?: string };

export function ModeToggle({ className }: Props) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      {/* === Light-visible button (switch to dark) === */}
      <button
        type="button"
        onClick={() => setTheme("dark")}
        aria-label="Switch to dark mode"
        // Keeping your Preline classes for the look; actual show/hide controlled below.
        className={cn(
          "hover:cursor-pointer",
          "hs-dark-mode-active:hidden block hs-dark-mode font-medium text-gray-800 rounded-full",
          "hover:bg-gray-200 focus:outline-hidden focus:bg-gray-200",
          "dark:text-neutral-200 dark:hover:bg-neutral-800 dark:focus:bg-neutral-800",
          // React-controlled visibility (so we don't depend on Preline's JS):
          isDark ? "hidden" : "block"
        )}
        data-hs-theme-click-value="dark"
      >
        <span className="group inline-flex shrink-0 justify-center items-center size-9">
          <svg
            className="shrink-0 size-4"
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>
          </svg>
        </span>
      </button>

      {/* === Dark-visible button (switch to light) === */}
      <button
        type="button"
        onClick={() => setTheme("light")}
        aria-label="Switch to light mode"
        className={cn(
          "hs-dark-mode-active:block hidden hs-dark-mode font-medium text-gray-800 rounded-full hover:cursor-pointer",
          "hover:bg-gray-200 focus:outline-hidden focus:bg-gray-200",
          "dark:text-neutral-200 dark:hover:bg-neutral-800 dark:focus:bg-neutral-800",
          isDark ? "block" : "hidden"
        )}
        data-hs-theme-click-value="light"
      >
        <span className="group inline-flex shrink-0 justify-center items-center size-9">
          <svg
            className="shrink-0 size-4"
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="4"></circle>
            <path d="M12 2v2"></path>
            <path d="M12 20v2"></path>
            <path d="m4.93 4.93 1.41 1.41"></path>
            <path d="m17.66 17.66 1.41 1.41"></path>
            <path d="M2 12h2"></path>
            <path d="M20 12h2"></path>
            <path d="m6.34 17.66-1.41 1.41"></path>
            <path d="m19.07 4.93-1.41 1.41"></path>
          </svg>
        </span>
      </button>
    </div>
  );
}
