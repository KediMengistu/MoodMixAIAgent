"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "./Mode-toggle";
import { cn } from "@/lib/utils";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Menu as MenuIcon } from "lucide-react";
import { BsMusicNoteBeamed } from "react-icons/bs";
import { useAppStore } from "@/store/appStore";

// Keep only About (leftmost) and Playlist (formerly Features)
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
        description: "What the app does and who it’s for.",
      },
      {
        label: "Architecture",
        href: "#about-architecture",
        description: "High-level system design and data flow.",
      },
      {
        label: "Tech Stack",
        href: "#about-tech-stack",
        description: "Core frameworks, services, and tooling.",
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
        description: "Generate a mood-aligned playlist with constraints.",
      },
      {
        label: "View Playlist",
        href: "#playlist-view",
        description: "Browse, revisit, and manage generated playlists.",
      },
    ],
  },
];

// Smaller typography for dropdown items
const ListItem = React.forwardRef<
  React.ElementRef<"a">,
  React.ComponentPropsWithoutRef<"a"> & {
    title: string;
    children?: React.ReactNode;
  }
>(({ className, title, children, ...props }, ref) => {
  return (
    <NavigationMenuLink asChild>
      <a
        ref={ref}
        className={cn(
          "block select-none space-y-1 rounded-md p-2 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground",
          "text-xs",
          className
        )}
        {...props}
      >
        <div className="text-sm font-medium leading-none">{title}</div>
        {children ? (
          <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
            {children}
          </p>
        ) : null}
      </a>
    </NavigationMenuLink>
  );
});
ListItem.displayName = "ListItem";

// Overview tile (clickable, centered summary, pointer on hover)
function OverviewTile({ group }: { group: "About" | "Playlist" }) {
  const summaries: Record<
    "About" | "Playlist",
    { heading: string; body: string }
  > = {
    About: {
      heading: "Overview",
      body: "Purpose explains the problem we solve, Architecture shows how pieces connect, and Tech Stack lists the tools powering the app.",
    },
    Playlist: {
      heading: "Overview",
      body: "Create Playlist lets you generate mood-based mixes with constraints; View Playlist helps you review and manage your results.",
    },
  };

  const { heading, body } = summaries[group];
  return (
    <NavigationMenuLink asChild>
      <button
        onClick={(e) => e.preventDefault()}
        className={cn(
          "flex h-full w-full select-none flex-col items-center justify-center text-center",
          "rounded-md bg-gradient-to-b from-muted/50 to-muted p-4",
          "no-underline outline-none transition-colors",
          "cursor-default hover:cursor-pointer focus:shadow-md"
        )}
      >
        <div className="mb-1 text-sm font-normal">{heading}</div>
        <p className="text-[11px] leading-snug text-muted-foreground">{body}</p>
      </button>
    </NavigationMenuLink>
  );
}

export function NavBar() {
  const logout = useAppStore((s) => s.logout);
  const status = useAppStore((s) => s.status);
  return (
    <Card
      className={cn(
        // 3 equal regions: left (menu), center (brand text), right (mode toggle)
        "sticky z-10 top-0 left-0 w-full h-fit",
        "grid grid-cols-3 items-center",
        "p-2 shadow-[0px_2px_3px_-1px_rgba(0,0,0,0.1),0px_1px_0px_0px_rgba(25,28,33,0.02),0px_0px_0px_1px_rgba(25,28,33,0.08)]",
        "rounded-none dark:bg-black"
      )}
    >
      {/* COL 1: Nav menu (mobile trigger + desktop menu) */}
      <div>
        {/* Mobile */}
        <div className="md:hidden flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild className="hover:cursor-pointer">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MenuIcon className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-1">
              <nav className="flex flex-col">
                {NAV_LINKS.map((group, i) => (
                  <div key={group.label + i} className="py-1">
                    <div className="px-2 py-1.5 text-[11px] font-normal text-muted-foreground">
                      {group.label}
                    </div>
                    <ul className="flex flex-col">
                      {group.items.map((item) => (
                        <li key={item.label}>
                          <a
                            href={item.href}
                            className="block rounded-md px-3 py-1.5 text-xs font-medium hover:bg-accent hover:text-accent-foreground"
                          >
                            {item.label}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </nav>
            </PopoverContent>
          </Popover>

          {/* Mobile Exit button */}
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-3 text-[11px] rounded-full shadow-none hover:cursor-pointer"
            onClick={async () => {
              await logout();
            }}
            disabled={status === "loading"}
          >
            Sign out
          </Button>
        </div>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-2">
          <NavigationMenu>
            <NavigationMenuList className="gap-1">
              {NAV_LINKS.map((group) => {
                return (
                  <NavigationMenuItem key={group.label}>
                    <NavigationMenuTrigger
                      className={cn(
                        "text-[11px] h-8 px-2",
                        "bg-transparent hover:bg-transparent data-[state=open]:bg-transparent",
                        "rounded-sm",
                        "cursor-default hover:cursor-pointer",
                        "font-normal"
                      )}
                    >
                      {group.label}
                    </NavigationMenuTrigger>
                    <NavigationMenuContent>
                      <div className="grid gap-3 p-3 md:w-[360px] lg:w-[460px] lg:grid-cols-[.75fr_1fr]">
                        <div className="row-span-3">
                          <OverviewTile group={group.label} />
                        </div>
                        {group.items.map((item) => (
                          <ListItem
                            key={item.label}
                            href={item.href}
                            title={item.label}
                          >
                            {item.description}
                          </ListItem>
                        ))}
                      </div>
                    </NavigationMenuContent>
                  </NavigationMenuItem>
                );
              })}
            </NavigationMenuList>
          </NavigationMenu>

          {/* Desktop Exit button */}
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-3 text-[11px] rounded-full shadow-none hover:cursor-pointer"
            onClick={async () => {
              await logout();
            }}
            disabled={status === "loading"}
          >
            Sign out
          </Button>
        </div>
      </div>

      {/* COL 2: Centered brand icon/link */}
      <div className="flex items-center justify-self-center">
        <a
          href="/home"
          aria-label="MoodMix4U Home"
          className="flex items-center gap-2 no-underline text-primary hover:text-primary/90 cursor-pointer border-none outline-none focus-visible:outline-none focus-visible:ring-0"
        >
          <BsMusicNoteBeamed
            aria-hidden="true"
            className="text-[12px] sm:text-sm opacity-80 text-black dark:text-white"
          />
        </a>
      </div>

      {/* COL 3: Mode toggle (right block) */}
      <div className="flex items-center justify-end">
        <ModeToggle className="w-9 h-9 p-0" />
      </div>
    </Card>
  );
}
