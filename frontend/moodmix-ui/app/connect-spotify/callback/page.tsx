// app/connect-spotify/callback/page.tsx
import { Suspense } from "react";
import { ConnectSpotifyCallbackCard } from "@/app/_components/Connect-spotify-callback-card";

export default function ConnectSpotifyCallbackPage() {
  return (
    <Suspense fallback={null}>
      <ConnectSpotifyCallbackCard />
    </Suspense>
  );
}
