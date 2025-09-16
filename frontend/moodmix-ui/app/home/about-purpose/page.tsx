"use client";
import { Card } from "@/components/ui/card";
import { AnimatePresence, motion } from "framer-motion";
export default function AboutPurposePage() {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={"about-purpose-container"}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        style={{ willChange: "transform", backfaceVisibility: "hidden" }}
        className="min-h-[391px] h-full w-full p-2 overflow-y-hidden"
      >
        <Card className="h-full w-full flex flex-col items-center justify-center bg-transparent hover:cursor-default p-2 border-1 overflow-y-auto scrollbar-hide rounded-none">
          <Card className="p-4 gap-1 text-[10px] md:text-[12px] max-w-[475px] min-w-[250px]">
            <h1 className="text-lg font-bold text-center not-italic underline underline-offset-1 dark:text-white">
              MoodMix4U - Purpose
            </h1>
            <p className="text-muted-foreground">
              The purpose of MoodMix4U is to supply users with the ability to
              generate and listen to Spotify playlists that best reflect the
              current mood or taste of music they are feeling. The application
              uses AI to interpret the user's mood or music prompts, while
              extrapolating their spotify listening data to use alongside their
              prompts to curate highly listenable personalized playlists.
              Overall, the goal is to enhance the user's music listening
              experience by providing personalized playlists that resonate with
              their mood and preferences, making music discovery more intuitive
              and enjoyable.
            </p>
            <span className="block font-bold not-italic">
              - Kedamawi Mengistu
            </span>
          </Card>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
