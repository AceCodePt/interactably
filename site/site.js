/* Interactably — shared site chrome: nav, footer, theme, code, scrollspy */

const NAV_HTML = `
<header class="topnav">
  <div class="topnav-inner">
    <a class="brand" href="./" aria-label="Interactably home">
      <span class="brand-mark">&lt;/&gt;</span>
      <span class="brand-name">interactably</span>
    </a>
    <button class="icon-btn nav-toggle" aria-label="Toggle navigation" aria-expanded="false" type="button">
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M2 4h12M2 8h12M2 12h12"/></svg>
    </button>
    <nav class="nav-links" aria-label="Primary">
      <a href="./docs.html" data-nav="docs">Docs</a>
      <a href="./examples.html" data-nav="examples">Examples</a>
      <a href="./reference.html" data-nav="reference">Reference</a>
    </nav>
    <div class="nav-cta">
      <a class="gh-link" href="https://github.com/AceCodePt/interactably" target="_blank" rel="noopener noreferrer">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>
        GitHub
      </a>
      <button class="icon-btn theme-toggle" aria-label="Toggle color theme" type="button">
        <svg class="icon-moon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.5 10.5A6 6 0 0 1 5.5 2.5a6 6 0 1 0 8 8z"/></svg>
        <svg class="icon-sun" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="3.2"/><path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3 3l1.1 1.1M11.9 11.9 13 13M13 3l-1.1 1.1M4.1 11.9 3 13"/></svg>
      </button>
    </div>
  </div>
</header>`;

const FOOTER_HTML = `
<div class="footer-inner">
  <div>Built with <a href="./">Interactably</a> &middot; MIT licensed</div>
  <div class="footer-links">
    <a href="./docs.html">Docs</a>
    <a href="./examples.html">Examples</a>
    <a href="./reference.html">Reference</a>
    <a href="https://github.com/AceCodePt/interactably" target="_blank" rel="noopener noreferrer">Source</a>
  </div>
</div>`;

const KEYWORDS = [
  "const", "let", "var", "function", "return", "if", "else", "for", "of", "in",
  "new", "class", "extends", "import", "export", "from", "async", "await",
  "switch", "case", "default", "break", "continue", "throw", "try", "catch",
  "finally", "typeof", "instanceof", "void", "yield", "type", "interface",
  "implements", "null", "undefined", "true", "false",
].join("|");

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function span(content, cls) {
  return `<span class="${cls}">${content}</span>`;
}

function htmlTag(tag) {
  const openMatch = /^<\/?/.exec(tag);
  const open = openMatch ? openMatch[0] : "";
  let rest = tag.slice(open.length);
  const closeMatch = /\/?>$/.exec(tag);
  let tail = "";
  if (closeMatch) {
    tail = closeMatch[0];
    rest = rest.slice(0, rest.length - tail.length);
  }
  const nameMatch = /^[\w:-]+/.exec(rest);
  const name = nameMatch ? nameMatch[0] : rest;
  let attrs = rest.slice(name.length);
  let out = span(esc(open), "tok-punct") + span(esc(name), "tok-tag");
  if (attrs) {
    out += attrs.replace(/([\w:.-]+)(=)("[^"]*"|'[^']*')/g, (_, attr, eq, val) => {
      return " " + span(esc(attr), "tok-attr") + esc(eq) + span(esc(val), "tok-string");
    });
  }
  out += span(esc(tail), "tok-punct");
  return out;
}

