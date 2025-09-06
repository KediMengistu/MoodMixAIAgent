import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { createAuthSlice, type AuthSlice } from "@/slices/authSlice";

type AppState = AuthSlice;

export const useAppStore = create<AppState>()(
  devtools(
    persist(
      (...a) => ({
        ...createAuthSlice(...a),
      }),
      {
        name: "app-store",
      }
    ),
    {
      name: "app-store", // shows up in Redux DevTools dropdown
    }
  )
);
