import { StateCreator } from "zustand";
import { auth } from "@/firebase/firebaseConfig";
import type { AppState } from "@/store/appStore";

export interface SpotifySlice {
  // state
  spotifyConnected: boolean;
  spotifyError: string | null;
  spotifyErrorCode: number | null;
  spotifyStatus: "idle" | "loading" | "succeeded" | "failed";
  spotifyInitiatedConnect: boolean;

  /** true when refresh fails for non-token errors (cannot confirm linkage) */
  spotifyUnconfirmed: boolean;

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
  resetSpotifyUnconfirmed: () => void;

  // reset all
  resetAllSpotify: () => void;
}

/**
 * Important: the first generic is the FULL store type (AppState),
 * and include the middleware tuple to enable 3rd "action" arg to `set`.
 * Order matches your store: devtools(persist(...))
 */
export const createSpotifySlice: StateCreator<
  AppState,
  [["zustand/devtools", never], ["zustand/persist", unknown]],
  [],
  SpotifySlice
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

  return {
    // defaults
    spotifyConnected: false,
    spotifyError: null,
    spotifyErrorCode: null,
    spotifyStatus: "idle",
    spotifyInitiatedConnect: false,
    spotifyUnconfirmed: false,

    // GET authorize URL (JSON). Do not flip spotifyInitiatedConnect on success.
    spotifyConnect: async () => {
      set(
        {
          spotifyStatus: "loading",
          spotifyError: null,
          spotifyErrorCode: null,
        },
        false,
        "spotify/connect:start"
      );
      try {
        const res = await fetch(
          `${apiBase}/api/auth/spotify/`,
          await withAuth({ method: "POST" })
        );
        const code = res.status;
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          set(
            {
              spotifyStatus: "failed",
              spotifyError:
                body?.detail ?? "Failed to get Spotify authorize URL",
              spotifyErrorCode: code,
              spotifyInitiatedConnect: false,
            },
            false,
            "spotify/connect:failed"
          );
          return null;
        }
        const data = (await res.json()) as { authorize_url?: string };
        set({ spotifyStatus: "succeeded" }, false, "spotify/connect:success");
        return data?.authorize_url ?? null;
      } catch (e: any) {
        set(
          {
            spotifyStatus: "failed",
            spotifyError: e?.message ?? "Network error",
            spotifyErrorCode: null,
            spotifyInitiatedConnect: false,
          },
          false,
          "spotify/connect:failed:exception"
        );
        return null;
      }
    },

    // Middleman handler after OAuth redirects back to your app
    spotifyCallback: async ({ state, code }) => {
      set(
        {
          spotifyStatus: "loading",
          spotifyError: null,
          spotifyErrorCode: null,
        },
        false,
        "spotify/callback:start"
      );
      try {
        const qs = new URLSearchParams({ state, code }).toString();
        // callback is AllowAny; auth not required
        const res = await fetch(`${apiBase}/api/auth/spotify/callback/?${qs}`, {
          method: "GET",
        });
        const status = res.status;
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          set(
            {
              spotifyConnected: false,
              spotifyStatus: "failed",
              spotifyError: body?.detail ?? "Spotify callback failed",
              spotifyErrorCode: status,
              spotifyInitiatedConnect: false,
              // callback failures don't imply "unconfirmed" state; leave as-is
            },
            false,
            "spotify/callback:failed"
          );
          return;
        }
        set(
          {
            spotifyConnected: true,
            spotifyStatus: "succeeded",
            spotifyError: null,
            spotifyErrorCode: null,
            spotifyInitiatedConnect: false,
            spotifyUnconfirmed: false, // confirmed after successful callback
          },
          false,
          "spotify/callback:success"
        );
      } catch (e: any) {
        set(
          {
            spotifyConnected: false,
            spotifyStatus: "failed",
            spotifyError: e?.message ?? "Network error",
            spotifyErrorCode: null,
            spotifyInitiatedConnect: false,
            // leave unconfirmed as-is (this path is for callback)
          },
          false,
          "spotify/callback:failed:exception"
        );
      }
    },

    // Validate linkage / refresh token
    spotifyRefresh: async () => {
      set(
        {
          spotifyStatus: "loading",
          spotifyError: null,
          spotifyErrorCode: null,
        },
        false,
        "spotify/refresh:start"
      );
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
            // “Not connected” cases → prompt connect flow (confirmed state)
            set(
              {
                spotifyConnected: false,
                spotifyInitiatedConnect: true,
                spotifyStatus: "failed",
                spotifyError: body?.detail ?? "Spotify not connected",
                spotifyErrorCode: status,
                spotifyUnconfirmed: false, // explicitly "not connected" is confirmed
              },
              false,
              "spotify/refresh:not-connected"
            );
          } else {
            // Other failures: cannot confirm connectivity
            set(
              {
                spotifyStatus: "failed",
                spotifyError: body?.detail ?? "Refresh failed",
                spotifyErrorCode: status,
                spotifyUnconfirmed: true, // show issue page and auto-logout
              },
              false,
              "spotify/refresh:unconfirmed"
            );
          }
          return;
        }

        // success -> linked and token valid
        set(
          {
            spotifyConnected: true,
            spotifyStatus: "succeeded",
            spotifyError: null,
            spotifyErrorCode: null,
            spotifyUnconfirmed: false,
          },
          false,
          "spotify/refresh:success"
        );
      } catch (e: any) {
        set(
          {
            spotifyStatus: "failed",
            spotifyError: e?.message ?? "Network error",
            spotifyErrorCode: null,
            spotifyUnconfirmed: true, // network error → cannot confirm
          },
          false,
          "spotify/refresh:unconfirmed:exception"
        );
      }
    },

    // granular resets
    resetSpotifyConnected: () =>
      set({ spotifyConnected: false }, false, "spotify/reset:connected"),
    resetSpotifyError: () =>
      set({ spotifyError: null }, false, "spotify/reset:error"),
    resetSpotifyErrorCode: () =>
      set({ spotifyErrorCode: null }, false, "spotify/reset:errorCode"),
    resetSpotifyStatus: () =>
      set({ spotifyStatus: "idle" }, false, "spotify/reset:status"),
    resetSpotifyInitiatedConnect: () =>
      set({ spotifyInitiatedConnect: false }, false, "spotify/reset:initiated"),
    resetSpotifyUnconfirmed: () =>
      set({ spotifyUnconfirmed: false }, false, "spotify/reset:unconfirmed"),

    // reset all
    resetAllSpotify: () =>
      set(
        {
          spotifyConnected: false,
          spotifyError: null,
          spotifyErrorCode: null,
          spotifyStatus: "idle",
          spotifyInitiatedConnect: false,
          spotifyUnconfirmed: false,
        },
        false,
        "spotify/reset:all"
      ),
  };
};
