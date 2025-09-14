// app/home/my-playlists/page.tsx
"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { useAppStore } from "@/store/appStore";
import { PlaylistSkeletonGrid } from "@/app/_components/Playlist-skeleton-grid";
import PlaylistGrid from "@/app/_components/Playlist-grid";
import type { PlaylistItemDTO } from "@/slices/playlist/playlistDTO";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
  PaginationLink,
  PaginationEllipsis,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";

const PAGE_LIMIT = 10; // 5x2 target (desktop), responsive down to 3x3 and 1x1

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

  // Use backend-provided pagination info when available
  const respLimit = playlistList?.limit ?? PAGE_LIMIT;
  const respOffset = playlistList?.offset ?? offset;
  const totalCount = playlistList?.count ?? 0;

  const totalPages = Math.max(1, Math.ceil(totalCount / respLimit));
  const currentPage = Math.floor(respOffset / respLimit) + 1;
  const canPrev = currentPage > 1;
  const canNext = currentPage < totalPages;

  const goToPage = (page: number) => {
    const nextOffset = (page - 1) * respLimit;
    triggerView(nextOffset);
  };

  const getPageNumbers = (total: number, current: number) => {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    if (current <= 4) return [1, 2, 3, 4, 5, "...", total];
    if (current >= total - 3)
      return [1, "...", total - 4, total - 3, total - 2, total - 1, total];
    return [1, "...", current - 1, current, current + 1, "...", total];
  };

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
        <Card className="h-full w-full p-3 border-1 space-y-2 overflow-y-auto scrollbar-hide rounded-none">
          {/* GRID */}
          {isLoading ? (
            <PlaylistSkeletonGrid />
          ) : items.length ? (
            <div className="space-y-4">
              <PlaylistGrid
                items={items}
                onItemClick={(item) => {
                  // place navigation or modal open here if desired
                }}
              />

              {/* Pagination renders only when we have more than one page */}
              {totalPages > 1 && (
                <div className="space-y-2">
                  <Pagination>
                    <PaginationContent className="justify-between sm:justify-center">
                      <PaginationItem>
                        <PaginationPrevious
                          href="#"
                          className={cn(
                            (!canPrev || isLoading) &&
                              "pointer-events-none opacity-50"
                          )}
                          onClick={(e) => {
                            e.preventDefault();
                            if (!canPrev || isLoading) return;
                            goToPage(currentPage - 1);
                          }}
                        />
                      </PaginationItem>

                      {getPageNumbers(totalPages, currentPage).map((v, i) =>
                        v === "..." ? (
                          <PaginationItem key={`ellipsis-${i}`}>
                            <PaginationEllipsis />
                          </PaginationItem>
                        ) : (
                          <PaginationItem key={`p-${v}`}>
                            <PaginationLink
                              href="#"
                              isActive={v === currentPage}
                              onClick={(e) => {
                                e.preventDefault();
                                if (v !== currentPage && !isLoading)
                                  goToPage(v as number);
                              }}
                            >
                              {v}
                            </PaginationLink>
                          </PaginationItem>
                        )
                      )}

                      <PaginationItem>
                        <PaginationNext
                          href="#"
                          className={cn(
                            (!canNext || isLoading) &&
                              "pointer-events-none opacity-50"
                          )}
                          onClick={(e) => {
                            e.preventDefault();
                            if (!canNext || isLoading) return;
                            goToPage(currentPage + 1);
                          }}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>

                  {/* Tight, muted notice below pagination */}
                  <p className="text-center text-[9px] text-muted-foreground">
                    MoodMix4U playlist data may be up to 24 hours out of date.
                    If you deleted a playlist in Spotify, it may still appear
                    here until the daily refresh completes.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-sm text-muted-foreground py-10">
              No playlists yet.
            </div>
          )}
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
