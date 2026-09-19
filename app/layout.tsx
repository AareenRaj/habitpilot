import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HabitPilot — A little, consistently.",
  description: "Build realistic habits, track your progress, and find your next small step with HabitPilot.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
