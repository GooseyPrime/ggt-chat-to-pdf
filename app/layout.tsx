import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { THEME } from "@/lib/config";
import "./globals.css";

const display = Fraunces({ subsets: ["latin"], variable: "--font-display" });
const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Chat to PDF — browser extension for ChatGPT, Gemini, Copilot & Claude | Golden Goose Tools",
  description:
    "Export ChatGPT, Gemini, Copilot and Claude conversations as nicely formatted PDFs in one or two clicks. A local browser extension: your chats are never uploaded.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-ggt-theme={THEME} className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
