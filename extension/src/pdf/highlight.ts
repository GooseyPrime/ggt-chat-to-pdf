/** Tiny, dependency-free syntax tokenizer for code blocks (good enough for PDF colouring, not an IDE). */

export type TokKind = "plain" | "kw" | "str" | "com" | "num" | "fn" | "type";
export interface CodeTok { text: string; kind: TokKind }

interface Lang {
  kw: Set<string>;
  line?: string[];      // line-comment openers
  block?: [string, string][];
  quotes: string[];     // string delimiters
  triple?: boolean;     // python-style triple quotes
  types?: boolean;      // Capitalised identifiers are types
}

const w = (s: string) => new Set(s.split(/\s+/).filter(Boolean));

const JS = w("break case catch class const continue debugger default delete do else enum export extends false finally for from function if implements import in instanceof interface let new null of package private protected public return static super switch this throw true try typeof undefined var void while with yield async await as readonly type namespace declare abstract keyof");
const PY = w("False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield self match case print");
const JAVA = w("abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while var record true false null fun val when object override internal data sealed companion string");
const CLIKE = w("auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while bool true false nullptr NULL class namespace template typename using new delete public private protected virtual override this try catch throw operator constexpr noexcept include define ifdef ifndef endif");
const GO = w("break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var true false nil iota string int int64 float64 bool byte error");
const RUST = w("as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while");
const SH = w("if then else elif fi for while do done case esac function in return export local echo cd ls cat grep sed awk git npm npx pip sudo apt docker curl wget mkdir rm cp mv chmod chown source alias set unset exit");
const SQL = w("SELECT FROM WHERE AND OR NOT NULL INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE ALTER DROP INDEX JOIN LEFT RIGHT INNER OUTER FULL ON AS GROUP BY ORDER HAVING LIMIT OFFSET UNION ALL DISTINCT COUNT SUM AVG MIN MAX CASE WHEN THEN ELSE END PRIMARY KEY FOREIGN REFERENCES DEFAULT IN IS LIKE BETWEEN EXISTS WITH select from where and or not null insert into values update set delete create table alter drop index join left right inner outer on as group by order having limit offset union all distinct count sum avg min max case when then else end primary key foreign references default in is like between exists with");
const JSONK = w("true false null");
const CSS = w("important inherit initial unset none auto");
const HTML = w("");
const YAML = w("true false null yes no on off");

const LANGS: Record<string, Lang> = {
  js: { kw: JS, line: ["//"], block: [["/*", "*/"]], quotes: ['"', "'", "`"], types: true },
  py: { kw: PY, line: ["#"], quotes: ['"', "'"], triple: true, types: true },
  java: { kw: JAVA, line: ["//"], block: [["/*", "*/"]], quotes: ['"', "'"], types: true },
  c: { kw: CLIKE, line: ["//"], block: [["/*", "*/"]], quotes: ['"', "'"], types: true },
  go: { kw: GO, line: ["//"], block: [["/*", "*/"]], quotes: ['"', "'", "`"], types: true },
  rust: { kw: RUST, line: ["//"], block: [["/*", "*/"]], quotes: ['"'], types: true },
  sh: { kw: SH, line: ["#"], quotes: ['"', "'"] },
  sql: { kw: SQL, line: ["--"], block: [["/*", "*/"]], quotes: ["'", '"'] },
  json: { kw: JSONK, quotes: ['"'] },
  css: { kw: CSS, block: [["/*", "*/"]], quotes: ['"', "'"] },
  html: { kw: HTML, block: [["<!--", "-->"]], quotes: ['"', "'"] },
  yaml: { kw: YAML, line: ["#"], quotes: ['"', "'"] },
  ruby: { kw: w("def end class module if elsif else unless while until for in do begin rescue ensure return yield require include extend attr_accessor self nil true false and or not puts then case when"), line: ["#"], quotes: ['"', "'"], types: true },
  php: { kw: w("function class public private protected static return if else elseif foreach for while echo new use namespace null true false try catch throw require include array"), line: ["//", "#"], block: [["/*", "*/"]], quotes: ['"', "'"] },
};

