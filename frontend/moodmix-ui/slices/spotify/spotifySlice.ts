import { StateCreator } from "zustand";
import { auth } from "@/firebase/firebaseConfig";

export interface SpotifySlice {
  // state
  spotifyConnected: boolean;
  spotifyError: string | null;
  spotifyErrorCode: number | null;
  spotifyStatus: "idle" | "loading" | "succeeded" | "failed";
  spotifyInitiatedConnect: boolean;

  // actions
  spotifyConnect: () => Promise<string | null>; // get authorize_url (no state flip on success)
  spotifyCallback: (args: { state: string; code: string }) => Promise<void>;
  spotifyRefresh: () => Promise<void>;

  // granular resets
  resetSpotifyConnected: () => void;
  resetSpotifyError: () => void;
  resetSpotifyErrorCode: () => void;
  resetSpotifyStatus: () => void;
  resetSpotifyInitiatedConnect: () => void;

  // reset all
  resetAllSpotify: () => void;
}

export const createSpotifySlice: StateCreator<
  SpotifySlice,
  [],
  [],
  SpotifySlice
> = (set, get) => {
  const apiBase = ""; // e.g., process.env.NEXT_PUBLIC_API_BASE ?? "" if you proxy /api to backend

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

  return {
    // defaults
    spotifyConnected: false,
    spotifyError: null,
    spotifyErrorCode: null,
    spotifyStatus: "idle",
    spotifyInitiatedConnect: false,

    // GET authorize URL (JSON). Do not flip spotifyInitiatedConnect on success.
    spotifyConnect: async () => {
      set({
        spotifyStatus: "loading",
        spotifyError: null,
        spotifyErrorCode: null,
      });
      try {
        const res = await fetch(
          `${apiBase}/api/auth/spotify/`,
          await withAuth({ method: "POST" })
        );
        const code = res.status;
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          set({
            spotifyStatus: "failed",
            spotifyError: body?.detail ?? "Failed to get Spotify authorize URL",
            spotifyErrorCode: code,
            spotifyInitiatedConnect: false, // per your rule: set false on failure only
          });
          return null;
        }
        const data = (await res.json()) as { authorize_url?: string };
        set({ spotifyStatus: "succeeded" });
        return data?.authorize_url ?? null;
      } catch (e: any) {
        set({
          spotifyStatus: "failed",
          spotifyError: e?.message ?? "Network error",
          spotifyErrorCode: null,
          spotifyInitiatedConnect: false,
        });
        return null;
      }
    },

    // Middleman handler after OAuth redirects back to your app
    spotifyCallback: async ({ state, code }) => {
      set({
        spotifyStatus: "loading",
        spotifyError: null,
        spotifyErrorCode: null,
      });
      try {
        const qs = new URLSearchParams({ state, code }).toString();
        // callback is AllowAny; auth not required
        const res = await fetch(`${apiBase}/api/auth/spotify/callback/?${qs}`, {
          method: "GET",
        });
        const status = res.status;
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          set({
            spotifyConnected: false,
            spotifyStatus: "failed",
            spotifyError: body?.detail ?? "Spotify callback failed",
            spotifyErrorCode: status,
            spotifyInitiatedConnect: false, // always clear on completion
          });
          return;
        }
        set({
          spotifyConnected: true,
          spotifyStatus: "succeeded",
          spotifyError: null,
          spotifyErrorCode: null,
          spotifyInitiatedConnect: false, // always clear on completion
        });
      } catch (e: any) {
        set({
          spotifyConnected: false,
          spotifyStatus: "failed",
          spotifyError: e?.message ?? "Network error",
          spotifyErrorCode: null,
          spotifyInitiatedConnect: false,
        });
      }
    },

    // Validate linkage / refresh token
    spotifyRefresh: async () => {
      set({
        spotifyStatus: "loading",
        spotifyError: null,
        spotifyErrorCode: null,
      });
      try {
        const res = await fetch(
          `${apiBase}/api/auth/spotify/refresh/`,
          await withAuth({ method: "POST" })
        );
        const status = res.status;
        if (!res.ok) {
          const body = await res.json().catch(() => ({} as any));
          const noRefreshToken = body?.detail === "No refresh token on file.";
          const invalidGrant =
            body?.spotify_response?.error === "invalid_grant";

          if (status === 400 && (noRefreshToken || invalidGrant)) {
            // “Not connected” cases → prompt connect flow
            set({
              spotifyConnected: false,
              spotifyInitiatedConnect: true,
              spotifyStatus: "failed",
              spotifyError: body?.detail ?? "Spotify not connected",
              spotifyErrorCode: status,
            });
          } else {
            // Other failures: record error; do not flip connected
            set({
              spotifyStatus: "failed",
              spotifyError: body?.detail ?? "Refresh failed",
              spotifyErrorCode: status,
            });
          }
          return;
        }

        // success -> linked and token valid
        set({
          spotifyConnected: true,
          spotifyStatus: "succeeded",
          spotifyError: null,
          spotifyErrorCode: null,
        });
      } catch (e: any) {
        set({
          spotifyStatus: "failed",
          spotifyError: e?.message ?? "Network error",
          spotifyErrorCode: null,
        });
      }
    },

    // granular resets
    resetSpotifyConnected: () => set({ spotifyConnected: false }),
    resetSpotifyError: () => set({ spotifyError: null }),
    resetSpotifyErrorCode: () => set({ spotifyErrorCode: null }),
    resetSpotifyStatus: () => set({ spotifyStatus: "idle" }),
    resetSpotifyInitiatedConnect: () => set({ spotifyInitiatedConnect: false }),

    // reset all
    resetAllSpotify: () =>
      set({
        spotifyConnected: false,
        spotifyError: null,
        spotifyErrorCode: null,
        spotifyStatus: "idle",
        spotifyInitiatedConnect: false,
      }),
  };
};
