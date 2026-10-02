/**
 * Small LaTeX -> readable Unicode converter for the PDF (no TeX engine runs in the browser).
 * Handles the constructs chat answers actually use: fractions, roots, super/subscripts, Greek, common
 * operators/relations/arrows, \text, blackboard letters, accents, simple matrices. Anything it does not
 * understand is passed through as-is minus the backslash, so the formula is still legible.
 */

const SYMBOLS: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ", eta: "η",
  theta: "θ", vartheta: "ϑ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π",
  varpi: "ϖ", rho: "ρ", varrho: "ϱ", sigma: "σ", varsigma: "ς", tau: "τ", upsilon: "υ", phi: "φ",
  varphi: "ϕ", chi: "χ", psi: "ψ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Upsilon: "Υ",
  Phi: "Φ", Psi: "Ψ", Omega: "Ω",
  sum: "∑", prod: "∏", int: "∫", iint: "∬", oint: "∮", infty: "∞", partial: "∂", nabla: "∇",
  pm: "±", mp: "∓", times: "×", div: "÷", cdot: "·", ast: "∗", star: "⋆", circ: "∘", bullet: "•",
  leq: "≤", le: "≤", geq: "≥", ge: "≥", neq: "≠", ne: "≠", approx: "≈", equiv: "≡", sim: "∼",
  simeq: "≃", cong: "≅", propto: "∝", ll: "≪", gg: "≫",
  to: "→", rightarrow: "→", leftarrow: "←", leftrightarrow: "↔", Rightarrow: "⇒", Leftarrow: "⇐",
  Leftrightarrow: "⇔", implies: "⟹", iff: "⟺", mapsto: "↦", uparrow: "↑", downarrow: "↓",
  in: "∈", notin: "∉", ni: "∋", subset: "⊂", supset: "⊃", subseteq: "⊆", supseteq: "⊇", cup: "∪",
  cap: "∩", emptyset: "∅", varnothing: "∅", setminus: "∖", forall: "∀", exists: "∃", neg: "¬",
  land: "∧", wedge: "∧", lor: "∨", vee: "∨", oplus: "⊕", otimes: "⊗", perp: "⊥", parallel: "∥",
  angle: "∠", degree: "°", prime: "′", ldots: "…", dots: "…", cdots: "⋯", vdots: "⋮", ddots: "⋱",
  hbar: "ℏ", ell: "ℓ", Re: "ℜ", Im: "ℑ", aleph: "ℵ", sqrt: "√", langle: "⟨", rangle: "⟩",
  lfloor: "⌊", rfloor: "⌋", lceil: "⌈", rceil: "⌉", lbrace: "{", rbrace: "}", vert: "|", Vert: "‖",
  quad: "  ", qquad: "    ", ",": " ", ";": " ", ":": " ", "!": "", " ": " ", "\\": "\n",
  "%": "%", "&": "&", "#": "#", _: "_", "$": "$", "{": "{", "}": "}",
};
const FUNCS = new Set(["sin", "cos", "tan", "cot", "sec", "csc", "log", "ln", "exp", "lim", "max", "min", "det", "dim", "gcd", "arg", "sup", "inf", "deg", "ker", "Pr", "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh"]);
const BLACKBOARD: Record<string, string> = { R: "ℝ", N: "ℕ", Z: "ℤ", Q: "ℚ", C: "ℂ", P: "ℙ", E: "𝔼" };
const SUP: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", "−": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ", T: "ᵀ" };
const SUB: Record<string, string> = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "+": "₊", "-": "₋", "−": "₋", "=": "₌", "(": "₍", ")": "₎", a: "ₐ", e: "ₑ", i: "ᵢ", j: "ⱼ", k: "ₖ", m: "ₘ", n: "ₙ", o: "ₒ", p: "ₚ", r: "ᵣ", s: "ₛ", t: "ₜ", u: "ᵤ", x: "ₓ" };
const ACCENTS: Record<string, string> = { hat: "\u0302", bar: "\u0304", overline: "\u0304", vec: "\u20d7", tilde: "\u0303", dot: "\u0307", ddot: "\u0308", widehat: "\u0302", widetilde: "\u0303", underline: "\u0332" };

interface Parser { s: string; i: number }

function readGroup(p: Parser): string {
  // Reads a {...} group (returns inner text) or a single token/command.
  const s = p.s;
  while (s[p.i] === " ") p.i++;
  if (s[p.i] === "{") {
    let depth = 0;
    const start = p.i + 1;
    for (; p.i < s.length; p.i++) {
      if (s[p.i] === "{") depth++;
      else if (s[p.i] === "}" && --depth === 0) {
        const inner = s.slice(start, p.i);
        p.i++;
        return inner;
      }
    }
    return s.slice(start);
  }
  if (s[p.i] === "\\") {
    const m = /^\\([A-Za-z]+|.)/.exec(s.slice(p.i));
    if (m) {
      p.i += m[0].length;
      return m[0];
    }
  }
  return s[p.i++] ?? "";
}

function script(inner: string, map: Record<string, string>, mark: string): string {
  const text = texToText(inner);
  const chars = Array.from(text);
  if (chars.length && chars.every((c) => map[c])) return chars.map((c) => map[c]).join("");
  return text.length <= 1 ? `${mark}${text}` : `${mark}(${text})`;
}

