import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { createAuthSlice, type AuthSlice } from "@/slices/auth/authSlice";
import {
  createSpotifySlice,
  type SpotifySlice,
} from "@/slices/spotify/spotifySlice";

type AppState = AuthSlice & SpotifySlice;

export const useAppStore = create<AppState>()(
  devtools(
    persist(
      (...a) => ({
        ...createAuthSlice(...a),
        ...createSpotifySlice(...a),
      }),
      { name: "app-store" }
    ),
    { name: "app-store" }
  )
);
