import type { NextConfig } from "next";

const rawBase = process.env.NEXT_PUBLIC_BASE_PATH?.trim() ?? "";
const basePath = rawBase.replace(/\/$/, "");

const nextConfig: NextConfig = {
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
};

export default nextConfig;
