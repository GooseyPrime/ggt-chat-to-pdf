import type { Message } from "../model";

interface Identity {
  el: Element;
  text: string;
  stable: boolean;
  key: string;
}

// Harvest-only identity must not leak DOM nodes into the exported conversation.
const identities = new WeakMap<Message, Identity>();
const baseKeys = new WeakMap<Message, string>();
const collectedSegments = new WeakMap<Message[], Message[][]>();
const segmentFrontiers = new WeakMap<Message[], number>();
const observations = new WeakMap<Message, number>();
let observationNumber = 0;

export function rememberSnapshotIdentity(message: Message, el: Element, text: string, stable: boolean): Message {
  identities.set(message, { el, text, stable, key: message.key });
  return message;
}

function copy(message: Message, key = message.key): Message {
  const result = { ...message, key };
  baseKeys.set(result, baseKey(message));
  observations.set(result, observations.get(message) ?? 0);
  const identity = identities.get(message);
  if (identity) identities.set(result, identity);
  return result;
}

function baseKey(message: Message): string {
  return identities.get(message)?.key ?? baseKeys.get(message) ?? message.key;
}

function distinctLiveNodes(a: Identity, b: Identity): boolean {
  return a.el !== b.el && a.el.isConnected && b.el.isConnected && a.el.ownerDocument === b.el.ownerDocument;
}

/**
 * Merge one snapshot of the (possibly virtualised) message list into the running ordered list.
 *
 * Align the overlapping sequence before allocating keys: occurrence numbers within a viewport are
 * not conversation identities. Retained DOM nodes and real site IDs disambiguate repeated text.
 * Content-only windows with no distinguishing context are inherently ambiguous.
 */
export function mergeSnapshot(acc: Message[], snapshot: Message[], direction: "before" | "after" = "before"): Message[] {
  if (!snapshot.length) return acc;
  const observedAt = ++observationNumber;
  snapshot.forEach((m) => observations.set(m, observedAt));
  const segments = (collectedSegments.get(acc) ?? (acc.length ? [acc] : [])).slice();
  const previousFrontier = segmentFrontiers.get(acc) ?? 0;
  let chosen = -1;
  let best = 0;
  let merged: Message[] = [];
  for (let i = 0; i < segments.length; i++) {
    const result = mergeWindow(segments[i], snapshot, direction, acc);
    if (result.score > best || (result.score > 0 && result.score === best
      && Math.abs(i - previousFrontier) < Math.abs(chosen - previousFrontier))) {
      chosen = i;
      best = result.score;
      merged = result.messages;
    }
  }
  if (chosen >= 0) {
    segments[chosen] = merged;
  } else {
    // Keep disjoint observations separate until a later window actually bridges their gap.
    const result = mergeWindow([], snapshot, direction, acc).messages;
    if (direction === "before") segments.unshift(result);
    else segments.push(result);
  }
  let frontier = chosen >= 0 ? chosen : direction === "before" ? 0 : segments.length - 1;
  const existing = new Set(acc);
  for (let i = 0; i + 1 < segments.length;) {
    const result = mergeWindow(segments[i], segments[i + 1], "after", acc, existing, true);
    if (result.score > 0) {
      segments.splice(i, 2, result.messages);
      if (frontier > i + 1) frontier--;
      else if (frontier >= i) frontier = i;
      i = Math.max(0, i - 1);
    } else {
      i++;
    }
  }
  const out = segments.flat();
  collectedSegments.set(out, segments);
  segmentFrontiers.set(out, frontier);
  return out;
}

