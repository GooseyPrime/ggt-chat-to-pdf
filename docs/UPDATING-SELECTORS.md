# Updating selectors when a chat site changes its DOM

Chat apps ship UI changes weekly and never promise stable markup. The parsers are therefore written
defensively, and this page is the playbook for when an export looks wrong.

## How the parsers are built

Every site file in `extension/src/parsers/` has the same shape:

* a `SELECTORS` object — **ordered fallback lists** (`['newest markup', 'older markup', 'generic']`); the first
  list entry that matches wins, so adding a new selector at the *front* is the usual fix;
* `collect(doc)` — finds message elements in document order and says whether each is `user` or `assistant`;
* `parse(raw)` — converts one message to blocks using the shared converter `parsers/common.ts`
  (`parseBlocks`), plus site `Hooks` (`skip`, `custom`) for the site's code-block chrome, attachments, math wrappers
  and hidden UI;
* `title(doc)`, `model(doc)`, `scroller(doc)` — metadata and the scrolling element for lazy loading;
* `format` — the PDF look for that site (accent colour, user-card tint, labels).

`common.ts` has a generic text fallback for unknown wrappers. Class-based selectors still handle hidden UI,
code, math and other formatting, so selector changes can affect those paths. Roles come from attributes where possible
(`data-turn`, `data-message-author-role`, `data-testid`, custom-element names).

## Procedure

1. **Capture the new DOM.** On the broken chat, open DevTools → Elements, right-click the conversation container →
   *Copy → Copy outerHTML* (or save a public share page with *Save As → Webpage, HTML only*).
2. **Strip it.** Delete private text. Replace real content with invented text; keep tags, attributes and
   classes. Never commit a real conversation. Keep the file small (a user turn, an assistant turn with a code
   block, a table, a list, math, an image).
3. **Add it as a fixture**: `tests/fixtures/<site>/<name>.html` with a comment saying when/where it was captured.
4. **Write the failing test** in `tests/parsers.test.ts` (copy the pattern of the existing site `describe`
   block): roles, title, model, code `lang` + text, list/table shapes, and that hidden UI text is absent.
   `loadFixture("<site>", "<name>.html")` loads it into jsdom.
5. **Fix the selector.** Prefer *adding* a new selector at the front of the relevant `SELECTORS` list and keeping the
   old ones. Prefer attributes (`data-*`, `role`, `aria-*`, element names) over generated/hashed classes.
6. **Run** `npm test`. Then `PDF_OUT=/tmp/pdfs npx vitest run tests/pdf.test.ts` and look at the PDF.
7. **Test the lazy-loading path** if the scroller changed: `scroller()` hints the scrolling element; the harvester
   (`content/harvest.ts`) otherwise walks up from the first message to the nearest scrollable ancestor.
   `tests/fixtures/lazy/virtualized.html` + `node scripts/e2e.mjs` exercise it in real Chromium.
8. Bump `version` in `package.json` (it flows into both manifests and the zip names) and rebuild.

## Per-site cheat sheet (what each parser keys on today)

| Site | Message elements | Content | Metadata |
| --- | --- | --- | --- |
| ChatGPT | `section[data-testid^="conversation-turn-"]` with `data-turn`; fallback `[data-message-author-role]` | assistant `.markdown`; user `.whitespace-pre-wrap` (raw text, fences converted) | model: `data-message-model-slug`; title: `document.title` |
| Claude | `[data-testid="user-message"]`, `.font-claude-response` / `[data-testid="assistant-message"]` | `.standard-markdown`; thinking blocks skipped; artifacts → placeholder | model: `[data-testid="model-selector-dropdown"]`; title: `[data-testid="chat-title-button"]` |
| Gemini | `user-query`, `model-response` custom elements (open shadow roots searched as a fallback) | `.query-text`; `message-content .markdown`; `code-block`; `data-math`; `model-thoughts` skipped | model: `[data-test-id="bard-mode-menu-button"]`; title: selected sidebar conversation |
| Copilot | `[class~="group/user-message"]`, `[class~="group/ai-message"]` (items: `group/ai-message-item`) | `[data-content="user-message"]`; code wrapper = div with a language header above `pre` | title: selected `[role=option]` |

Math: KaTeX (`annotation[encoding="application/x-tex"]`), `data-math`, MathJax `mjx-container` are recognised in `common.ts`.

## When it breaks for users

The popup says “No messages found on screen” when `collect()` returns nothing — that is the signal that the
message selectors changed. A wrong *role* (everything is “assistant”) means the user/assistant selectors are
stale. Missing content inside a message means the content selectors (`assistantBody`, `userText`) are stale.
