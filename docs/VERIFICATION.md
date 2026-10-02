# What was verified, and against what

Honesty table for the parsers and the extension (as of the version in `package.json`).

| Check | ChatGPT | Claude | Gemini | Copilot |
| --- | --- | --- | --- | --- |
| Parser selectors compared with a **real page DOM** | ✅ public share page (turn/role/model/markdown structure) | ✅ public share page (user/assistant/transcript structure) | ❌ no public DOM reachable; selectors from the app's long-standing custom elements | ❌ share links require sign-in; selectors from known data attributes / group classes |
| Parser tests on saved fixtures | ✅ synthetic | ✅ synthetic | ✅ synthetic | ✅ synthetic |
| Code block / table / math structure seen live | ❌ (the share page inspected had only prose) — based on known markup (`pre` + header, CodeMirror, KaTeX) | ❌ same | ❌ | ❌ |
| Real-Chromium end-to-end (extension loaded, popup → capture → studio → PDF) | ✅ against fixture served at chatgpt.com URL | ✅ fixture | ✅ fixture | ✅ fixture |
| Logged-in live session | ❌ | ❌ | ❌ | ❌ |

* The fixtures in `tests/fixtures/` are **synthetic** — modelled on observed structure, with invented text. Real
  conversation text from the inspected share pages is not stored in the repo.
* “End-to-end” loads the real built extension in Chromium and serves fixture HTML at the real hostnames through
  network interception. It proves the extension plumbing (injection, scrolling, merge, storage, studio, PDF, licence) —
  **not** that today's live sites still match the fixtures.
* Lazy-loading: `tests/fixtures/lazy/virtualized.html` simulates a virtualised, lazily-loaded 80-message transcript
  (30 rows in the DOM at once); the e2e run confirms all 80 are captured in order without duplicates.
* Firefox: the Firefox build (event-page background, gecko id) is generated and its manifest is unit-tested, but it
  has **not** been run in Firefox. Chromium/Edge is the verified target.
* Not done: Chrome Web Store / Edge Add-ons / AMO submission and review; signing.
* PDFs were checked with `pdftotext` and rasterised with `pdftoppm`; they have not been opened in Acrobat, Preview or
  Chrome's viewer. Poppler logs a harmless `Unknown character collection 'Adobe-Identity-H'` warning for pages that embed
  the Unicode fallback font (a jsPDF quirk).
* Not supported (reported to the user in the studio): emoji, CJK, and right-to-left scripts are replaced by a placeholder
  because the PDF fonts used cannot draw them. Images are placeholders by design.
