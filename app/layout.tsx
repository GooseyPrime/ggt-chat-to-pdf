import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import { THEME } from "@/lib/config";
import "./globals.css";

const display = localFont({
  src: "../node_modules/@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2",
  variable: "--font-display",
  weight: "100 900",
});
const sans = localFont({
  src: "../node_modules/@fontsource-variable/ibm-plex-sans/files/ibm-plex-sans-latin-wght-normal.woff2",
  variable: "--font-sans",
  weight: "400 600",
});
const mono = localFont({
  src: [
    {
      path: "../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2",
      weight: "400",
    },
    {
      path: "../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2",
      weight: "500",
    },
  ],
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
