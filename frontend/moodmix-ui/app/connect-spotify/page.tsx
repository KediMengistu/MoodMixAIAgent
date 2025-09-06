// app/connect-spotify/page.tsx
import { ConnectSpotifyForm } from "@/app/_components/Connect-spotify-form";

export default function ConnectSpotify() {
  return (
    <div className="relative min-h-[391px] h-full w-full p-2 overflow-y-auto flex items-center justify-center">
      <div className="relative z-10">
        <ConnectSpotifyForm />
      </div>
    </div>
  );
}
