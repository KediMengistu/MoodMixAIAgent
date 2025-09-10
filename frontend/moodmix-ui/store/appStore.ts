import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { createAuthSlice, type AuthSlice } from "@/slices/auth/authSlice";
import {
  createSpotifySlice,
  type SpotifySlice,
} from "@/slices/spotify/spotifySlice";
import {
  createPlaylistSlice,
  type PlaylistSlice,
} from "@/slices/playlist/playlistSlice";

export type AppState = AuthSlice & SpotifySlice & PlaylistSlice;

export const useAppStore = create<AppState>()(
  devtools(
    persist(
      (...a) => ({
        ...createAuthSlice(...a),
        ...createSpotifySlice(...a),
        ...createPlaylistSlice(...a),
      }),
      { name: "app-store" }
    ),
    {
      name: "app-store",
      anonymousActionType: "zustand:setState",
    }
  )
);
