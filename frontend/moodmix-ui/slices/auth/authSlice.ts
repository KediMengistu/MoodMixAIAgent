import { StateCreator } from "zustand";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { auth } from "@/firebase/firebaseConfig";
import { signInWithGoogle } from "@/firebase/auth_google_signin_popup";
import { signOutWithGoogle } from "@/firebase/auth_google_signout";

export interface AuthSlice {
  // state
  authUser: FirebaseUser | null;
  authLoggedIn: boolean;
  authError: string | null;
  /** Firebase error code (e.g., "auth/popup-closed-by-user"), or null */
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

export const createAuthSlice: StateCreator<AuthSlice, [], [], AuthSlice> = (
  set
) => {
  // Keep a single subscription
  let detach: (() => void) | null = null;

  return {
    // defaults
    authUser: null,
    authLoggedIn: false,
    authError: null,
    authErrorCode: null,
    authStatus: "idle",

    authLogin: async () => {
      set({ authStatus: "loading", authError: null, authErrorCode: null });
      try {
        const { user } = await signInWithGoogle();
        set({
          authUser: user,
          authLoggedIn: true,
          authStatus: "succeeded",
          authError: null,
          authErrorCode: null,
        });
      } catch (err: any) {
        set({
          authStatus: "failed",
          authError: err?.message ?? "Login failed",
          authErrorCode: err?.code ?? null,
          authLoggedIn: false,
        });
      }
    },

    authLogout: async () => {
      set({ authStatus: "loading", authError: null, authErrorCode: null });
      try {
        await signOutWithGoogle();
        set({
          authUser: null,
          authLoggedIn: false,
          authError: null,
          authErrorCode: null,
          authStatus: "idle",
        });
      } catch (err: any) {
        set({
          authStatus: "failed",
          authError: err?.message ?? "Logout failed",
          authErrorCode: err?.code ?? null,
        });
      }
    },

    authInitListener: () => {
      if (detach) return; // already listening
      detach = onAuthStateChanged(auth, (user) => {
        set({
          authUser: user,
          authLoggedIn: !!user,
          authStatus: user ? "succeeded" : "idle",
          authError: null,
          authErrorCode: null,
        });
      });
    },

    // granular resets
    resetAuthUser: () => set({ authUser: null }),
    resetAuthLoggedIn: () => set({ authLoggedIn: false }),
    resetAuthError: () => set({ authError: null }),
    resetAuthErrorCode: () => set({ authErrorCode: null }),
    resetAuthStatus: () => set({ authStatus: "idle" }),

    // reset all
    resetAllAuth: () =>
      set({
        authUser: null,
        authLoggedIn: false,
        authError: null,
        authErrorCode: null,
        authStatus: "idle",
      }),
  };
};
