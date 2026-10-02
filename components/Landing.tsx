import { STORE_LINKS, SUPPORTED_SITES } from "@/lib/config";
import { EXTENSION_VERSION, checksumsHref, downloadFile, downloadHref } from "@/lib/downloads";
import { UnlockPanel } from "./UnlockPanel";

const FEATURES = [
  ["Roles that read like a chat", "You and the assistant are clearly separated, with a soft card for your messages and an accent bar for replies."],
  ["Real formatting", "Headings, bold/italic, lists (nested, numbered, task), blockquotes, links, tables and horizontal rules are kept."],
  ["Code that looks like code", "Monospace blocks with a language tag and light syntax colours. No stray backticks, ever."],
  ["Math", "LaTeX from KaTeX and similar renderers is converted to readable symbols (fractions, roots, Greek, sub/superscripts)."],
  ["Images and files", "Marked with clear placeholders such as “[Image: chart]” so you know something was there."],
  ["Long chats", "The extension scrolls the page to load older messages, so you get the whole conversation, not just what's on screen."],
  ["Pick what to export", "Whole chat, or tick exactly the messages you want."],
  ["Polished pages", "Title page (site, model, date), optional table of contents, page numbers, running headers, Letter or A4."],
] as const;

export function Landing() {
  const sha = checksumsHref();
  return (
    <main className="ggt-root">
      <div className="ggt-wrap ctp">
        <header className="ggt-hero">
          <p className="ggt-eyebrow">Golden Goose Tools · Browser extension</p>
          <h1>Chat to PDF</h1>
          <p className="ggt-lede">
            Turn any ChatGPT, Gemini, Copilot or Claude conversation into a nicely formatted PDF in one or two clicks. It runs
            inside your browser and your chats are never uploaded.
          </p>
          <div className="ctp-cta">
            <a className="ggt-btn" href={downloadHref("chromium")} download>
              Download for Chrome &amp; Edge
            </a>
            <a className="ggt-btn ctp-btn-alt" href={downloadHref("firefox")} download>
              Download for Firefox
            </a>
          </div>
          <ul className="ctp-stores" aria-label="Store listings">
            {(
              [
                ["Chrome Web Store", STORE_LINKS.chrome],
                ["Edge Add-ons", STORE_LINKS.edge],
                ["Firefox Add-ons", STORE_LINKS.firefox],
              ] as const
            ).map(([name, href]) => (
              <li key={name}>
                {href ? (
                  <a href={href}>{name}</a>
                ) : (
                  <span className="ctp-soon" aria-disabled="true">
                    {name} <em>— listing coming soon</em>
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="ctp-muted ctp-tiny">
            Version {EXTENSION_VERSION} · {downloadFile("chromium")} · <a href={sha}>SHA-256 checksums</a>
          </p>
        </header>

        <section className="ctp-section" aria-labelledby="how-h">
          <h2 id="how-h">How it works</h2>
          <ol className="ctp-steps">
            <li>
              <strong>Open a conversation</strong> on a supported site and click the Chat to PDF toolbar button.
            </li>
            <li>
              <strong>Export whole chat</strong> — or <strong>Choose messages…</strong> to tick the ones you want.
            </li>
            <li>
              <strong>Your PDF downloads.</strong> Adjust title, table of contents or page size first if you like.
            </li>
          </ol>
        </section>

        <section className="ctp-section" id="install" aria-labelledby="install-h">
          <h2 id="install-h">Install</h2>
          <p className="ctp-muted">Until the store listings are live, install the extension from the zip. It takes about a minute.</p>
          <div className="ctp-two">
            <div>
              <h3>Chrome, Edge, Brave</h3>
              <ol>
                <li>Download the Chrome &amp; Edge zip above and unzip it to a folder you will keep.</li>
                <li>
                  Open <code>chrome://extensions</code> (Edge: <code>edge://extensions</code>) and switch on <strong>Developer mode</strong>.
                </li>
                <li>
                  Click <strong>Load unpacked</strong> and pick the unzipped folder (the one containing <code>manifest.json</code>).
                </li>
                <li>Pin the Chat to PDF icon from the puzzle-piece menu so it is one click away.</li>
              </ol>
            </div>
            <div>
              <h3>Firefox</h3>
              <ol>
                <li>Download the Firefox zip above and unzip it.</li>
                <li>
                  Open <code>about:debugging#/runtime/this-firefox</code> and click <strong>Load Temporary Add-on…</strong>.
                </li>
                <li>
                  Select <code>manifest.json</code> from the unzipped folder.
                </li>
                <li>
                  Firefox removes temporary add-ons when it restarts; a signed listing will remove that step. Firefox support is
                  newer and less tested than Chrome/Edge.
                </li>
              </ol>
            </div>
          </div>
          <p className="ctp-muted">
            The extension only reads a chat page when you click its button (it asks for no always-on access to those sites).
          </p>
        </section>

        <section className="ctp-section" aria-labelledby="sites-h">
          <h2 id="sites-h">Supported sites</h2>
          <div className="ctp-table-wrap">
            <table className="ctp-table">
              <caption className="ctp-sr">Supported chat sites</caption>
              <thead>
                <tr>
                  <th scope="col">Site</th>
                  <th scope="col">Address</th>
                </tr>
              </thead>
              <tbody>
                {SUPPORTED_SITES.map((s) => (
                  <tr key={s.id}>
                    <th scope="row">{s.name}</th>
                    <td>
                      <code>{s.host}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="ctp-muted">
            Each site has its own dedicated parser. Chat apps change their page markup without notice, so an update may occasionally be
            needed after a redesign — if an export looks wrong, please let us know which site and which part.
          </p>
        </section>

        <section className="ctp-section" aria-labelledby="features-h">
          <h2 id="features-h">What you get</h2>
          <ul className="ctp-features">
            {FEATURES.map(([t, d]) => (
              <li key={t}>
                <strong>{t}</strong>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </section>

        <UnlockPanel />

        <section className="ctp-section" id="privacy" aria-labelledby="privacy-h">
          <h2 id="privacy-h">Privacy</h2>
          <ul>
            <li>
              <strong>Your conversations never leave your browser.</strong> The PDF is built locally; there is no upload, server
              processing, analytics or telemetry.
            </li>
            <li>The extension reads the chat page only when you click its button (Chrome&apos;s “activeTab” permission).</li>
            <li>A temporary copy of the captured text sits in the extension&apos;s local storage for up to an hour so the export window can open, then it is deleted.</li>
            <li>
              The only network request the extension makes is to confirm an unlock code with the Golden Goose Tools shop, and that
              request contains the checkout session id only — never chat content.
            </li>
            <li>Payments are processed by Stripe on the shop. We never see your card.</li>
          </ul>
        </section>

        <p className="ggt-trust">Golden Goose Tools · Built to be small, local and honest about what it does.</p>
      </div>
    </main>
  );
}
