// app/_components/Playlist-skeleton-grid.tsx
"use client";

import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

/**
 * 10 skeletons total (page size = 10).
 * Breakpoints:
 * - xs: grid-cols-1  → 1 column × up to 10 rows
 * - sm: grid-cols-3  → 3 columns; wraps (3x3 + remainder) as needed
 * - xl: grid-cols-5  → 5 columns × 2 rows
 */
export function PlaylistSkeletonGrid() {
  const tiles = Array.from({ length: 10 });

  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-3 xl:grid-cols-5">
      {tiles.map((_, i) => (
        <Card
          key={i}
          className="relative overflow-hidden rounded-xl border p-3"
        >
          {/* cover (square, same as real card) */}
          <div className="relative w-full aspect-square overflow-hidden rounded-md bg-muted/30">
            <Skeleton className="absolute inset-0 h-full w-full" />
          </div>

          {/* text block (same vertical rhythm as real card) */}
          <div className="mt-2 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-24" />
          </div>
        </Card>
      ))}
    </div>
  );
}
