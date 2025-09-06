"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import ConnectSpotify from "@/public/ConnectSpotify.png";
import { ModeToggle } from "@/app/_components/Mode-toggle";
import { AnimatePresence, motion } from "framer-motion";

export function ConnectSpotifyForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={"connect-spotify-form"}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        style={{ willChange: "transform", backfaceVisibility: "hidden" }}
      >
        <div className={cn("flex flex-col gap-6", className)} {...props}>
          <Card className="overflow-hidden p-0">
            {/* items-stretch ensures both columns have equal height */}
            <CardContent className="grid p-0 md:grid-cols-2 items-stretch">
              {/* Make the form relative so the toggle can be absolutely positioned */}
              <form className="relative p-6 md:p-8 pt-14">
                {/* Top-left absolute ModeToggle */}
                <div className="absolute left-3 top-3 z-20 pointer-events-auto">
                  <ModeToggle className="w-9 h-9 p-0" />
                </div>

                <div className="flex flex-col gap-6">
                  <div className="flex flex-col items-center text-center">
                    <h1 className="text-2xl font-bold">Spotify Setup</h1>
                    <p className="text-muted-foreground text-balance">
                      MoodMix4U links to your Spotify account.
                    </p>
                  </div>

                  <div className="after:border-border relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t">
                    <span className="bg-card text-muted-foreground relative z-10 px-2">
                      Continue below
                    </span>
                  </div>

                  <div className="grid grid-cols-1">
                    <Button
                      variant="outline"
                      type="button"
                      className="w-full hover:cursor-pointer"
                      aria-label="Link Spotify Account"
                    >
                      Link Spotify Account
                      <span className="sr-only">Link Spotify Account</span>
                    </Button>
                  </div>
                </div>
              </form>

              {/* Right column: hidden on small, flex-centered on md+ */}
              <div className="relative hidden md:block">
                <Image
                  src={ConnectSpotify}
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
