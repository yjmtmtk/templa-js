#!/usr/bin/env node
/**
 * tmpla CLI — static build for <template src> partials
 *
 * Usage:
 *   tmpla build [-i <src>] [-o <dist>]
 *   tmpla --help
 *   tmpla --version
 *
 * Build expands every <template src="..."> in your source HTML files
 * by inlining the referenced partial. Supports the same syntax as the
 * runtime: {{key}}, {{{key}}}, {{#if}}/{{else}}/{{/if}}, {{#unless}}.
 *
 * Convention: files and directories starting with "_" are treated as
 * partials and are never written to the output directory. Reference
 * them from your pages via <template src="_partials/header.html">.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const VERSION = require('../package.json').version;
const MAX_DEPTH = 50;

// ─── render: shared with browser runtime ─────────────────────────────
const escHtml = s => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const COND = /{{\s*#(if|unless)\s+(\w+)\s*}}((?:(?!{{\s*#(?:if|unless))[\s\S])*?)(?:{{\s*else\s*}}((?:(?!{{\s*#(?:if|unless))[\s\S])*?))?{{\s*\/\1\s*}}/g;

function render(html, data) {
  let prev;
  do {
    prev = html;
    html = html.replace(COND, (_, type, key, t, f = '') =>
      (type === 'if' ? data[key] : !data[key]) ? t : f);
  } while (html !== prev);
  return html
    .replace(/{{{\s*(\w+)\s*}}}/g, (m, k) => k in data ? data[k] : m)
    .replace(/{{\s*(\w+)\s*}}/g, (m, k) => k in data ? escHtml(data[k]) : m);
}

// ─── template tag parsing (regex-based, no DOM dep) ──────────────────
// Quote-aware: attribute values can contain '>' characters (e.g. params
// holding HTML strings like '<script>...</script>').
const TEMPLATE_TAG = /<template((?:\s+[\w:.-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*\/?>(?:[\s\S]*?<\/template>)?/gi;

function getAttr(attrs, name) {
  // Match double-quoted first so single quotes inside params (e.g. JS object
  // literals like { title: 'foo' }) are preserved verbatim.
  const dq = attrs.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`));
  if (dq) return dq[1];
  const sq = attrs.match(new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`));
  return sq ? sq[1] : null;
}

// ─── recursive expansion ─────────────────────────────────────────────
function expand(html, baseDir, depth = 0) {
  if (depth > MAX_DEPTH) {
    console.warn('[tmpla] max include depth reached; possible recursion');
    return html;
  }

  // Collect matches first (right-to-left replacement preserves indices)
  const matches = [];
  let m;
  TEMPLATE_TAG.lastIndex = 0;
  while ((m = TEMPLATE_TAG.exec(html))) {
    if (getAttr(m[1], 'src')) {
      matches.push({ full: m[0], attrs: m[1], idx: m.index });
    }
  }
  if (matches.length === 0) return html;

  for (let i = matches.length - 1; i >= 0; i--) {
    const { full, attrs, idx } = matches[i];
    const src = getAttr(attrs, 'src');
    const paramsAttr = getAttr(attrs, 'params');

    let data = {};
    if (paramsAttr) {
      try { data = new Function(`return (${paramsAttr})`)(); }
      catch (e) { console.error('[tmpla] bad params:', paramsAttr, e.message); }
    }

    const partialPath = path.resolve(baseDir, src);
    let content = '';
    if (fs.existsSync(partialPath)) {
      content = fs.readFileSync(partialPath, 'utf8');
      content = render(content, data);
      content = expand(content, path.dirname(partialPath), depth + 1);
    } else {
      console.error('[tmpla] partial not found:', partialPath);
    }

    html = html.slice(0, idx) + content + html.slice(idx + full.length);
  }
  return html;
}

// ─── build command ───────────────────────────────────────────────────
function isPartial(name) {
  return name.startsWith('_');
}

function walk(srcDir, distDir) {
  const stats = { files: 0, partials: 0, copied: 0 };
  const distAbs = path.resolve(distDir);

  const visit = (dir, outDir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const inPath = path.join(dir, entry.name);
      const outPath = path.join(outDir, entry.name);

      // Don't recurse into the output directory if it lives inside src
      if (path.resolve(inPath) === distAbs) continue;

      if (entry.isDirectory()) {
        if (isPartial(entry.name)) { stats.partials++; continue; }
        fs.mkdirSync(outPath, { recursive: true });
        visit(inPath, outPath);
      } else if (entry.name.endsWith('.html')) {
        if (isPartial(entry.name)) { stats.partials++; continue; }
        const html = expand(fs.readFileSync(inPath, 'utf8'), dir);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, html);
        stats.files++;
        console.log(`  ${path.relative(srcDir, inPath)}`);
      } else {
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.copyFileSync(inPath, outPath);
        stats.copied++;
      }
    }
  };

  visit(srcDir, distDir);
  return stats;
}

function build(args) {
  const inIdx = args.indexOf('-i');
  const outIdx = args.indexOf('-o');
  const SRC = path.resolve(process.cwd(), inIdx !== -1 ? args[inIdx + 1] : './src');
  const DIST = path.resolve(process.cwd(), outIdx !== -1 ? args[outIdx + 1] : './dist');

  if (!fs.existsSync(SRC)) {
    console.error(`Error: source directory not found: ${SRC}`);
    process.exit(1);
  }

  if (fs.existsSync(DIST)) fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  console.log(`tmpla build`);
  console.log(`  src:  ${path.relative(process.cwd(), SRC) || '.'}`);
  console.log(`  dist: ${path.relative(process.cwd(), DIST) || '.'}`);
  console.log('');

  const t0 = Date.now();
  const stats = walk(SRC, DIST);
  const ms = Date.now() - t0;

  console.log('');
  console.log(`✓ ${stats.files} page(s), ${stats.copied} asset(s), ${stats.partials} partial(s) skipped — ${ms}ms`);
}

// ─── entry ───────────────────────────────────────────────────────────
function help() {
  process.stdout.write(`
tmpla v${VERSION} — tiny HTML template loader

Usage:
  tmpla build [-i <src>] [-o <dist>]

Options:
  -i <dir>      Source directory (default: ./src)
  -o <dir>      Output directory (default: ./dist)
  -v, --version Show version
  -h, --help    Show this help

Convention:
  Files and directories starting with "_" are treated as partials
  and are not written to the output directory. Reference them via
  <template src="_partials/header.html"></template>.

Template syntax:
  {{key}}                              HTML-escaped variable
  {{{key}}}                            raw variable
  {{#if key}}...{{else}}...{{/if}}     conditional
  {{#unless key}}...{{/unless}}        inverse conditional

`);
}

const [, , cmd, ...rest] = process.argv;
switch (cmd) {
  case 'build': build(rest); break;
  case '-v': case '--version': console.log(VERSION); break;
  case '-h': case '--help': case undefined: help(); break;
  default:
    console.error(`Unknown command: ${cmd}\n`);
    help();
    process.exit(1);
}