const ALIAS: Record<string, string> = {
  javascript: "js", jsx: "js", mjs: "js", cjs: "js", typescript: "js", ts: "js", tsx: "js", node: "js", json5: "json", jsonc: "json",
  python: "py", python3: "py", py3: "py",
  java: "java", kotlin: "java", kt: "java", scala: "java", csharp: "java", cs: "java", "c#": "java", swift: "java", dart: "java",
  c: "c", cpp: "c", "c++": "c", h: "c", hpp: "c", objectivec: "c", cuda: "c",
  golang: "go", rs: "rust",
  bash: "sh", shell: "sh", zsh: "sh", console: "sh", powershell: "sh", ps1: "sh", batch: "sh", dockerfile: "sh",
  mysql: "sql", postgresql: "sql", postgres: "sql", sqlite: "sql", plsql: "sql",
  scss: "css", less: "css", xml: "html", svg: "html", vue: "html", markup: "html",
  yml: "yaml", toml: "yaml", ini: "yaml",
  rb: "ruby",
};

export function languageFamily(lang: string): string | null {
  const l = lang.trim().toLowerCase();
  const fam = ALIAS[l] ?? l;
  return LANGS[fam] ? fam : null;
}

const NUM = /^(0x[0-9a-fA-F_]+|\d[\d_]*\.?\d*(?:[eE][+-]?\d+)?)/;
const IDENT = /^[A-Za-z_$][\w$]*/;

export function tokenize(code: string, lang: string): CodeTok[][] {
  const fam = languageFamily(lang);
  const lines: CodeTok[][] = [[]];
  const push = (text: string, kind: TokKind) => {
    const parts = text.split("\n");
    parts.forEach((part, idx) => {
      if (idx > 0) lines.push([]);
      if (part) {
        const cur = lines[lines.length - 1];
        const last = cur[cur.length - 1];
        if (last && last.kind === kind) last.text += part;
        else cur.push({ text: part, kind });
      }
    });
  };
  if (!fam) {
    push(code, "plain");
    return lines;
  }
  const L = LANGS[fam];
  let i = 0;
  const n = code.length;
  const startsWith = (s: string) => code.startsWith(s, i);
  while (i < n) {
    const ch = code[i];
    // comments
    const lc = L.line?.find(startsWith);
    if (lc && !(fam === "sh" && code[i - 1] === "$")) {
      let j = code.indexOf("\n", i);
      if (j < 0) j = n;
      push(code.slice(i, j), "com");
      i = j;
      continue;
    }
    const bc = L.block?.find(([o]) => startsWith(o));
    if (bc) {
      let j = code.indexOf(bc[1], i + bc[0].length);
      j = j < 0 ? n : j + bc[1].length;
      push(code.slice(i, j), "com");
      i = j;
      continue;
    }
    // strings
    if (L.triple && (startsWith('"""') || startsWith("'''"))) {
      const q = code.substr(i, 3);
      let j = code.indexOf(q, i + 3);
      j = j < 0 ? n : j + 3;
      push(code.slice(i, j), "str");
      i = j;
      continue;
    }
    if (L.quotes.includes(ch) && !(fam === "html" && ch === "'" && false)) {
      let j = i + 1;
      while (j < n && code[j] !== ch && (code[j] !== "\n" || ch === "`")) {
        if (code[j] === "\\") j++;
        j++;
      }
      j = Math.min(n, j + 1);
      push(code.slice(i, j), "str");
      i = j;
      continue;
    }
    // numbers
    if (/\d/.test(ch) && !/[\w$]/.test(code[i - 1] ?? " ")) {
      const m = NUM.exec(code.slice(i, i + 40));
      if (m) {
        push(m[0], "num");
        i += m[0].length;
        continue;
      }
    }
    // identifiers
    if (/[A-Za-z_$]/.test(ch)) {
      const m = IDENT.exec(code.slice(i, i + 80)) as RegExpExecArray;
      const word = m[0];
      const next = code[i + word.length];
      let kind: TokKind = "plain";
      if (L.kw.has(word)) kind = "kw";
      else if (next === "(" && fam !== "sql") kind = "fn";
      else if (L.types && /^[A-Z][a-z]/.test(word)) kind = "type";
      push(word, kind);
      i += word.length;
      continue;
    }
    push(ch, "plain");
    i++;
  }
  return lines;
}

export const TOKEN_COLORS: Record<TokKind, [number, number, number]> = {
  plain: [36, 41, 47],
  kw: [207, 34, 46],
  str: [10, 48, 105],
  com: [110, 119, 129],
  num: [5, 80, 174],
  fn: [130, 80, 223],
  type: [149, 56, 0],
};
