// app/_components/Store-wrapper.tsx
"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAppStore } from "@/store/appStore";

export function StoreWrapper({ children }: { children: React.ReactNode }) {
  const pathName = usePathname();
  const router = useRouter();

  // store state
  const authInitListener = useAppStore((s) => s.authInitListener);
  const authLoggedIn = useAppStore((s) => s.authLoggedIn);

  const spotifyInitiatedConnect = useAppStore((s) => s.spotifyInitiatedConnect);
  const spotifyConnected = useAppStore((s) => s.spotifyConnected);
  const spotifyUnconfirmed = useAppStore((s) => s.spotifyUnconfirmed);
  const spotifyStatus = useAppStore((s) => s.spotifyStatus);

  // ===== Hydration gate for zustand/persist =====
  const storePersist = (useAppStore as any).persist;
  const [hydrated, setHydrated] = React.useState<boolean>(
    storePersist?.hasHydrated?.() ?? false
  );

  React.useEffect(() => {
    if (storePersist?.hasHydrated?.()) setHydrated(true);
    const unsub = storePersist?.onFinishHydration?.(() => setHydrated(true));
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [storePersist]);

  // Attach the Firebase auth listener exactly once, after hydration
  const didAttachAuthRef = React.useRef(false);
  React.useEffect(() => {
    if (!hydrated || didAttachAuthRef.current) return;
    didAttachAuthRef.current = true;
    authInitListener();
  }, [hydrated, authInitListener]);

  // ===== Routing rules =====
  React.useEffect(() => {
    const R = {
      root: "/" as const,
      connect: "/connect-spotify" as const,
      callback: "/connect-spotify/callback" as const,
      issue: "/spotify-issue" as const,
      home: "/home" as const,
    };
    const isCallback = pathName === R.callback;

    // (A) Always give the callback route priority (prevents flicker to "/" or connect)
    if (isCallback) {
      // If callback failed (403, etc.) → go to issue page
      if (!spotifyConnected && spotifyStatus === "failed") {
        router.replace(R.issue);
        return;
      }
      // If callback succeeded → go home
      if (spotifyConnected) {
        router.replace(R.home);
        return;
      }
      // Otherwise, remain on callback while the callback action resolves.
      return;
    }

    // (B) Do not run other routing until persist is hydrated
    if (!hydrated) return;

    // (C) Not logged in → go to "/"
    if (!authLoggedIn) {
      if (pathName !== R.root) router.replace(R.root);
      return;
    }

    // (D) Unknown/infra failure anywhere → issue page (auto-logout happens there)
    if (spotifyUnconfirmed) {
      if (pathName !== R.issue) router.replace(R.issue);
      return;
    }

    // (E) Connected → land on "/home" from "/" or "/connect-spotify"
    if (spotifyConnected) {
      if (pathName === R.root || pathName === R.connect) {
        router.replace(R.home);
      }
      return;
    }

    // (F) Explicitly not connected → go to connect flow
    if (spotifyInitiatedConnect) {
      if (pathName !== R.connect) router.replace(R.connect);
      return;
    }

    // Otherwise, no forced navigation.
  }, [
    pathName,
    hydrated,
    authLoggedIn,
    spotifyConnected,
    spotifyInitiatedConnect,
    spotifyUnconfirmed,
    spotifyStatus,
    router,
  ]);

  return <>{children}</>;
}
