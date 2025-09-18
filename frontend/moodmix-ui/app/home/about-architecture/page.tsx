"use client";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import ArchitectureImage from "@/public/MoodMix4U_Architecture.svg";
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
        className="min-h-[391px] h-full w-full p-2 overflow-y-hidden"
      >
        <Card className="h-full w-full flex flex-col items-center justify-center bg-transparent hover:cursor-default p-2 border-1 overflow-y-auto scrollbar-hide rounded-none">
          <Card className="p-4 grid grid-rows-[auto_auto] gap-3 text-[10px] md:text-[12px] max-w-[475px] min-w-[250px] italic overflow-y-auto scrollbar-hide">
            {/* Title + Ordered List */}
            <div>
              <h1 className="text-lg font-bold text-center underline dark:text-white not-italic mb-0.5">
                MoodMix4U - Architecture
              </h1>
              <ul className="list-disc list-inside text-[10px] md:text-[12px] text-left flex flex-col gap-1">
                <li className="font-bold not-italic text-black dark:text-white">
                  Front facing App (Next.js on Vercel):
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    What users see and interact with is a NextJS application
                    hosted on Vercel, where the state of the app is managed with
                    Zustand. To use the app, users must first sign in with
                    Firebase Authentication, whereafter they can then and must
                    connect their Spotify account to proceed.
                  </span>
                </li>
                <li className="font-bold not-italic text-black dark:text-white">
                  Backend Server (Dockerized Django REST API on GCP):
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    Once logged in and connected to Spotify, users can make
                    requests to the Django application to generate playlists by
                    providing mood or music prompts, which are sent to the
                    backend app to be used to generate a plan and from that a
                    playlist. The plan, which is generated using OpenAI's GPT-5
                    model, is essentially a parsed version of the user's prompt
                    that breaks down what the user is looking for in a playlist;
                    it extacts information such as the mood, the length of the
                    playlist (if not specified each will consist of 10 by
                    default), genres that best relate to the prompt, etc. This
                    plan then is used to build the playlist where Open AI's
                    GPT-5 model is put to use again to curate a playlist using
                    the user's spotify listening data alongside this plan. Here
                    the Spotify data being used are things like liked tracks,
                    recently played tracks, and top tracks they listen to. This
                    of course entails making use of the Spotify API to extract
                    this information and put it to use, where finally the
                    playlist is then saved to the user's connected to Spotify
                    account as a MoodMix4U generated playlist.
                  </span>
                </li>
                <li className="font-bold not-italic text-black dark:text-white">
                  User Guidelines:
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    The application limits users to generating one MoodMix4U
                    playlist once every 24 hours, where in the process of
                    generating a playlist, concurrent request to build seperate
                    playlists will fail. To add, playlists will contain anywhere
                    from 4-10 songs, where user's are free to specify lengths in
                    this range in their prompts. Lastly, playlist data is
                    managed only on the connected Spotify account for each user,
                    so if user's delete or edit these playlists from Spotify,
                    the changes may or may not be reflected immediately; they
                    will eventually be reflected however.
                  </span>
                </li>
              </ul>
            </div>

            {/* Image */}
            <div className="flex items-center justify-center">
              <Card className="flex w-fit items-center justify-center dark:bg-white rounded-2xl p-2 max-w-fit">
                {/* Optional: add a static architecture diagram here */}
                <Image
                  src={ArchitectureImage}
                  alt="MoodMix4U Architecture"
                  className="object-contain"
                />
              </Card>
            </div>
          </Card>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