function mergeWindow(
  acc: Message[],
  snapshot: Message[],
  direction: "before" | "after",
  reserved: Message[],
  existing = new Set<Message>(),
  joining = false,
): { messages: Message[]; score: number } {
  const exact = (a: Message, b: Message) => {
    if (a.role !== b.role) return false;
    const ai = identities.get(a);
    const bi = identities.get(b);
    if (ai?.stable || bi?.stable) return !!ai?.stable && !!bi?.stable && ai.key === bi.key;
    if (ai && bi && distinctLiveNodes(ai, bi)) return false;
    return ai && bi ? ai.text === bi.text : baseKey(a) === baseKey(b);
  };
  const streaming = (a: Message, b: Message) => {
    const ai = identities.get(a);
    const bi = identities.get(b);
    return a.role === "assistant" && b.role === a.role && ai && bi && !ai.stable && !bi.stable
      && !distinctLiveNodes(ai, bi)
      && ((ai.text.length > 0 && bi.text.length > 0) || ai.el === bi.el)
      && (bi.text.startsWith(ai.text) || ai.text.startsWith(bi.text));
  };
  let offset: number | undefined;
  let best = -1;
  for (let start = 1 - snapshot.length; start < acc.length; start++) {
    let score = 0;
    let valid = true;
    let anchored = false;
    let identityAnchored = false;
    for (let j = Math.max(0, -start); j < snapshot.length && start + j < acc.length; j++) {
      const at = start + j;
      const a = acc[at];
      const b = snapshot[j];
      const ai = identities.get(a);
      const bi = identities.get(b);
      const sameNode = ai && bi && ai.el === bi.el;
      const tailContext = at === acc.length - 1 && j > 0 && at > 0 && exact(acc[at - 1], snapshot[j - 1]);
      if (exact(a, b)) {
        score += 10 + (sameNode ? 1000 : 0) + (ai?.stable ? 100 : 0);
        anchored = true;
        identityAnchored ||= !!sameNode || !!ai?.stable;
      } else if ((streaming(a, b) && (sameNode || tailContext)) || (
        sameNode && tailContext && a.role === "assistant" && b.role === a.role && !ai.stable && !bi.stable
      )) {
        score += sameNode ? 1000 : 1;
        anchored ||= !!sameNode;
        identityAnchored ||= !!sameNode;
      } else {
        valid = false;
        break;
      }
    }
    // Later segments cannot precede earlier ones based on repeated text alone.
    if (joining && start < 0 && !identityAnchored) valid = false;
    if (valid && anchored && (score > best || (
      score === best && direction === "after" && (offset === undefined || start > offset)
    ))) {
      best = score;
      offset = start;
    }
  }

  const out = acc.slice();
  const used = new Set([...reserved, ...acc].map((m) => m.key));
  const fresh = (m: Message) => {
    if (existing.has(m)) return copy(m);
    const base = baseKey(m);
    let key = base;
    for (let n = 2; used.has(key); n++) key = `${base}#${n}`;
    used.add(key);
    return copy(m, key);
  };
  const refresh = (at: number, m: Message) => {
    const old = out[at];
    if ((observations.get(m) ?? 0) < (observations.get(old) ?? 0)) return;
    const ai = identities.get(old);
    const bi = identities.get(m);
    // A remounted/partially rendered viewport must not replace a more complete streamed answer.
    const shorter = ai && bi && ai.text.startsWith(bi.text) && bi.text.length < ai.text.length;
    const longer = ai && bi && bi.text.startsWith(ai.text) && bi.text.length > ai.text.length;
    if (!shorter && (longer || m.blocks.length >= old.blocks.length)) {
      out[at] = copy(m, old.key);
    }
  };
  if (offset !== undefined) {
    for (let j = Math.max(0, -offset); j < snapshot.length && offset + j < acc.length; j++) {
      refresh(offset + j, snapshot[j]);
    }
    const older = snapshot.slice(0, Math.max(0, -offset)).map(fresh);
    const newer = snapshot.slice(Math.max(0, acc.length - offset)).map(fresh);
    return { messages: [...older, ...out, ...newer], score: best };
  }

  // Real site IDs also survive insertions/removals inside a window, not just contiguous overlaps.
  const firstKnown = snapshot.map((m) => identities.get(m)?.stable
    ? out.findIndex((old) => identities.get(old)?.stable && exact(old, m))
    : -1).find((at) => at >= 0);
  let anchor = firstKnown !== undefined ? firstKnown - 1 : direction === "after" ? out.length - 1 : -1;
  for (const m of snapshot) {
    const identity = identities.get(m);
    const at = identity?.stable
      ? out.findIndex((old) => identities.get(old)?.stable && exact(old, m))
      : -1;
    if (at >= 0) {
      refresh(at, m);
      anchor = at;
    } else {
      out.splice(++anchor, 0, fresh(m));
    }
  }
  return { messages: out, score: firstKnown === undefined ? 0 : 100 };
}
