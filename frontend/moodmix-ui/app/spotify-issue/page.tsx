// app/spotify-issue/page.tsx
import { SpotifyIssueCard } from "@/app/_components/Spotify-issue-card";

export default function SpotifyIssue() {
  return (
    <div className="relative h-full w-full p-2 overflow-y-auto scrollbar-hide flex items-center justify-center">
      <div className="relative z-10">
        <SpotifyIssueCard />
      </div>
    </div>
  );
}
