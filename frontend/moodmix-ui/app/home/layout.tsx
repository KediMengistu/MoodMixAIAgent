// app/home/layout.tsx

import { NavBar } from "@/app/_components/Nav-bar";

export default function HomePageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-[391px] grid grid-rows-[auto_1fr] h-full w-full overflow-y-auto">
      <NavBar />
      {children}
    </div>
  );
}