const RULES = {
  html: [
    { name: "comment", re: /<!--[\s\S]*?-->/ },
    { name: "doctype", re: /<!DOCTYPE[^>]*>/i, render: (t) => span(esc(t), "tok-tag") },
    { name: "tag", re: /<\/?[a-zA-Z][^>]*>/, render: htmlTag },
  ],
  ts: [
    { name: "comment", re: /\/\/[^\n]*|\/\*[\s\S]*?\*\// },
    { name: "string", re: /`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/ },
    { name: "num", re: /\b\d[\d_]*(?:\.\d+)?\b/ },
    { name: "keyword", re: new RegExp(`\\b(?:${KEYWORDS})\\b`) },
  ],
  js: null,
  sh: [
    { name: "comment", re: /#[^\n]*/ },
    { name: "string", re: /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/ },
    { name: "num", re: /\b\d+\b/ },
  ],
};
RULES.js = RULES.ts;

const TOKEN_CLS = {
  comment: "tok-comment",
  string: "tok-string",
  num: "tok-num",
  keyword: "tok-key",
};

function tokenize(text, rules) {
  if (!rules) return esc(text);
  const combined = new RegExp(rules.map((r) => `(?<${r.name}>${r.re.source})`).join("|"), "g");
  let out = "";
  let pos = 0;
  for (const match of text.matchAll(combined)) {
    out += esc(text.slice(pos, match.index));
    for (const rule of rules) {
      if (match.groups[rule.name] !== undefined) {
        out += rule.render ? rule.render(match.groups[rule.name]) : span(esc(match.groups[rule.name]), TOKEN_CLS[rule.name]);
        break;
      }
    }
    pos = match.index + match[0].length;
  }
  out += esc(text.slice(pos));
  return out;
}

function highlightCode(code, lang) {
  if (code.dataset.highlighted) return;
  code.dataset.highlighted = "1";
  code.innerHTML = tokenize(code.textContent, RULES[lang] ?? null);
}

function copyText(text, button) {
  const done = () => {
    button.textContent = "Copied";
    button.classList.add("copied");
    setTimeout(() => {
      button.textContent = "Copy";
      button.classList.remove("copied");
    }, 1600);
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(done);
  } else {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand("copy");
    } catch {
      /* no-op */
    }
    area.remove();
    done();
  }
}

function decorateCodeBlocks(root) {
  for (const pre of root.querySelectorAll("pre.code")) {
    if (pre.dataset.decorated) continue;
    pre.dataset.decorated = "1";
    const lang = pre.dataset.lang || "text";
    const wrap = document.createElement("div");
    wrap.className = "codeblock";
    const bar = document.createElement("div");
    bar.className = "codeblock-bar";
    const label = document.createElement("span");
    label.className = "codeblock-lang";
    label.textContent = lang;
    const copy = document.createElement("button");
    copy.className = "copy-btn";
    copy.type = "button";
    copy.textContent = "Copy";
    copy.addEventListener("click", () => copyText(pre.textContent, copy));
    bar.append(label, copy);
    pre.before(wrap);
    wrap.append(bar, pre);
    const code = pre.querySelector("code");
    highlightCode(code ?? pre, lang);
  }
}

function initScrollspy() {
  const sidebar = document.querySelector(".sidebar");
  if (!sidebar) return;
  const links = [...sidebar.querySelectorAll('a[href^="#"]')];
  const sections = links
    .map((a) => document.getElementById(a.getAttribute("href").slice(1)))
    .filter((el) => el !== null);
  if (sections.length === 0) return;
  const setActive = () => {
    const mid = window.scrollY + window.innerHeight * 0.35;
    let current = sections[0];
    for (const section of sections) {
      if (section.offsetTop <= mid) current = section;
    }
    for (const link of links) {
      link.classList.toggle("active", link.getAttribute("href") === `#${current.id}`);
    }
  };
  window.addEventListener("scroll", setActive, { passive: true });
  setActive();
}

function initTheme(root) {
  const stored = localStorage.getItem("interactably-theme");
  const theme = stored ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.dataset.theme = theme;
  const toggle = root.querySelector(".theme-toggle");
  toggle?.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("interactably-theme", next);
  });
}

function initNav(root, page) {
  const toggle = root.querySelector(".nav-toggle");
  const topnav = root.querySelector(".topnav");
  toggle?.addEventListener("click", () => {
    const open = topnav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  if (page) {
    for (const link of root.querySelectorAll(".nav-links a")) {
      if (link.dataset.nav === page) link.classList.add("active");
    }
  }
}

const nav = document.getElementById("nav");
if (nav) {
  nav.innerHTML = NAV_HTML;
  initNav(nav, document.body.dataset.page);
  initTheme(nav);
}

document.addEventListener("DOMContentLoaded", () => {
  const footer = document.getElementById("footer");
  if (footer) footer.innerHTML = FOOTER_HTML;
  decorateCodeBlocks(document);
  initScrollspy();
});