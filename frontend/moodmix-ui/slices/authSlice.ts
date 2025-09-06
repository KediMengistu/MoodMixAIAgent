import { StateCreator } from "zustand";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { auth } from "@/firebase/firebaseConfig";
import { signInWithGoogle } from "@/firebase/auth_google_signin_popup";
import { signOutWithGoogle } from "@/firebase/auth_google_signout";

export interface AuthSlice {
  user: FirebaseUser | null;
  loggedIn: boolean;
  error: string | null;
  status: "idle" | "loading" | "succeeded" | "failed";
  login: () => Promise<void>;
  logout: () => Promise<void>;
  initAuthListener: () => void;
}

export const createAuthSlice: StateCreator<AuthSlice, [], [], AuthSlice> = (
  set
) => {
  // Keep a single subscription
  let detach: (() => void) | null = null;

  return {
    user: null,
    loggedIn: false,
    error: null,
    status: "idle",

    login: async () => {
      set({ status: "loading", error: null });
      try {
        const { user } = await signInWithGoogle();
        set({ user, loggedIn: true, status: "succeeded", error: null });
      } catch (err: any) {
        set({
          status: "failed",
          error: err?.message ?? "Login failed",
          loggedIn: false,
        });
      }
    },

    logout: async () => {
      set({ status: "loading", error: null });
      try {
        await signOutWithGoogle();
        set({ user: null, loggedIn: false, status: "idle", error: null });
      } catch (err: any) {
        set({
          status: "failed",
          error: err?.message ?? "Logout failed",
        });
      }
    },

    initAuthListener: () => {
      if (detach) return; // already listening
      detach = onAuthStateChanged(auth, (user) => {
        set({
          user,
          loggedIn: !!user,
          status: user ? "succeeded" : "idle",
          error: null,
        });
      });
    },
  };
};
