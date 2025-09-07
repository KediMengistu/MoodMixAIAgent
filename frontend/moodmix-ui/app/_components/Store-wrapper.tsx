// app/_components/Store-wrapper.tsx
"use client";
import { useEffect } from "react";
import { useAppStore } from "@/store/appStore";
import { usePathname, useRouter } from "next/navigation";

export function StoreWrapper({ children }: { children: React.ReactNode }) {
  const pathName = usePathname();
  const router = useRouter();

  const authInitListener = useAppStore((s) => s.authInitListener);
  const authLoggedIn = useAppStore((s) => s.authLoggedIn);

  useEffect(() => {
    if (authLoggedIn && pathName === "/") {
      router.push("/home");
    } else if (!authLoggedIn && pathName !== "/") {
      router.push("/");
    }
  }, [authLoggedIn, pathName, router]);

  useEffect(() => {
    authInitListener();
  }, [authInitListener]);

  return <>{children}</>;
}
