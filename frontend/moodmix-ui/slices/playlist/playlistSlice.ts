import { StateCreator } from "zustand";
import { auth } from "@/firebase/firebaseConfig";
import type { AppState } from "@/store/appStore";

export interface PlaylistSlice {
  // state
  playlistMoodInput: string;
  playlistError: string | null;
  playlistErrorCode: number | null;
  playlistStatus: "idle" | "loading" | "succeeded" | "failed";

  // actions
  plan: (args?: { mood?: string }) => Promise<any | void>;
  build: (args?: {
    mood?: string;
    length?: number;
    public?: boolean;
    collaborative?: boolean;
    name?: string;
    plan?: Record<string, any>;
  }) => Promise<any | void>;

  // granular resets
  resetPlaylistMoodInput: () => void;
  resetPlaylistError: () => void;
  resetPlaylistErrorCode: () => void;
  resetPlaylistStatus: () => void;

  // reset all
  resetAllPlaylist: () => void;
}

export const createPlaylistSlice: StateCreator<
  AppState,
  [["zustand/devtools", never], ["zustand/persist", unknown]],
  [],
  PlaylistSlice
> = (set, get) => {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "";

  const withAuth = async (init?: RequestInit): Promise<RequestInit> => {
    const token = await auth.currentUser?.getIdToken();
    return {
      ...(init ?? {}),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(init?.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };
  };

  const initialState = {
    playlistMoodInput: "",
    playlistError: null as string | null,
    playlistErrorCode: null as number | null,
    playlistStatus: "idle" as const,
  };

  return {
    // ---- defaults ----
    ...initialState,

    // ---- actions ----
    plan: async (args) => {
      set(
        {
          playlistStatus: "loading",
          playlistError: null,
          playlistErrorCode: null,
        },
        false,
        "playlist/plan:start"
      );
      try {
        const mood =
          (args && typeof args.mood === "string"
            ? args.mood
            : get().playlistMoodInput) || "";

        const res = await fetch(
          `${apiBase}/api/plan/`,
          await withAuth({
            method: "POST",
            body: JSON.stringify({ mood }),
          })
        );
        const code = res.status;
        const body = await res.json().catch(() => ({} as any));

        if (!res.ok) {
          set(
            {
              playlistStatus: "failed",
              playlistError: body?.detail ?? "Plan failed",
              playlistErrorCode: code,
            },
            false,
            "playlist/plan:failed"
          );
          return;
        }

        set(
          {
            playlistStatus: "succeeded",
            playlistError: null,
            playlistErrorCode: null,
          },
          false,
          "playlist/plan:success"
        );
        return body; // return plan payload to caller
      } catch (e: any) {
        set(
          {
            playlistStatus: "failed",
            playlistError: e?.message ?? "Network error",
            playlistErrorCode: null,
          },
          false,
          "playlist/plan:failed:exception"
        );
      }
    },

    build: async (args) => {
      set(
        {
          playlistStatus: "loading",
          playlistError: null,
          playlistErrorCode: null,
        },
        false,
        "playlist/build:start"
      );
      try {
        const moodFromState = get().playlistMoodInput || undefined;
        const payload: Record<string, any> = {};

        // prefer explicit args, otherwise fall back to state mood for mood-based builds
        if (args?.plan && typeof args.plan === "object") {
          payload.plan = args.plan;
        } else if (typeof (args?.mood ?? moodFromState) === "string") {
          payload.mood = (args?.mood ?? moodFromState) as string;
        }

        if (typeof args?.length === "number") payload.length = args.length;
        if (typeof args?.public === "boolean") payload.public = args.public;
        if (typeof args?.collaborative === "boolean")
          payload.collaborative = args.collaborative;
        if (typeof args?.name === "string") payload.name = args.name;

        const res = await fetch(
          `${apiBase}/api/playlist/build/`,
          await withAuth({
            method: "POST",
            body: JSON.stringify(payload),
          })
        );

        const code = res.status;
        const body = await res.json().catch(() => ({} as any));

        if (!res.ok) {
          set(
            {
              playlistStatus: "failed",
              playlistError: body?.detail ?? "Build failed",
              playlistErrorCode: code,
            },
            false,
            "playlist/build:failed"
          );
          return;
        }

        set(
          {
            playlistStatus: "succeeded",
            playlistError: null,
            playlistErrorCode: null,
          },
          false,
          "playlist/build:success"
        );
        return body; // return build response to caller
      } catch (e: any) {
        set(
          {
            playlistStatus: "failed",
            playlistError: e?.message ?? "Network error",
            playlistErrorCode: null,
          },
          false,
          "playlist/build:failed:exception"
        );
      }
    },

    // ---- granular resets ----
    resetPlaylistMoodInput: () =>
      set({ playlistMoodInput: "" }, false, "playlist/reset:moodInput"),
    resetPlaylistError: () =>
      set({ playlistError: null }, false, "playlist/reset:error"),
    resetPlaylistErrorCode: () =>
      set({ playlistErrorCode: null }, false, "playlist/reset:errorCode"),
    resetPlaylistStatus: () =>
      set({ playlistStatus: "idle" }, false, "playlist/reset:status"),

    // ---- reset all ----
    resetAllPlaylist: () =>
      set(
        {
          playlistMoodInput: "",
          playlistError: null,
          playlistErrorCode: null,
          playlistStatus: "idle",
        },
        false,
        "playlist/reset:all"
      ),
  };
};
