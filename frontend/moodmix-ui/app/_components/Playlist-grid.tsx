// app/_components/Playlist-grid.tsx
"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import type { PlaylistItemDTO } from "@/slices/playlist/playlistDTO";

type Props = {
  items: PlaylistItemDTO[]; // assume server already paginates via `limit`
  onItemClick?: (item: PlaylistItemDTO) => void;
};

export default function PlaylistGrid({ items, onItemClick }: Props) {
  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-3 xl:grid-cols-5">
      {items.map((p) => {
        const hasUrl = !!p.spotify_url;

        const openCard = () => {
          if (hasUrl) {
            // Open the Spotify playlist in a new tab
            window.open(
              p.spotify_url as string,
              "_blank",
              "noopener,noreferrer"
            );
          } else {
            // Fallback to any custom handler if there's no URL
            onItemClick?.(p);
          }
        };

        const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openCard();
          }
        };

        return (
          <Card
            key={p.id}
            className="group relative overflow-hidden rounded-xl border p-3 bg-card transition-colors duration-200 hover:bg-muted dark:hover:bg-muted-500 shadow-sm hover:shadow-md hover:cursor-pointer"
            onClick={openCard}
            onKeyDown={handleKey}
            role="button"
            tabIndex={0}
            aria-label={
              hasUrl ? `Open "${p.name}" on Spotify` : `Open "${p.name}"`
            }
            title={hasUrl ? "Open in Spotify" : undefined}
          >
            {/* cover (square, matches skeleton) */}
            <div className="relative w-full aspect-square overflow-hidden rounded-md bg-muted/30">
              {p.cached_images?.[0]?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.cached_images[0].url}
                  alt={p.name}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                  loading="lazy"
                />
              ) : null}
            </div>

            {/* text */}
            <div className="mt-2 space-y-2">
              <div className="text-sm font-medium truncate" title={p.name}>
                {p.name}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {p.cached_description ?? p.mood}
              </div>

              {p.spotify_url ? (
                <a
                  href={p.spotify_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-xs underline hover:cursor-pointer"
                  onClick={(e) => {
                    // prevent the card's onClick from firing as well
                    e.stopPropagation();
                  }}
                >
                  Open in Spotify
                </a>
              ) : null}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
