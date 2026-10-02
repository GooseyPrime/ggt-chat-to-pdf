import type { Message } from "../model";

/**
 * Merge one snapshot of the (possibly virtualised) message list into the running ordered list.
 *
 * Messages already known keep their position; unknown ones are inserted right after the closest
 * preceding message of the snapshot that is already known (or at the front when none is). Keys
 * repeated inside one snapshot are made unique by occurrence number, so two identical "ok" messages
 * are both kept.
 */
export function mergeSnapshot(acc: Message[], snapshot: Message[]): Message[] {
  const seen = new Map<string, number>();
  const keyed = snapshot.map((m) => {
    const n = (seen.get(m.key) ?? 0) + 1;
    seen.set(m.key, n);
    return { ...m, key: n === 1 ? m.key : `${m.key}#${n}` };
  });
  const out = acc.slice();
  const index = new Map(out.map((m, i) => [m.key, i] as const));
  let anchor = -1; // index in `out` of the last known message of this snapshot
  for (const m of keyed) {
    const at = index.get(m.key);
    if (at !== undefined) {
      anchor = at;
      // refresh content (a message that was still streaming earlier may now be complete)
      if (m.blocks.length >= out[at].blocks.length) out[at] = m;
      continue;
    }
    out.splice(anchor + 1, 0, m);
    anchor += 1;
    index.clear();
    out.forEach((x, i) => index.set(x.key, i));
  }
  return out;
}
