import type { Conversation, Message } from "../model";
import { SITE_NAMES } from "../model";
import { stableKey } from "../parsers/common";
import type { Site } from "../parsers/site";
import { mergeSnapshot } from "./merge";

export interface Progress {
  phase: "idle" | "loading-history" | "reading" | "done" | "error";
  messages: number;
  detail?: string;
}

export interface HarvestOptions {
  /** Scroll the page to load the whole history (default true). */
  loadAll?: boolean;
  onProgress?(p: Progress): void;
  signal?: { cancelled: boolean };
  sleep?(ms: number): Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Read every message currently present in the DOM. */
export function snapshotMessages(site: Site, doc: Document): Message[] {
  const out: Message[] = [];
  for (const raw of site.collect(doc)) {
    let blocks;
    try {
      blocks = site.parse(raw);
    } catch {
      continue; // one unparsable message must not abort the export
    }
    const text = (raw.el.textContent ?? "").replace(/\s+/g, " ").trim();
    out.push({
      key: raw.key ?? stableKey(raw.role, text),
      role: raw.role,
      blocks,
      model: raw.model,
    });
  }
  return out;
}

/** The element that actually scrolls: the site hint, or the nearest scrollable ancestor of a message. */
export function findScroller(site: Site, doc: Document): Element {
  const isScrollable = (el: Element) => {
    const cs = doc.defaultView?.getComputedStyle(el);
    return !!cs && /(auto|scroll|overlay)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4;
  };
  const hint = site.scroller(doc);
  if (hint) {
    let n: Element | null = hint;
    while (n && n !== doc.body && n !== doc.documentElement) {
      if (isScrollable(n)) return n;
      n = n.parentElement;
    }
  }
  const first = site.collect(doc)[0]?.el;
  let n: Element | null = first ?? null;
  while (n && n !== doc.body && n !== doc.documentElement) {
    if (isScrollable(n)) return n;
    n = n.parentElement;
  }
  return (doc.scrollingElement ?? doc.documentElement) as Element;
}

/**
 * Load the whole conversation: scroll to the top until no older messages appear (lazy loading),
 * then walk down one viewport at a time collecting messages (virtualised lists drop off-screen
 * nodes, so everything is captured as it passes through). The original scroll position is restored.
 */
export async function harvestConversation(site: Site, doc: Document, opts: HarvestOptions = {}): Promise<Conversation> {
  const sleep = opts.sleep ?? defaultSleep;
  const report = (p: Progress) => opts.onProgress?.(p);
  const cancelled = () => !!opts.signal?.cancelled;

  let acc: Message[] = mergeSnapshot([], snapshotMessages(site, doc));
  report({ phase: "reading", messages: acc.length });

  if (opts.loadAll !== false) {
    const scroller = findScroller(site, doc);
    const original = scroller.scrollTop;
    try {
      // Phase 1: go to the top until stable.
      let stable = 0;
      let lastHeight = -1;
      let lastCount = -1;
      for (let i = 0; i < 80 && stable < 3 && !cancelled(); i++) {
        // Nudge down then back to the top: setting the same scrollTop twice fires no scroll event, and
        // lazy loaders (IntersectionObserver / scroll listeners) only react to movement.
        scroller.scrollTop = Math.min(scroller.scrollHeight, scroller.clientHeight * 0.3 + 40);
        await sleep(60);
        scroller.scrollTop = 0;
        await sleep(i < 2 ? 700 : 450);
        acc = mergeSnapshot(acc, snapshotMessages(site, doc));
        const h = scroller.scrollHeight;
        stable = h === lastHeight && acc.length === lastCount ? stable + 1 : 0;
        lastHeight = h;
        lastCount = acc.length;
        report({ phase: "loading-history", messages: acc.length });
      }
      // Phase 2: sweep down.
      scroller.scrollTop = 0;
      await sleep(250);
      for (let i = 0; i < 2000 && !cancelled(); i++) {
        acc = mergeSnapshot(acc, snapshotMessages(site, doc));
        report({ phase: "reading", messages: acc.length });
        const atEnd = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
        if (atEnd) break;
        const before = scroller.scrollTop;
        scroller.scrollTop = before + Math.max(200, scroller.clientHeight * 0.8);
        await sleep(220);
        if (scroller.scrollTop === before) break;
      }
      acc = mergeSnapshot(acc, snapshotMessages(site, doc));
    } finally {
      scroller.scrollTop = original;
    }
  }

  report({ phase: "done", messages: acc.length });
  return {
    site: site.id,
    siteName: SITE_NAMES[site.id],
    title: site.title(doc),
    model: site.model(doc),
    exportedAt: new Date().toISOString(),
    messages: acc.map(({ model: _m, ...m }) => ({ ...m })),
  };
}
