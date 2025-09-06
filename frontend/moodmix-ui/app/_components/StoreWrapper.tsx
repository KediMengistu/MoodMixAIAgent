"use client";
import { useEffect } from "react";
import { useAppStore } from "@/store/appStore";
import { usePathname, useRouter } from "next/dist/client/components/navigation";

export function StoreWrapper({ children }: { children: React.ReactNode }) {
  const pathName = usePathname();
  const router = useRouter();
  const initAuthListener = useAppStore((s) => s.initAuthListener);
  const loggedIn = useAppStore((s) => s.loggedIn);
  useEffect(() => {
    // Perform any necessary side effects here
    if (loggedIn && pathName === "/") {
      // Redirect to the dashboard or another page
      router.push("/home");
    } else if (!loggedIn && pathName !== "/") {
      router.push("/");
    }
  }, [loggedIn, pathName]);
  useEffect(() => {
    initAuthListener();
  }, [initAuthListener]);
  return <>{children}</>;
}
