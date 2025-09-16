"use client";
import { Card } from "@/components/ui/card";
import { AnimatePresence, motion } from "framer-motion";

export default function TechStackPage() {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={"about-tech-stack-container"}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        style={{ willChange: "transform", backfaceVisibility: "hidden" }}
        className="min-h-[391px] h-full w-full p-2 overflow-y-hidden"
      >
        <Card className="h-full w-full flex flex-col items-center justify-center bg-transparent hover:cursor-default p-2 border-1 overflow-y-auto scrollbar-hide rounded-none">
          <Card className="p-4 gap-1 text-[10px] md:text-[12px] max-w-[475px] min-w-[250px] ">
            <h1 className="text-lg font-bold text-center underline underline-offset-1 dark:text-white mb-1">
              MoodMix4U - Tech Stack
            </h1>
            <p className="text-muted-foreground">
              MoodMix4U is built using a modern tech stack to ensure optimal
              performance and user experience. The key technologies used in the
              development of MoodMix4U include:
            </p>
            <ul className="list-disc list-inside mt-2 text-muted-foreground">
              <li className="font-bold  text-black dark:text-white">
                Frontend:{" "}
                <span className="font-normal text-muted-foreground">
                  Next.js, Tailwind, Zustand, Shadcn/ui, AccernityUI, Vercel
                </span>
              </li>
              <li className="font-bold text-black dark:text-white">
                Backend:{" "}
                <span className="font-normal text-muted-foreground">
                  Django, Django REST Framework
                </span>
              </li>
              <li className="font-bold text-black dark:text-white">
                Database: {""}
                <span className="font-normal text-muted-foreground">
                  PostgreSQL DB via Supabase
                </span>
              </li>
              <li className="font-bold text-black dark:text-white">
                Containerization:{" "}
                <span className="font-normal text-muted-foreground">
                  Docker
                </span>
              </li>
              <li className="font-bold text-black dark:text-white">
                Cloud Hosting:{" "}
                <span className="font-normal text-muted-foreground">GCP</span>
              </li>
              <li className="font-bold text-black dark:text-white">
                Other Services:{" "}
                <span className="font-normal text-muted-foreground">
                  Firebase
                </span>
              </li>
            </ul>
          </Card>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