function convert(src: string): string {
  const p: Parser = { s: src, i: 0 };
  let out = "";
  while (p.i < p.s.length) {
    const ch = p.s[p.i];
    if (ch === "\\") {
      const m = /^\\([A-Za-z]+|.)/s.exec(p.s.slice(p.i));
      if (!m) { p.i++; continue; }
      p.i += m[0].length;
      const cmd = m[1];
      if (cmd === "frac" || cmd === "dfrac" || cmd === "tfrac") {
        const a = texToText(readGroup(p));
        const b = texToText(readGroup(p));
        const simple = (t: string) => /^[\w.α-ω]+$/.test(t) || t.length <= 1;
        out += `${simple(a) ? a : `(${a})`}⁄${simple(b) ? b : `(${b})`}`.replace("⁄", "/");
      } else if (cmd === "binom") {
        out += `C(${texToText(readGroup(p))}, ${texToText(readGroup(p))})`;
      } else if (cmd === "sqrt") {
        let idx = "";
        if (p.s[p.i] === "[") {
          const end = p.s.indexOf("]", p.i);
          idx = p.s.slice(p.i + 1, end);
          p.i = end + 1;
        }
        const inner = texToText(readGroup(p));
        const root = idx === "3" ? "∛" : idx === "4" ? "∜" : "√";
        out += /^[\w.α-ω]$/.test(inner) ? `${root}${inner}` : `${root}(${inner})`;
      } else if (cmd === "text" || cmd === "mathrm" || cmd === "textrm" || cmd === "mathit" || cmd === "operatorname" || cmd === "mathbf" || cmd === "boldsymbol" || cmd === "mathsf" || cmd === "mathtt" || cmd === "mathcal" || cmd === "mathscr" || cmd === "mathfrak" || cmd === "bm" || cmd === "textbf" || cmd === "textit") {
        const raw = readGroup(p);
        out += cmd === "text" || cmd === "textrm" || cmd === "textbf" || cmd === "textit" ? raw : texToText(raw);
      } else if (cmd === "mathbb") {
        const raw = readGroup(p);
        out += Array.from(raw).map((c) => BLACKBOARD[c] ?? c).join("");
      } else if (ACCENTS[cmd]) {
        const raw = texToText(readGroup(p));
        out += raw.length ? Array.from(raw).map((c, k, a) => (k === a.length - 1 ? c + ACCENTS[cmd] : c)).join("") : "";
      } else if (cmd === "left" || cmd === "right" || cmd === "big" || cmd === "Big" || cmd === "bigg" || cmd === "displaystyle" || cmd === "textstyle" || cmd === "limits" || cmd === "nolimits" || cmd === "mathop") {
        if (cmd === "left" || cmd === "right" || /^big/i.test(cmd)) {
          // delimiter follows: "\left(" "\right." etc.
          const d = p.s[p.i];
          if (d === ".") p.i++;
        }
      } else if (cmd === "begin") {
        const env = readGroup(p);
        const endTag = `\\end{${env}}`;
        const end = p.s.indexOf(endTag, p.i);
        const body = end < 0 ? p.s.slice(p.i) : p.s.slice(p.i, end);
        p.i = end < 0 ? p.s.length : end + endTag.length;
        const rows = body.split(/\\\\/).map((r) => r.split("&").map((c) => texToText(c.trim())).join(", ")).filter((r) => r.trim());
        const wrapL = /matrix|array|cases/.test(env) ? (env === "cases" ? "{ " : "[ ") : "";
        const wrapR = /matrix|array|cases/.test(env) ? (env === "cases" ? " }" : " ]") : "";
        out += `${wrapL}${rows.join("; ")}${wrapR}`;
      } else if (cmd === "end") {
        readGroup(p);
      } else if (cmd === "not") {
        out += "̸";
      } else if (FUNCS.has(cmd)) {
        out += cmd;
        if (p.s[p.i] && /[A-Za-z0-9\\(]/.test(p.s[p.i])) out += " ";
      } else if (SYMBOLS[cmd] !== undefined) {
        out += SYMBOLS[cmd];
        if (/^[A-Za-z]+$/.test(cmd) && /^[A-Za-z]/.test(p.s[p.i] ?? "")) out += "";
      } else {
        out += cmd.length > 1 ? cmd : cmd;
      }
    } else if (ch === "^" || ch === "_") {
      p.i++;
      const inner = readGroup(p);
      out += ch === "^" ? script(inner, SUP, "^") : script(inner, SUB, "_");
    } else if (ch === "{" || ch === "}") {
      p.i++;
    } else if (ch === "~") {
      out += " ";
      p.i++;
    } else if (ch === "-") {
      out += "−";
      p.i++;
    } else if (ch === "'") {
      out += "′";
      p.i++;
    } else {
      out += ch;
      p.i++;
    }
  }
  return out;
}

export function texToText(tex: string): string {
  if (!tex) return "";
  return convert(tex.replace(/^\s*\$+|\$+\s*$/g, "").replace(/\\\[|\\\]|\\\(|\\\)/g, ""))
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .trim();
}
