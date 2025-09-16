"use client";
// import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { Card } from "@/components/ui/card";

export default function AboutArchitecturePage() {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={"about-architecture-container"}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        style={{ willChange: "transform", backfaceVisibility: "hidden" }}
        className="h-full w-full p-2 grid grid-rows-[1fr] overflow-y-auto scrollbar-hide focus:outline-none shadow-[0px_2px_3px_-1px_rgba(0,0,0,0.1),0px_1px_0px_0px_rgba(25,28,33,0.02),0px_0px_0px_1px_rgba(25,28,33,0.08)]"
      >
        <div className="flex items-center justify-center p-1">
          <Card className="p-4 grid grid-rows-[auto_auto] gap-3 text-[10px] md:text-[12px] max-w-[475px] min-w-[250px] italic overflow-y-auto scrollbar-hide">
            {/* Title + Ordered List */}
            <div>
              <h1 className="text-lg font-bold text-center underline dark:text-white not-italic mb-0.5">
                MoodMix4U - Architecture
              </h1>
              <ul className="list-disc list-inside text-[10px] md:text-[12px] text-left">
                <li className="font-bold not-italic text-black dark:text-white">
                  <span className="font-normal italic text-muted-foreground"></span>
                </li>
                <li className="mt-2 font-bold not-italic text-black dark:text-white">
                  <span className="font-normal italic text-muted-foreground"></span>
                </li>
                <li className="mt-2 font-bold not-italic text-black dark:text-white">
                  <span className="font-normal italic text-muted-foreground"></span>
                </li>
                <li className="mt-2 font-bold not-italic text-black dark:text-white">
                  <span className="font-normal italic text-muted-foreground"></span>
                </li>
                <li className="mt-2 font-bold not-italic text-black dark:text-white">
                  <span className="font-normal italic text-muted-foreground"></span>
                </li>
              </ul>
            </div>
            {/* Image */}
            <div className="flex items-center justify-center">
              <Card className="flex w-fit items-center justify-center dark:bg-white rounded-2xl p-2 max-w-fit">
                {/* <Image
                  src={ArchitectureImage}
                  alt="Stock4U App Architecture"
                  className="object-contain"
                /> */}
              </Card>
            </div>
          </Card>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
