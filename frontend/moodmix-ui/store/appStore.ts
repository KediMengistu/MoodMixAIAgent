import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { createAuthSlice, type AuthSlice } from "@/slices/auth/authSlice";
import {
  createSpotifySlice,
  type SpotifySlice,
} from "@/slices/spotify/spotifySlice";

export type AppState = AuthSlice & SpotifySlice;

export const useAppStore = create<AppState>()(
  devtools(
    persist(
      (...a) => ({
        ...createAuthSlice(...a),
        ...createSpotifySlice(...a),
      }),
      { name: "app-store" }
    ),
    {
      name: "app-store",
      // Optional: any unlabeled set will appear with this name
      anonymousActionType: "zustand:setState",
    }
  )
);
