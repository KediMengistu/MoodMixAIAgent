"use client";

import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

/**
 * Grid: 1 (xs), 3 (sm+), 5 (xl+)
 * Shows 1 / 9 / 25 tiles to match content grid exactly.
 */
export function PlaylistSkeletonGrid() {
  const tiles = Array.from({ length: 25 });

  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-3 xl:grid-cols-5">
      {tiles.map((_, i) => {
        const vis =
          i === 0 ? "" : i < 9 ? "hidden sm:block" : "hidden xl:block";

        return (
          <div key={i} className={vis}>
            <Card className="relative overflow-hidden rounded-xl border p-3">
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
          </div>
        );
      })}
    </div>
  );
}
