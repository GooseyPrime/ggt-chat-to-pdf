import fs from "node:fs";
import path from "node:path";
import { type Conversation, SITE_NAMES } from "../../extension/src/model";
import type { Site } from "../../extension/src/parsers/site";
import { loadFixture, readAll } from "./load";

export const fontLoader = async (file: string): Promise<Uint8Array> =>
  new Uint8Array(fs.readFileSync(path.join(__dirname, "..", "..", "node_modules", "dejavu-fonts-ttf", "ttf", file)));

export function conversationFrom(site: Site): Conversation {
  loadFixture(site.id);
  return {
    site: site.id,
    siteName: SITE_NAMES[site.id],
    title: site.title(document),
    model: site.model(document),
    exportedAt: "2026-10-02T09:30:00.000Z",
    messages: readAll(site).map((m, i) => ({ ...m, key: m.key || `k${i}` })),
  };
}
