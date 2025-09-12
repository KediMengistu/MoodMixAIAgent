// components/ui/placeholders-and-vanish-input.tsx
"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function PlaceholdersAndVanishInput({
  placeholders,
  onChange,
  onSubmit,
  minLength = 1,
  maxLength,
  /** NEW: parent-controlled busy (disables input & submit, keeps text visible) */
  busy = false,
  /** NEW: bump this number to tell the component to clear its input */
  clearVersion,
}: {
  placeholders: string[];
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  minLength?: number;
  maxLength?: number;
  busy?: boolean;
  clearVersion?: number;
}) {
  const [currentPlaceholder, setCurrentPlaceholder] = useState(0);

  // Placeholder rotator (unchanged)
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const startAnimation = () => {
    intervalRef.current = setInterval(() => {
      setCurrentPlaceholder((prev) => (prev + 1) % placeholders.length);
    }, 3000);
  };
  const handleVisibilityChange = () => {
    if (document.visibilityState !== "visible" && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    } else if (document.visibilityState === "visible") {
      startAnimation();
    }
  };
  useEffect(() => {
    startAnimation();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [placeholders]);

  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");

  // Warn-on-limit helpers (with robust paste suppression)
  const [warnedMax, setWarnedMax] = useState(false);
  const warnedMaxRef = useRef(false);
  const suppressNextChangeToastRef = useRef(false);
  const prevLenRef = useRef(0);

  // Clear when parent bumps clearVersion
  const prevClearRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (clearVersion !== undefined && clearVersion !== prevClearRef.current) {
      setValue("");
      setWarnedMax(false);
      warnedMaxRef.current = false;
      prevLenRef.current = 0;
      suppressNextChangeToastRef.current = false;
      prevClearRef.current = clearVersion;
    }
  }, [clearVersion]);

  // ---- submit gating ----
  const meetsMin = value.trim().length >= Math.max(0, minLength || 0);
  const overMax =
    typeof maxLength === "number" ? value.length > maxLength : false; // allow exactly at max
  const canSubmitNow = !busy && meetsMin && !!value.trim() && !overMax;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (canSubmitNow) {
        // let form onSubmit run
      } else {
        e.preventDefault();
      }
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmitNow) return;
    onSubmit && onSubmit(e);
  };

  const padX = "pl-4 sm:pl-10 pr-20";

  return (
    <form
      className={cn(
        "w-full relative max-w-xl mx-auto bg-white dark:bg-zinc-800 h-12 rounded-full overflow-hidden shadow-[0px_2px_3px_-1px_rgba(0,0,0,0.1),_0px_1px_0px_0px_rgba(25,28,33,0.02),_0px_0px_0px_1px_rgba(25,28,33,0.08)] transition duration-200",
        value && "bg-gray-50"
      )}
      onSubmit={handleSubmit}
    >
      {/* INPUT (keeps text visible; just disables while busy) */}
      <input
        onChange={(e) => {
          if (busy) return;

          const attempted = e.target.value;
          const limit =
            typeof maxLength === "number"
              ? maxLength
              : Number.POSITIVE_INFINITY;

          const prev = prevLenRef.current;
          const next = attempted.length;

          // If previous onPaste already warned for this exact transition,
          // suppress the onChange toast once.
          if (suppressNextChangeToastRef.current) {
            suppressNextChangeToastRef.current = false;
          } else {
            // Warn only when SURPASSING the limit (not at exactly the limit)
            if (next > limit && prev <= limit && !warnedMaxRef.current) {
              const msg = `${
                isFinite(limit) ? limit : ""
              } character max limit surpassed.`.trim();

              const anyToast = toast as any;
              if (typeof anyToast.warning === "function") {
                anyToast.warning(msg);
              } else {
                anyToast(msg);
              }
              setWarnedMax(true);
              warnedMaxRef.current = true;
            } else if (next <= limit && warnedMaxRef.current) {
              // User went back to <= limit → allow warnings again later
              setWarnedMax(false);
              warnedMaxRef.current = false;
            }
          }

          prevLenRef.current = next;

          setValue(attempted);
          onChange && onChange(e);
        }}
        onKeyDown={handleKeyDown}
        onPaste={(e) => {
          if (busy || typeof maxLength !== "number") return;

          const incoming = e.clipboardData?.getData("text") ?? "";
          const el = inputRef.current;

          // Compute final length considering selection replacement
          let finalLen = (value?.length ?? 0) + incoming.length;
          if (el && el.selectionStart !== null && el.selectionEnd !== null) {
            finalLen =
              value.length -
              (el.selectionEnd - el.selectionStart) +
              incoming.length;
          }

          if (finalLen > maxLength && !warnedMaxRef.current) {
            const msg = `${maxLength} character max limit surpassed.`;
            const anyToast = toast as any;
            if (typeof anyToast.warning === "function") {
              anyToast.warning(msg);
            } else {
              anyToast(msg);
            }
            setWarnedMax(true);
            warnedMaxRef.current = true;

            // IMPORTANT: prevent onChange from also warning for this same paste
            suppressNextChangeToastRef.current = true;
          }
        }}
        ref={inputRef}
        value={value}
        type="text"
        disabled={busy}
        // NOTE: no native maxLength so we can detect "over the limit" to warn
        className={cn(
          "w-full relative text-sm sm:text-base z-50 border-none dark:text-white bg-transparent text-black h-full rounded-full focus:outline-none focus:ring-0",
          padX
        )}
      />

      <button
        disabled={!canSubmitNow}
        type="submit"
        className="absolute right-2 top-1/2 z-50 -translate-y-1/2 h-8 w-8 rounded-full disabled:bg-gray-100 bg-black dark:bg-zinc-900 dark:disabled:bg-zinc-800 transition duration-200 flex items-center justify-center hover:cursor-pointer disabled:cursor-default"
      >
        <motion.svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-gray-300 h-4 w-4"
        >
          <path stroke="none" d="M0 0h24v24H0z" fill="none" />
          <motion.path
            d="M5 12l14 0"
            initial={{ strokeDasharray: "50%", strokeDashoffset: "50%" }}
            animate={{ strokeDashoffset: value ? 0 : "50%" }}
            transition={{ duration: 0.3, ease: "linear" }}
          />
          <path d="M13 18l6 -6" />
          <path d="M13 6l6 6" />
        </motion.svg>
      </button>

      {/* PLACEHOLDER */}
      <div className="absolute inset-0 flex items-center rounded-full pointer-events-none">
        <AnimatePresence mode="wait">
          {!value && (
            <motion.p
              initial={{ y: 5, opacity: 0 }}
              key={`current-placeholder-${currentPlaceholder}`}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -15, opacity: 0 }}
              transition={{ duration: 0.3, ease: "linear" }}
              className={cn(
                "dark:text-zinc-500 text-sm sm:text-base font-normal text-neutral-500 text-left truncate",
                padX
              )}
            >
              {placeholders[currentPlaceholder]}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </form>
  );
}
