// app/home/my-playlists/page.tsx
"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/appStore";
import { PlaylistSkeletonGrid } from "@/app/_components/Playlist-skeleton-grid";
import type { PlaylistItemDTO } from "@/slices/playlist/playlistDTO";

const PAGE_LIMIT = 25; // matches the 5x5 max grid

export default function MyPlaylistsPage() {
  const listPlaylists = useAppStore((s) => s.listPlaylists);
  const playlistList = useAppStore((s) => s.playlistList);
  const status = useAppStore((s) => s.playlistStatus);

  const [offset, setOffset] = React.useState(0);
  const [delaying, setDelaying] = React.useState(true);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerView = React.useCallback(
    (nextOffset: number) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setDelaying(true);

      // 3s intentional delay -> show skeleton grid
      timerRef.current = setTimeout(async () => {
        setOffset(nextOffset);
        await listPlaylists({ limit: PAGE_LIMIT, offset: nextOffset });
        setDelaying(false);
      }, 3000);
    },
    [listPlaylists]
  );

  React.useEffect(() => {
    triggerView(0);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [triggerView]);

  const isLoading = delaying || status === "loading";
  const items: PlaylistItemDTO[] = playlistList?.results ?? [];

  const canPrev = offset > 0;
  const canNext = typeof playlistList?.next_offset === "number";

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="my-playlists-page"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        style={{ willChange: "transform", backfaceVisibility: "hidden" }}
        className="min-h-[391px] h-full w-full p-2 overflow-y-hidden"
      >
        <Card className="h-full w-full bg-transparent p-3 border-1 space-y-4 overflow-y-auto scrollbar-hide rounded-none">
          {/* GRID */}
          {isLoading ? (
            <PlaylistSkeletonGrid />
          ) : items.length ? (
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-3 xl:grid-cols-5">
              {items.map((p) => (
                <Card
                  key={p.id}
                  className="group relative overflow-hidden rounded-xl border p-3 bg-card transition-colors duration-200 hover:bg-muted dark:hover:bg-muted-500 shadow-sm hover:shadow-md cursor-pointer"
                >
                  {/* cover (same dimensions as the skeleton) */}
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

                  {/* text block (same rhythm as skeleton) */}
                  <div className="mt-2 space-y-2">
                    <div
                      className="text-sm font-medium truncate"
                      title={p.name}
                    >
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
                        className="inline-block text-xs underline"
                      >
                        Open in Spotify
                      </a>
                    ) : null}
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center text-sm text-muted-foreground py-10">
              No playlists yet.
            </div>
          )}

          {/* PAGINATION */}
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!canPrev || isLoading}
              onClick={() => triggerView(Math.max(0, offset - PAGE_LIMIT))}
            >
              Previous
            </Button>
            <div className="text-xs text-muted-foreground">
              {playlistList
                ? `Showing ${items.length} · Offset ${offset}`
                : isLoading
                ? "Loading…"
                : ""}
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={!canNext || isLoading}
              onClick={() =>
                triggerView(
                  typeof playlistList?.next_offset === "number"
                    ? playlistList.next_offset
                    : offset + PAGE_LIMIT
                )
              }
            >
              Next
            </Button>
          </div>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
