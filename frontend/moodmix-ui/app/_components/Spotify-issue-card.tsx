// app/_components/Spotify-issue-card.tsx
"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import SpotifyError from "@/public/SpotifyError.png";
import { ModeToggle } from "@/app/_components/Mode-toggle";
import { AnimatePresence, motion } from "framer-motion";
import { useAppStore } from "@/store/appStore";
import * as React from "react";

/* ================================
 * New: Spotify Issue card (no buttons)
 * Shows issue details and auto-logs out
 * ================================ */
export function SpotifyIssueCard({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const logout = useAppStore((s) => s.authLogout);
  const [seconds, setSeconds] = React.useState(5);

  React.useEffect(() => {
    // Decrement every second, but clamp at 0 and stop ticking once we reach it
    const tick = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearInterval(tick); // stop once we hit 0
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    // Auto-logout after 5s
    const timer = setTimeout(() => {
      logout(); // resets both auth + spotify slices via your store
    }, 5000);

    return () => {
      clearInterval(tick);
      clearTimeout(timer);
    };
  }, [logout]);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={"spotify-issue-card"}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        style={{ willChange: "transform", backfaceVisibility: "hidden" }}
      >
        <div className={cn("flex flex-col gap-6", className)} {...props}>
          <Card className="overflow-hidden p-0">
            <CardContent className="grid p-0 md:grid-cols-2 items-stretch">
              <div className="relative p-6 md:p-8 pt-14">
                <div className="absolute left-3 top-3 z-20 pointer-events-auto">
                  <ModeToggle className="w-9 h-9 p-0" />
                </div>

                <div className="flex flex-col gap-6">
                  <div className="flex flex-col items-center text-center">
                    <h1 className="text-2xl font-bold">Spotify Issue</h1>
                    <p className="text-muted-foreground text-balance">
                      Cannot confirm Spotify account setup.
                    </p>
                  </div>

                  <div className="after:border-border relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t">
                    <span className="bg-card text-muted-foreground relative z-10 px-2">
                      Redirecting to login in ...
                    </span>
                  </div>

                  <div className="text-center text-xl font-bold italic">
                    {seconds} s
                  </div>
                </div>
              </div>

              <div className="relative hidden md:block">
                <Image
                  src={SpotifyError}
                  alt="Image"
                  className="absolute inset-0 h-full w-full object-contain"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
