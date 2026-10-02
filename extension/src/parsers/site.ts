import type { Block, Role, SiteId } from "../model";

/** A message element found on the page, before it is converted to blocks. */
export interface RawMessage {
  role: Role;
  el: Element;
  /** Stable id from the page when it has one (otherwise the harvester derives a content key). */
  key?: string;
  model?: string;
}

/** Per-site look of the exported PDF ("formatter"). Colours are RGB triplets. */
export interface SiteFormat {
  accent: [number, number, number];
  /** Soft tint used for the user message card. */
  userTint: [number, number, number];
  userLabel: string;
  assistantLabel: string;
}

export interface Site {
  id: SiteId;
  name: string;
  /** Hostnames this parser handles (exact or subdomain match). */
  hosts: string[];
  format: SiteFormat;
  /** Message elements in document order. Must tolerate pages with no conversation (return []). */
  collect(doc: Document): RawMessage[];
  /** Convert one message element to blocks. */
  parse(raw: RawMessage): Block[];
  title(doc: Document): string;
  model(doc: Document): string | undefined;
  /** The element that scrolls the conversation (null => the page itself). */
  scroller(doc: Document): Element | null;
}

export function hostMatches(hostname: string, hosts: string[]): boolean {
  const h = hostname.toLowerCase();
  return hosts.some((x) => h === x || h.endsWith(`.${x}`));
}
