// slices/playlist/playlistSlice.ts
import { StateCreator } from "zustand";
import { auth } from "@/firebase/firebaseConfig";
import type { AppState } from "@/store/appStore";
import type {
  PlaylistDTO,
  MoodPlanDTO,
  BuildResponseDTO,
} from "@/slices/playlist/playlistDTO";

export interface PlaylistSlice {
  // state
  playlistMoodInput: string;
  playlistError: string | null;
  playlistErrorCode: number | null;
  playlistStatus: "idle" | "loading" | "succeeded" | "failed";

  /** /api/playlist/list/ result */
  playlistList: PlaylistDTO | null;

  /** last successful plan result (root-level plan object) */
  playlistPlan: MoodPlanDTO | null;

  /** last successful build result */
  playlistBuild: BuildResponseDTO | null;

  // actions
  plan: (args?: { mood?: string }) => Promise<MoodPlanDTO | void>;
  build: (args?: {
    mood?: string;
    length?: number;
    public?: boolean;
    collaborative?: boolean;
    name?: string;
    plan?: Record<string, any>;
  }) => Promise<BuildResponseDTO | void>;
  listPlaylists: (args?: {
    limit?: number;
    offset?: number;
  }) => Promise<PlaylistDTO | void>;

  /** Chained: plan → build */
  planThenBuild: (args: {
    mood: string;
    length?: number;
    public?: boolean;
    collaborative?: boolean;
    name?: string;
  }) => Promise<BuildResponseDTO | void>;

  // granular resets
  resetPlaylistMoodInput: () => void;
  resetPlaylistError: () => void;
  resetPlaylistErrorCode: () => void;
  resetPlaylistStatus: () => void;
  resetPlaylistList: () => void;
  resetPlaylistPlan: () => void;
  resetPlaylistBuild: () => void;

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
    playlistList: null as PlaylistDTO | null,
    playlistPlan: null as MoodPlanDTO | null,
    playlistBuild: null as BuildResponseDTO | null,
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
        const body = (await res.json().catch(() => ({}))) as unknown;

        if (!res.ok) {
          set(
            {
              playlistStatus: "failed",
              playlistError: (body as any)?.detail ?? "Plan failed",
              playlistErrorCode: code,
            },
            false,
            "playlist/plan:failed"
          );
          return;
        }

        // Expect root-level plan shape
        const plan = body as MoodPlanDTO;
        const isValid =
          plan &&
          typeof (plan as any).normalized_mood === "string" &&
          typeof (plan as any).intent === "string" &&
          Array.isArray((plan as any).semantic_tags) &&
          typeof (plan as any).length === "number";

        if (!isValid) {
          set(
            {
              playlistStatus: "failed",
              playlistError: "Invalid plan shape",
              playlistErrorCode: code,
            },
            false,
            "playlist/plan:failed:shape"
          );
          return;
        }

        set(
          {
            playlistStatus: "succeeded",
            playlistError: null,
            playlistErrorCode: null,
            playlistPlan: plan,
          },
          false,
          "playlist/plan:success"
        );
        return plan;
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

        // prefer explicit plan, otherwise mood
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
        const body = (await res.json().catch(() => ({}))) as BuildResponseDTO;

        if (!res.ok) {
          set(
            {
              playlistStatus: "failed",
              playlistError: (body as any)?.detail ?? "Build failed",
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
            playlistBuild: body,
          },
          false,
          "playlist/build:success"
        );
        return body;
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

    listPlaylists: async (args) => {
      set(
        {
          playlistStatus: "loading",
          playlistError: null,
          playlistErrorCode: null,
        },
        false,
        "playlist/list:start"
      );
      try {
        const limit = typeof args?.limit === "number" ? args.limit : 25;
        const offset = typeof args?.offset === "number" ? args.offset : 0;
        const qs = new URLSearchParams({
          limit: String(limit),
          offset: String(offset),
        }).toString();

        const res = await fetch(
          `${apiBase}/api/playlist/list/?${qs}`,
          await withAuth({ method: "GET" })
        );

        const code = res.status;
        const body = (await res.json().catch(() => ({}))) as PlaylistDTO;

        if (!res.ok) {
          set(
            {
              playlistStatus: "failed",
              playlistError: (body as any)?.detail ?? "List playlists failed",
              playlistErrorCode: code,
            },
            false,
            "playlist/list:failed"
          );
          return;
        }

        set(
          {
            playlistStatus: "succeeded",
            playlistError: null,
            playlistErrorCode: null,
            playlistList: body,
          },
          false,
          "playlist/list:success"
        );
        return body;
      } catch (e: any) {
        set(
          {
            playlistStatus: "failed",
            playlistError: e?.message ?? "Network error",
            playlistErrorCode: null,
          },
          false,
          "playlist/list:failed:exception"
        );
      }
    },

    /** plan → build chain using the backend plan (root-level) as build input */
    planThenBuild: async (args) => {
      set(
        {
          playlistStatus: "loading",
          playlistError: null,
          playlistErrorCode: null,
        },
        false,
        "playlist/planThenBuild:start"
      );

      // 1) plan
      const plan = await get().plan({ mood: args.mood });
      if (!plan) {
        return; // plan set error state already
      }

      // optional devtools breadcrumb
      set((s) => s, false, "playlist/planThenBuild:plan:success");

      // 2) build with plan
      const buildRes = await get().build({
        plan, // feed plan straight through
        length: args.length,
        public: args.public,
        collaborative: args.collaborative,
        name: args.name,
      });

      set((s) => s, false, "playlist/planThenBuild:build:return");
      return buildRes;
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
    resetPlaylistList: () =>
      set({ playlistList: null }, false, "playlist/reset:list"),
    resetPlaylistPlan: () =>
      set({ playlistPlan: null }, false, "playlist/reset:plan"),
    resetPlaylistBuild: () =>
      set({ playlistBuild: null }, false, "playlist/reset:build"),

    // ---- reset all ----
    resetAllPlaylist: () =>
      set(
        {
          playlistMoodInput: "",
          playlistError: null,
          playlistErrorCode: null,
          playlistStatus: "idle",
          playlistList: null,
          playlistPlan: null,
          playlistBuild: null,
        },
        false,
        "playlist/reset:all"
      ),
  };
};
