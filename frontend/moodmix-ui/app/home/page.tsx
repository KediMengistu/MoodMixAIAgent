// app/home/page.tsx
"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import MusicListener from "@/public/MusicListener.png";
import { Card } from "@/components/ui/card";
import { PlaceholdersAndVanishInput } from "@/components/ui/placeholders-and-vanish-input";
import { useAppStore } from "@/store/appStore";
import { toast } from "sonner";
import type { BuildResponseDTO } from "@/slices/playlist/playlistDTO";

export default function HomePage() {
  const placeholders = [
    "Upbeat & clean lyrics for a morning run",
    "Lo-fi chill to study to",
    "Moody R&B (no explicit) • ~45 min",
    "Energetic EDM for the gym",
    "Calm piano to fall asleep",
  ];

  const [value, setValue] = React.useState("");
  const [inputBusy, setInputBusy] = React.useState(false);
  const [clearVersion, setClearVersion] = React.useState(0); // bumps to tell child to clear

  // just the chained action
  const planThenBuild = useAppStore((s) => s.planThenBuild);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
  };

  // Map custom backend 429s to friendly messages
  const rateLimitMessage = () => {
    const { playlistErrorCode, playlistError } = useAppStore.getState();
    if (playlistErrorCode === 429) {
      const msg = (playlistError || "").toLowerCase();

      // 24h cooldown (plan + build variants)
      if (
        msg.includes("one moodmix build per 24h") ||
        msg.includes("planning is blocked accordingly")
      ) {
        return "Must wait 24 hours to make new playlist.";
      }

      // Concurrency lease (planning/build in progress)
      if (msg.includes("already in progress")) {
        return "A playlist is currently being generated.";
      }
    }
    // Fallback to the current generic message
    return "Playlist Generation Failed";
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const mood = value.trim();
    if (!mood) return;

    setInputBusy(true);

    // Wrap the action in a promise so toast.promise can reflect loading/success/error
    const task: Promise<BuildResponseDTO> = (async () => {
      const buildRes = (await planThenBuild({
        mood,
      })) as BuildResponseDTO | void;

      // Decide success based on slice state after the action resolves
      const { playlistStatus, playlistError } = useAppStore.getState();
      if (playlistStatus !== "succeeded" || !buildRes) {
        throw new Error(playlistError || "Playlist Generation Failed");
      }
      return buildRes;
    })();

    toast.promise(task, {
      loading: "We are preparing your MoodMix4U playlist...",
      success: "Playlist Successfully Created",
      // Use our custom mapper for 429s; everything else stays as-is
      error: () => rateLimitMessage(),
    });

    try {
      const buildRes = await task;

      // After success: show info sonner with bold, underlined link opening in a new tab
      const spotifyUrl = buildRes?.playlist?.external_urls?.spotify;
      if (spotifyUrl) {
        toast.info(
          <span>
            Click{" "}
            <a
              href={spotifyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold"
            >
              here
            </a>{" "}
            to view playlist from Spotify
          </span>
        );
      }
    } catch {
      // errors are already surfaced by the toast
    } finally {
      // Clear regardless of success/failure and re-enable input
      setClearVersion((v) => v + 1);
      setValue("");
      setInputBusy(false);
    }
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="home-page"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        style={{ willChange: "transform", backfaceVisibility: "hidden" }}
        className="min-h-[391px] h-full w-full p-2 overflow-y-hidden"
      >
        <Card className="h-full w-full flex flex-col items justify-center bg-transparent hover:cursor-default p-2 border-1 overflow-y-auto scrollbar-hide">
          {/* Top: image + greeting */}
          <div className="flex flex-col items-center justify-end h-fit gap-2 ">
            <Image
              src={MusicListener}
              alt="Girl listening to music"
              className="h-[200px] object-contain"
              priority
            />
            <h1 className="text-md font-light text-center">
              Hey there, I am your MoodMixer DJ! <br /> How are you feeling
              today?
            </h1>
          </div>

          {/* Input row */}
          <div className="flex flex-col items-center justify-start">
            <div className="w-full max-w-xl">
              <PlaceholdersAndVanishInput
                placeholders={placeholders}
                onChange={handleChange}
                onSubmit={onSubmit}
                // simple client-side guards
                minLength={2}
                maxLength={120}
                // parent-controlled disabled/clearing
                busy={inputBusy}
                clearVersion={clearVersion}
              />
              {/* Notice directly under the input (identical styling to your other notice) */}
              <p className="text-center text-[11px] text-muted-foreground p-1">
                MoodMix4U can make mistakes.
              </p>
            </div>
          </div>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
