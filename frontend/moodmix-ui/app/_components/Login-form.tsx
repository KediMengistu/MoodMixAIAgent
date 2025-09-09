"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import MoodMix4ULogoImage from "@/public/MoodMix4U_Logo.png";
import { ModeToggle } from "@/app/_components/Mode-toggle";
import { AnimatePresence, motion } from "framer-motion";
import { useAppStore } from "@/store/appStore";

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  // inside component:
  const login = useAppStore((s) => s.authLogin);
  const status = useAppStore((s) => s.authStatus);
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={"login-form"}
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
                    <h1 className="text-2xl font-bold">Welcome back</h1>
                    <p className="text-muted-foreground text-balance">
                      Login to your MoodMix4U account fam.
                    </p>
                  </div>

                  <div className="after:border-border relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t">
                    <span className="bg-card text-muted-foreground relative z-10 px-2">
                      Continue with
                    </span>
                  </div>

                  <div className="grid grid-cols-1">
                    <Button
                      variant="outline"
                      type="button"
                      className="w-full hover:cursor-pointer"
                      aria-label="Login with Google"
                      onClick={async () => {
                        await login();
                      }}
                      disabled={status === "loading"}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                      >
                        <path
                          d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                          fill="currentColor"
                        />
                      </svg>
                      <span className="sr-only">Login with Google</span>
                    </Button>
                  </div>
                </div>
              </form>

              {/* Right column: hidden on small, flex-centered on md+ */}
              <div className="bg-transparent relative hidden md:block">
                <Image
                  src={MoodMix4ULogoImage}
                  alt="Image"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
