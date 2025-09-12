// app/_components/Connect-spotify-callback.tsx
"use client";

import * as React from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { ModeToggle } from "@/app/_components/Mode-toggle";
import { AnimatePresence, motion } from "framer-motion";
import { useAppStore } from "@/store/appStore";
import ConnectSpotifyCallbackLoading from "@/public/ConnectSpotifyCallbackLoading.png";

/**
 * ConnectSpotifyCallback
 * - Reads ?code & ?state from the URL and calls the backend callback via the store action.
 * - Does not perform any client-side error guards or state checks.
 * - Always shows a static "Completing setup…" message.
 * - If the action/server fails, the slice is responsible for setting spotifyUnconfirmed=true,
 *   which StoreWrapper will detect and route to /spotify-issue.
 * - On success, the slice sets spotifyConnected=true; StoreWrapper will route to /home.
 */
export function ConnectSpotifyCallbackCard({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const searchParams = useSearchParams();
  const spotifyCallback = useAppStore((s) => s.spotifyCallback);

  const calledRef = React.useRef(false);

  React.useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    const code = searchParams.get("code") ?? "";
    const state = searchParams.get("state") ?? "";

    // Fire-and-forget; slice handles success/failure side effects.
    void spotifyCallback({ state, code });
  }, [searchParams, spotifyCallback]);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={"connect-spotify-callback"}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        style={{ willChange: "transform", backfaceVisibility: "hidden" }}
      >
        <div className={cn("flex flex-col gap-6", className)} {...props}>
          <Card className="overflow-hidden p-0">
            <CardContent className="grid p-0 md:grid-cols-2 items-stretch">
              {/* Left column */}
              <div className="relative p-6 md:p-8 pt-14">
                <div className="absolute left-3 top-3 z-20 pointer-events-auto">
                  <ModeToggle className="w-9 h-9 p-0" />
                </div>

                <div className="flex flex-col gap-6">
                  <div className="flex flex-col items-center text-center">
                    <h1 className="text-2xl font-bold">
                      Finishing Spotify <br /> Setup
                    </h1>
                    <p className="text-muted-foreground text-balance">
                      Completing setup for Spotify access…
                    </p>
                  </div>

                  <div className="after:border-border relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t">
                    <span className="bg-card text-muted-foreground relative z-10 px-2">
                      This may take a moment
                    </span>
                  </div>
                </div>
              </div>

              {/* Right column: image */}
              <div className="relative hidden md:block">
                <Image
                  src={ConnectSpotifyCallbackLoading}
                  alt="Image"
                  className="absolute inset-0 h-full w-full object-contain"
                  priority
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
