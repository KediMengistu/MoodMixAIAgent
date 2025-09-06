// app/home/page.tsx
"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import MusicListener from "@/public/MusicListener.png";
import { Card } from "@/components/ui/card";
import { PlaceholdersAndVanishInput } from "@/components/ui/placeholders-and-vanish-input";

export default function HomePage() {
  const placeholders = [
    "Upbeat & clean lyrics for a morning run",
    "Lo-fi chill to study to",
    "Moody R&B (no explicit) • ~45 min",
    "Energetic EDM for the gym",
    "Calm piano to fall asleep",
  ];

  const [value, setValue] = React.useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    console.log("submitted:", value);
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="architecture-container"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        style={{ willChange: "transform", backfaceVisibility: "hidden" }}
        className="h-full w-full p-2"
      >
        <Card className="h-full w-full flex flex-col items justify-center bg-transparent hover:cursor-default p-2 border-1">
          {/* Top: image + greeting */}
          <div className="flex flex-col items-center justify-end h-fit gap-2 ">
            <Image
              src={MusicListener}
              alt="Girl listening to music"
              className="h-[200px] object-contain"
              priority
            />
            <h1 className="text-md font-normal text-center italic">
              Hey there! I am your MoodMixer DJ. <br /> How are you feeling
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
              />
            </div>
          </div>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
