import { FREE_MESSAGE_CAP, PAID_MESSAGE_MAX } from "./config";
import type { ChatMessage, ParseResult } from "./types";

const ROLE_LINE =
  /^(?:\[(?<ts1>[^\]]+)\]\s*)?(?<role>User|Assistant|Human|ChatGPT|Claude|You|System|AI|Bot|GPT|Gemini|Copilot)\s*:\s*(?<rest>.*)$/i;

const MARKDOWN_ROLE =
  /^(?:#{1,6}\s+|\*{1,2}|_{1,2})(?<role>User|Assistant|Human|ChatGPT|Claude|You|System|AI|Bot|GPT|Gemini|Copilot)(?:\*{1,2}|_{1,2})?\s*$/i;

const ISO_PREFIX =
  /^(?<ts>\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)\s+(?<rest>.+)$/;

const BRACKET_TS = /^\[(?<ts>[^\]]+)\]\s*(?<rest>.+)$/;

/**
 * Parse a pasted chat transcript client-side.
 * Recognizes role labels, markdown-ish headers, or alternating blank-line blocks.
 */
export function parseTranscript(raw: string): ParseResult {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) {
    return { messages: [], totalCount: 0, mode: "empty" };
  }

  const roleParsed = parseRoleLines(text);
  if (roleParsed.messages.length > 0) {
    return { ...roleParsed, mode: "roles" };
  }

  const mdParsed = parseMarkdownRoles(text);
  if (mdParsed.messages.length > 0) {
    return { ...mdParsed, mode: "markdown" };
  }

  return { ...parseAlternating(text), mode: "alternating" };
}

/** Apply free or paid message caps. Free: first 20; paid: up to PAID_MESSAGE_MAX. */
export function applyMessageCap(
  messages: ChatMessage[],
  opts: { unlocked: boolean },
): { messages: ChatMessage[]; capped: boolean; cap: number; omitted: number } {
  const cap = opts.unlocked ? PAID_MESSAGE_MAX : FREE_MESSAGE_CAP;
  if (messages.length <= cap) {
    return { messages, capped: false, cap, omitted: 0 };
  }
  return {
    messages: messages.slice(0, cap),
    capped: true,
    cap,
    omitted: messages.length - cap,
  };
}

/** Free path always uses first FREE_MESSAGE_CAP regardless of unlock. */
export function freePreviewMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.slice(0, FREE_MESSAGE_CAP);
}

function parseRoleLines(text: string): { messages: ChatMessage[]; totalCount: number } {
  const lines = text.split("\n");
  const messages: ChatMessage[] = [];
  let current: ChatMessage | null = null;
  let hits = 0;

  for (const line of lines) {
    const m = ROLE_LINE.exec(line);
    if (m?.groups?.role) {
      hits += 1;
      if (current) messages.push(finalize(current));
      const meta = m.groups.ts1?.trim();
      current = {
        role: normalizeRole(m.groups.role),
        content: (m.groups.rest ?? "").trimStart(),
        meta: meta || undefined,
      };
      continue;
    }

    if (current) {
      current.content = current.content ? `${current.content}\n${line}` : line;
    }
  }

  if (current) messages.push(finalize(current));

  // Need at least 2 role hits (or 1 solid message) to prefer this mode over alternating.
  if (hits === 0) return { messages: [], totalCount: 0 };
  return { messages, totalCount: messages.length };
}

function parseMarkdownRoles(text: string): { messages: ChatMessage[]; totalCount: number } {
  const lines = text.split("\n");
  const messages: ChatMessage[] = [];
  let current: ChatMessage | null = null;
  let hits = 0;

  for (const line of lines) {
    const m = MARKDOWN_ROLE.exec(line.trim());
    if (m?.groups?.role) {
      hits += 1;
      if (current) messages.push(finalize(current));
      current = { role: normalizeRole(m.groups.role), content: "" };
      continue;
    }

    if (current) {
      current.content = current.content ? `${current.content}\n${line}` : line;
    }
  }

  if (current) messages.push(finalize(current));
  if (hits === 0) return { messages: [], totalCount: 0 };
  return { messages, totalCount: messages.length };
}

function parseAlternating(text: string): { messages: ChatMessage[]; totalCount: number } {
  const blocks = text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  const messages: ChatMessage[] = blocks.map((block, i) => {
    let content = block;
    let meta: string | undefined;

    const iso = ISO_PREFIX.exec(block.split("\n")[0] ?? "");
    if (iso?.groups?.ts && iso.groups.rest) {
      meta = iso.groups.ts;
      content = [iso.groups.rest, ...block.split("\n").slice(1)].join("\n").trim();
    } else {
      const br = BRACKET_TS.exec(block.split("\n")[0] ?? "");
      if (br?.groups?.ts && br.groups.rest) {
        meta = br.groups.ts;
        content = [br.groups.rest, ...block.split("\n").slice(1)].join("\n").trim();
      }
    }

    return finalize({
      role: `Message ${i + 1}`,
      content,
      meta,
    });
  });

  return { messages, totalCount: messages.length };
}

function normalizeRole(role: string): string {
  const key = role.trim().toLowerCase();
  const map: Record<string, string> = {
    user: "User",
    you: "You",
    human: "Human",
    assistant: "Assistant",
    chatgpt: "ChatGPT",
    claude: "Claude",
    system: "System",
    ai: "AI",
    bot: "Bot",
    gpt: "GPT",
    gemini: "Gemini",
    copilot: "Copilot",
  };
  return map[key] ?? role.trim();
}

function finalize(msg: ChatMessage): ChatMessage {
  return {
    role: msg.role,
    content: msg.content.replace(/\n+$/, "").trim(),
    meta: msg.meta,
  };
}
