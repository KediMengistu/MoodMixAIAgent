// app/connect-spotify/layout.tsx

export default function ConnectSpotifyPageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-dvh w-full p-2 overflow-y-auto scrollbar-hide flex items-center justify-center">
      <div className="relative z-10">{children}</div>
    </div>
  );
}
