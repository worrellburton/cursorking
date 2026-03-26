import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CursorKing - Realtime Multiplayer Cursors",
  description: "See cursors from players all over the world in realtime",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
