// slices/auth/authSlice.ts
import { StateCreator } from "zustand";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { auth } from "@/firebase/firebaseConfig";
import { signInWithGoogle } from "@/firebase/auth_google_signin_popup";
import { signOut as fbSignOut } from "firebase/auth";
import { signOutWithGoogle } from "@/firebase/auth_google_signout";
import type { AppState } from "@/store/appStore";

export interface AuthSlice {
  // state
  authUser: FirebaseUser | null;
  authLoggedIn: boolean;
  authError: string | null;
  authErrorCode: string | null;
  authStatus: "idle" | "loading" | "succeeded" | "failed";

  // actions
  authLogin: () => Promise<void>;
  authLogout: () => Promise<void>;
  authInitListener: () => void;

  // granular resets
  resetAuthUser: () => void;
  resetAuthLoggedIn: () => void;
  resetAuthError: () => void;
  resetAuthErrorCode: () => void;
  resetAuthStatus: () => void;

  // reset all
  resetAllAuth: () => void;
}

const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "";

/**
 * Important: include the middleware tuple so `set` supports the 3rd "action name" arg.
 * The order matches how the store is composed: devtools(persist(...))
 */
export const createAuthSlice: StateCreator<
  AppState,
  [["zustand/devtools", never], ["zustand/persist", unknown]],
  [],
  AuthSlice
> = (set, get) => {
  let detach: (() => void) | null = null;

  // Helper: perform blocking server handshake; throws on failure
  const handshake = async (user: FirebaseUser) => {
    const token = await user.getIdToken();
    const res = await fetch(`${apiBase}/api/auth/moodmix/`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({} as any));
      const msg = body?.detail ?? `Server handshake failed (${res.status}).`;
      const err: any = new Error(msg);
      err.code = String(res.status);
      throw err;
    }
  };

  return {
    // defaults
    authUser: null,
    authLoggedIn: false,
    authError: null,
    authErrorCode: null,
    authStatus: "idle",

    authLogin: async () => {
      set(
        { authStatus: "loading", authError: null, authErrorCode: null },
        false,
        "auth/login:start"
      );
      try {
        // 1) Firebase popup
        const { user } = await signInWithGoogle();

        // 2) BLOCKING handshake; if it throws, keep loggedIn=false and sign out
        try {
          await handshake(user);
        } catch (e: any) {
          await signOutWithGoogle().catch(() => {});
          set(
            {
              authStatus: "failed",
              authError: e?.message ?? "Server handshake failed.",
              authErrorCode: e?.code ?? null,
              authLoggedIn: false,
              authUser: null,
            },
            false,
            "auth/login:handshake:failed"
          );
          return; // stop flow
        }

        // 3) Only now mark as logged in
        set(
          {
            authUser: user,
            authLoggedIn: true,
            authStatus: "succeeded",
            authError: null,
            authErrorCode: null,
          },
          false,
          "auth/login:success"
        );

        // 4) Check Spotify linkage
        await get().spotifyRefresh?.();
      } catch (err: any) {
        set(
          {
            authStatus: "failed",
            authError: err?.message ?? "Login failed",
            authErrorCode: err?.code ?? null,
            authLoggedIn: false,
          },
          false,
          "auth/login:failed"
        );
      }
    },

    authLogout: async () => {
      set(
        { authStatus: "loading", authError: null, authErrorCode: null },
        false,
        "auth/logout:start"
      );
      try {
        await signOutWithGoogle();

        // Reset ALL dependent slices on successful logout
        get().resetAllSpotify?.();
        get().resetAllPlaylist?.();

        set(
          {
            authUser: null,
            authLoggedIn: false,
            authError: null,
            authErrorCode: null,
            authStatus: "idle",
          },
          false,
          "auth/logout:success"
        );
      } catch (err: any) {
        set(
          {
            authStatus: "failed",
            authError: err?.message ?? "Logout failed",
            authErrorCode: err?.code ?? null,
          },
          false,
          "auth/logout:failed"
        );
      }
    },

    authInitListener: () => {
      if (detach) return;
      detach = onAuthStateChanged(auth, async (user) => {
        if (!user) {
          // No user (cold start or cross-tab sign out): reset dependent slices
          get().resetAllSpotify?.();
          get().resetAllPlaylist?.();

          set(
            {
              authUser: null,
              authLoggedIn: false,
              authError: null,
              authErrorCode: null,
              authStatus: "idle",
            },
            false,
            "auth/init:listener:no-user"
          );
          return;
        }

        // We have a Firebase user; require handshake before setting loggedIn=true
        set(
          (s) => ({ ...s, authStatus: "loading" }),
          false,
          "auth/init:listener:loading"
        );
        try {
          await handshake(user);
        } catch (e: any) {
          // Handshake failed on restore → sign out & keep loggedIn=false
          await fbSignOut(auth).catch(() => {});
          get().resetAllSpotify?.();
          get().resetAllPlaylist?.();

          set(
            {
              authUser: null,
              authLoggedIn: false,
              authStatus: "failed",
              authError: e?.message ?? "Server handshake failed.",
              authErrorCode: e?.code ?? null,
            },
            false,
            "auth/init:listener:handshake:failed"
          );
          return;
        }

        // Handshake OK → now we can consider the session valid
        set(
          {
            authUser: user,
            authLoggedIn: true,
            authStatus: "succeeded",
            authError: null,
            authErrorCode: null,
          },
          false,
          "auth/init:listener:handshake:ok"
        );

        // Session restore: check Spotify linkage
        await get().spotifyRefresh?.();
      });
    },

    // granular resets
    resetAuthUser: () => set({ authUser: null }, false, "auth/reset:user"),
    resetAuthLoggedIn: () =>
      set({ authLoggedIn: false }, false, "auth/reset:loggedIn"),
    resetAuthError: () => set({ authError: null }, false, "auth/reset:error"),
    resetAuthErrorCode: () =>
      set({ authErrorCode: null }, false, "auth/reset:errorCode"),
    resetAuthStatus: () =>
      set({ authStatus: "idle" }, false, "auth/reset:status"),

    // reset all (slice-only)
    resetAllAuth: () =>
      set(
        {
          authUser: null,
          authLoggedIn: false,
          authError: null,
          authErrorCode: null,
          authStatus: "idle",
        },
        false,
        "auth/reset:all"
      ),
  };
};
