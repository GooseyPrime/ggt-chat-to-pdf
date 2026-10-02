import type { NextConfig } from "next";

/**
 * Served inside the shop at /tools/chat-to-pdf: the shop rewrites that path to this
 * deployment, so the app is built with the same basePath. Set NEXT_PUBLIC_BASE_PATH=""
 * for a standalone root deploy.
 */
const rawBase = process.env.NEXT_PUBLIC_BASE_PATH ?? "/tools/chat-to-pdf";
const basePath = rawBase.trim().replace(/\/$/, "");

const nextConfig: NextConfig = {
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
