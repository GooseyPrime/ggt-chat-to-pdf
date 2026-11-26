import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import { THEME } from "@/lib/config";
import "./globals.css";

const display = localFont({
  src: "../node_modules/dejavu-fonts-ttf/ttf/DejaVuSerif.ttf",
  variable: "--font-display",
});
const sans = localFont({
  src: "../node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf",
  variable: "--font-sans",
});
const mono = localFont({
  src: "../node_modules/dejavu-fonts-ttf/ttf/DejaVuSansMono.ttf",
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
