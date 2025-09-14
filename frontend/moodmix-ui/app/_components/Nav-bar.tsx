// app/_components/Nav-bar.tsx
"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "./Mode-toggle";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Menu as MenuIcon } from "lucide-react";
import { BsMusicNoteBeamed } from "react-icons/bs";
import { useAppStore } from "@/store/appStore";
import { useRouter } from "next/navigation";

// Single source of truth for links
type NavLinkGroup = {
  label: "About" | "Playlist";
  type: "description";
  items: { label: string; href: string; description?: string }[];
};

const NAV_LINKS: NavLinkGroup[] = [
  {
    label: "About",
    type: "description",
    items: [
      {
        label: "Purpose",
        href: "#about-purpose",
        description: "What it does and who it’s for.",
      },
      {
        label: "Architecture",
        href: "#about-architecture",
        description: "How the parts connect.",
      },
      {
        label: "Tech Stack",
        href: "#about-tech-stack",
        description: "Frameworks and services.",
      },
    ],
  },
  {
    label: "Playlist",
    type: "description",
    items: [
      {
        label: "Create Playlist",
        href: "#playlist-create",
        description: "Generate mood-based mixes.",
      },
      {
        label: "View Playlist",
        href: "#playlist-view",
        description: "Browse and manage your mixes.",
      },
    ],
  },
];

export function NavBar() {
  const logout = useAppStore((s) => s.authLogout);
  const status = useAppStore((s) => s.authStatus);
  const router = useRouter();

  // Control the Popover open state so we can close it after a selection
  const [menuOpen, setMenuOpen] = React.useState(false);

  // Optional route overrides
  const CLICK_ROUTES: Record<string, string> = {
    "Create Playlist": "/home",
    "View Playlist": "/home/my-playlists",
  };

  return (
    <Card
      className={cn(
        "sticky z-10 top-0 left-0 w-full h-fit",
        "grid grid-cols-3 items-center",
        "p-2 shadow-[0px_2px_3px_-1px_rgba(0,0,0,0.1),0px_1px_0px_0px_rgba(25,28,33,0.02),0px_0px_0px_1px_rgba(25,28,33,0.08)]",
        "rounded-none dark:bg-black"
      )}
    >
      {/* COL 1: Single popover menu + sign out */}
      <div className="flex items-center gap-2">
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild className="cursor-pointer">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 cursor-pointer"
              aria-label="Open menu"
            >
              <MenuIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>

          {/* Make the whole menu area show a pointer, including all descendants */}
          <PopoverContent
            align="start"
            className="w-72 p-1 cursor-pointer [&_*]:cursor-pointer"
            role="menu"
          >
            <nav className="flex flex-col">
              {NAV_LINKS.map((group, gi) => (
                <React.Fragment key={group.label + gi}>
                  <div className="py-1">
                    <div className="px-2 py-1.5 text-[11px] font-normal text-muted-foreground underline underline-offset-4">
                      {group.label}
                    </div>
                    <ul className="flex flex-col">
                      {group.items.map((item) => (
                        <React.Fragment key={item.label}>
                          <li>
                            <a
                              href={item.href}
                              role="menuitem"
                              className="block rounded-md px-3 py-1.5 text-xs font-normal hover:bg-accent hover:text-accent-foreground"
                              onClick={(e) => {
                                // Always close the menu when an item is chosen
                                setMenuOpen(false);

                                const to = CLICK_ROUTES[item.label];
                                if (to) {
                                  e.preventDefault();
                                  router.push(to);
                                }
                                // If no route override, let the default anchor navigate (hash link)
                              }}
                            >
                              <div className="leading-tight">{item.label}</div>
                              {item.description ? (
                                <div className="text-[10px] text-muted-foreground leading-snug italic">
                                  {item.description}
                                </div>
                              ) : null}
                            </a>
                          </li>
                        </React.Fragment>
                      ))}
                    </ul>
                  </div>
                </React.Fragment>
              ))}
            </nav>
          </PopoverContent>
        </Popover>

        <Button
          variant="outline"
          size="sm"
          className="h-7 px-3 text-[11px] rounded-full shadow-none cursor-pointer font-normal"
          onClick={async () => {
            await logout();
          }}
          disabled={status === "loading"}
        >
          Sign out
        </Button>
      </div>

      {/* COL 2: Center brand icon (click to /home) */}
      <div className="flex items-center justify-self-center">
        <button
          type="button"
          aria-label="MoodMix4U Home"
          className="flex items-center gap-2 text-primary hover:text-primary/90 cursor-pointer border-none bg-transparent p-0 outline-none focus-visible:outline-none focus-visible:ring-0"
          onClick={() => router.push("/home")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              router.push("/home");
            }
          }}
        >
          <BsMusicNoteBeamed
            aria-hidden="true"
            className="text-[12px] sm:text-sm opacity-80 text-black dark:text-white"
          />
        </button>
      </div>

      {/* COL 3: Mode toggle */}
      <div className="flex items-center justify-end">
        <ModeToggle className="w-9 h-9 p-0" />
      </div>
    </Card>
  );
}
