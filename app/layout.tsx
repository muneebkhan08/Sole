import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sole — Agentic Social HQ",
  description:
    "A live floor for Scrapper, Analyzer, Planner, and Poster. Reddit, Facebook, Instagram. Powered by Hermes.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
