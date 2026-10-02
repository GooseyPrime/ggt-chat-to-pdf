import { chatgpt } from "./chatgpt";
import { claude } from "./claude";
import { copilot } from "./copilot";
import { gemini } from "./gemini";
import { type Site, hostMatches } from "./site";
import type { SiteId } from "../model";

export const SITES: Site[] = [chatgpt, gemini, copilot, claude];

export function siteForHost(hostname: string): Site | null {
  return SITES.find((s) => hostMatches(hostname, s.hosts)) ?? null;
}

export function siteById(id: SiteId): Site {
  return SITES.find((s) => s.id === id) as Site;
}

export { chatgpt, claude, copilot, gemini };
