/** `browser` (Firefox) or `chrome` (Chromium) — both expose promise APIs in Manifest V3. */
export const ext: typeof chrome = (globalThis as unknown as { browser?: typeof chrome }).browser ?? chrome;
