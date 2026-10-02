import fs from "node:fs";
import path from "node:path";
import { type Block, type Message, blocksText } from "../../extension/src/model";
import type { Site } from "../../extension/src/parsers/site";

export function loadFixture(site: string, name = "conversation.html"): void {
  const html = fs.readFileSync(path.join(__dirname, "..", "fixtures", site, name), "utf8");
  document.open();
  document.write(html);
  document.close();
}

export function readAll(site: Site): Message[] {
  return site.collect(document).map((raw) => ({
    key: raw.key ?? "",
    role: raw.role,
    model: raw.model,
    blocks: site.parse(raw),
  }));
}

export function kinds(blocks: Block[]): string[] {
  return blocks.map((b) => b.t);
}

export function find<T extends Block["t"]>(blocks: Block[], t: T): Extract<Block, { t: T }>[] {
  const out: Extract<Block, { t: T }>[] = [];
  const walk = (bs: Block[]) => {
    for (const b of bs) {
      if (b.t === t) out.push(b as Extract<Block, { t: T }>);
      if (b.t === "list") b.items.forEach((i) => walk(i.blocks));
      if (b.t === "quote") walk(b.blocks);
    }
  };
  walk(blocks);
  return out;
}

export const text = blocksText;
