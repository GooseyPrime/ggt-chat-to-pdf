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

export function rememberSnapshotIdentity(message: Message, el: Element, text: string, stable: boolean): Message {
  identities.set(message, { el, text, stable, key: message.key });
  return message;
}

function copy(message: Message, key = message.key): Message {
  const result = { ...message, key };
  baseKeys.set(result, baseKey(message));
  const identity = identities.get(message);
  if (identity) identities.set(result, identity);
  return result;
}

function baseKey(message: Message): string {
  return identities.get(message)?.key ?? baseKeys.get(message) ?? message.key;
}

/**
 * Merge one snapshot of the (possibly virtualised) message list into the running ordered list.
 *
 * Align the overlapping sequence before allocating keys: occurrence numbers within a viewport are
 * not conversation identities. Retained DOM nodes and real site IDs disambiguate repeated text.
 * Content-only windows with no distinguishing context are inherently ambiguous.
 */
export function mergeSnapshot(acc: Message[], snapshot: Message[], direction: "before" | "after" = "before"): Message[] {
  const exact = (a: Message, b: Message) => {
    if (a.role !== b.role) return false;
    const ai = identities.get(a);
    const bi = identities.get(b);
    if (ai?.stable || bi?.stable) return !!ai?.stable && !!bi?.stable && ai.key === bi.key;
    return ai && bi ? ai.text === bi.text : baseKey(a) === baseKey(b);
  };
  const streaming = (a: Message, b: Message) => {
    const ai = identities.get(a);
    const bi = identities.get(b);
    return a.role === "assistant" && b.role === a.role && ai && bi && !ai.stable && !bi.stable
      && ((ai.text.length > 0 && bi.text.length > 0) || ai.el === bi.el)
      && (bi.text.startsWith(ai.text) || ai.text.startsWith(bi.text));
  };
  let offset: number | undefined;
  let best = -1;
  for (let start = 1 - snapshot.length; start < acc.length; start++) {
    let score = 0;
    let valid = true;
    let anchored = false;
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
      } else if ((streaming(a, b) && (sameNode || tailContext)) || (
        sameNode && tailContext && a.role === "assistant" && b.role === a.role && !ai.stable && !bi.stable
      )) {
        score += sameNode ? 1000 : 1;
        anchored ||= !!sameNode;
      } else {
        valid = false;
        break;
      }
    }
    if (valid && anchored && (score > best || (
      score === best && direction === "after" && (offset === undefined || start > offset)
    ))) {
      best = score;
      offset = start;
    }
  }

  const out = acc.slice();
  const used = new Set(acc.map((m) => m.key));
  const fresh = (m: Message) => {
    const base = baseKey(m);
    let key = base;
    for (let n = 2; used.has(key); n++) key = `${base}#${n}`;
    used.add(key);
    return copy(m, key);
  };
  const refresh = (at: number, m: Message) => {
    const old = out[at];
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
    return [...older, ...out, ...newer];
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
  return out;
}
