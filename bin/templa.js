#!/usr/bin/env node
/**
 * templa CLI — static build for <template src> partials
 *
 * Usage:
 *   templa build [-i <src>] [-o <dist>]
 *   templa --help
 *   templa --version
 *
 * Build expands every <template src="..."> in your source HTML files
 * by inlining the referenced partial. Supports the same syntax as the
 * runtime: {{key}}, {{{key}}}, <template if="key">…</template>,
 * <template unless="key">…</template>, plus Web Components-style <slot>
 * for layouts. Data is passed by plain HTML attributes (data-* attrs
 * are reserved as metadata and skipped).
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

function render(html, data) {
  return html
    .replace(/{{{\s*(\w+)\s*}}}/g, (m, k) => k in data ? data[k] : m)
    .replace(/{{\s*(\w+)\s*}}/g, (m, k) => k in data ? escHtml(data[k]) : m);
}

// ─── attribute / template / slot parsing ─────────────────────────────
function getAttr(attrs, name) {
  const dq = attrs.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`));
  if (dq) return dq[1];
  const sq = attrs.match(new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`));
  return sq ? sq[1] : null;
}

// Every attribute is a string data key, except: src/slot/if/unless are
// reserved, and any data-* attribute is treated as metadata (skipped).
const RESERVED = new Set(['src', 'slot', 'if', 'unless']);
const ATTR = /(\w[\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;

// ─── co-located styles via <style data-merge="..."> ─────────────────
// First time a partial is processed, its merge styles are extracted and
// queued for the target file. Subsequent expansions of the same partial
// drop the styles silently. Flushed to disk after the source walk.
const STYLE_MERGE = /<style\s+([^>]*?)data-merge\s*=\s*["']([^"']+)["']([^>]*)>([\s\S]*?)<\/style>\s*/gi;
const STYLE_MERGE_STRIP = /<style\b[^>]*\bdata-merge\b[^>]*>[\s\S]*?<\/style>\s*/gi;
const mergedTargets = new Map();   // target path -> [css, ...]
const mergedSeen = new Set();      // partial path -> already extracted

function extractMergedStyles(html, partialPath) {
  if (mergedSeen.has(partialPath)) return html.replace(STYLE_MERGE_STRIP, '');
  let any = false;
  const out = html.replace(STYLE_MERGE, (_, _pre, target, _post, body) => {
    any = true;
    const t = target.trim();
    if (!mergedTargets.has(t)) mergedTargets.set(t, []);
    mergedTargets.get(t).push(body.trim());
    return '';
  });
  if (any) mergedSeen.add(partialPath);
  return out;
}

function flushMergedStyles(distDir) {
  for (const [target, blocks] of mergedTargets) {
    const file = path.join(distDir, target);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const merged = blocks.join('\n\n');
    if (fs.existsSync(file)) {
      fs.appendFileSync(file, '\n\n/* templa merged */\n' + merged + '\n');
    } else {
      fs.writeFileSync(file, merged + '\n');
    }
  }
  mergedTargets.clear();
  mergedSeen.clear();
}

// ─── runtime-script stripper ─────────────────────────────────────────
// build output is fully expanded HTML; the runtime templa.js is no-op
// there. We remove the canonical bootstrap pair from output:
//   <script src="...templa.js"></script>     (the loader tag)
//   <script>(await) templa.start();</script>  (the start call)
// The user can opt out of the loader-tag strip by adding `data-keep`.
//
// Statement-level strip handles two forms — the whole-script case (the
// tag's only content is templa.start()) and the line-level case (one
// statement inside a multi-statement script). Complex usages like
// `templa.start().then(...)` or `const p = templa.start()` are left
// alone — they are intentional and the user owns them.
const STRIP_TEMPLA_SRC = /<script\b(?![^>]*\bdata-keep\b)[^>]*\bsrc\s*=\s*["'][^"']*\btempla(\.min)?\.js[^"']*["'][^>]*>\s*<\/script>\s*/gi;
const STRIP_TEMPLA_ONLY_SCRIPT = /<script(?:\s+type\s*=\s*["']module["'])?\s*>\s*(?:await\s+)?templa\.start\s*\(\s*\)\s*;?\s*<\/script>\s*/gi;
const STRIP_TEMPLA_LINE = /^[ \t]*(?:await\s+)?templa\.start\s*\(\s*\)\s*;?[ \t]*\r?\n?/gm;
const STRIP_EMPTY_MODULE = /<script\s+type\s*=\s*["']module["']\s*>\s*<\/script>\s*/gi;

function stripRuntimeScripts(html) {
  return html
    .replace(STRIP_TEMPLA_SRC, '')
    .replace(STRIP_TEMPLA_ONLY_SCRIPT, '')
    .replace(STRIP_TEMPLA_LINE, '')
    .replace(STRIP_EMPTY_MODULE, '');
}

function collectData(attrs) {
  const data = {};
  ATTR.lastIndex = 0;
  let m;
  while ((m = ATTR.exec(attrs))) {
    const name = m[1];
    if (RESERVED.has(name) || name.startsWith('data-')) continue;
    data[name] = m[2] ?? m[3] ?? '';
  }
  return data;
}

const TEMPLATE_OPEN = /<template((?:\s+[\w:.-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>/gi;
const TEMPLATE_TAG = /<template\b|<\/template\s*>/gi;

// Length-preserving redaction: blank out quoted string contents so a literal
// `<template>` token inside an attribute value can't desync depth tracking.
const redactStrings = s => s.replace(
  /"[^"]*"|'[^']*'/g,
  m => m[0] + ' '.repeat(m.length - 2) + m[m.length - 1]
);

// Top-level <template>...</template> blocks in `html`, depth-aware so
// nested templates do not confuse the matching close.
function findTemplateBlocks(html) {
  const scan = redactStrings(html);
  const out = [];
  TEMPLATE_OPEN.lastIndex = 0;
  let m;
  while ((m = TEMPLATE_OPEN.exec(scan))) {
    const start = m.index;
    const openEnd = start + m[0].length;
    const attrs = html.substring(start + 9, start + 9 + m[1].length);
    if (m[2] === '/') {
      out.push({ start, end: openEnd, attrs, inner: '' });
      continue;
    }
    TEMPLATE_TAG.lastIndex = openEnd;
    let depth = 1, t;
    while (depth > 0 && (t = TEMPLATE_TAG.exec(scan))) {
      if (t[0][1] === '/') depth--;
      else depth++;
      if (depth === 0) {
        out.push({ start, end: t.index + t[0].length, attrs, inner: html.slice(openEnd, t.index) });
        TEMPLATE_OPEN.lastIndex = t.index + t[0].length;
        break;
      }
    }
  }
  return out;
}

function parseSlots(innerHtml) {
  const named = {};
  const fillers = findTemplateBlocks(innerHtml)
    .filter(b => getAttr(b.attrs, 'slot'))
    .sort((a, b) => b.start - a.start);
  let def = innerHtml;
  for (const b of fillers) {
    named[getAttr(b.attrs, 'slot')] = b.inner;
    def = def.slice(0, b.start) + def.slice(b.end);
  }
  return { named, default: def };
}

function fillSlots(html, slots) {
  return html.replace(
    /<slot(\s[^>]*?)?>([\s\S]*?)<\/slot>/gi,
    (_, attrs, fallback) => {
      const name = attrs ? getAttr(attrs, 'name') : null;
      if (name) return name in slots.named ? slots.named[name] : fallback;
      return slots.default.trim() ? slots.default : fallback;
    }
  );
}

// <template if="key"> / <template unless="key"> — existence-based conditional
// blocks. Iterates until stable so nested conditionals resolve.
function applyConditionals(html, data) {
  let prev;
  do {
    prev = html;
    const blocks = findTemplateBlocks(html);
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i];
      const ifKey = getAttr(b.attrs, 'if');
      const unlessKey = getAttr(b.attrs, 'unless');
      if (ifKey !== null) {
        html = html.slice(0, b.start) + (data[ifKey] ? b.inner : '') + html.slice(b.end);
      } else if (unlessKey !== null) {
        html = html.slice(0, b.start) + (!data[unlessKey] ? b.inner : '') + html.slice(b.end);
      }
    }
  } while (html !== prev);
  return html;
}

// ─── recursive expansion ─────────────────────────────────────────────
function expand(html, baseDir, depth = 0) {
  if (depth > MAX_DEPTH) {
    console.warn('[templa] max include depth reached; possible recursion');
    return html;
  }

  const blocks = findTemplateBlocks(html);
  if (blocks.length === 0) return html;

  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    const src = getAttr(b.attrs, 'src');

    if (src) {
      const data = collectData(b.attrs);

      // Resolve conditionals in the slot payload first (using this call's
      // data), then recursively expand any partials inside it.
      const conditionalPayload = applyConditionals(b.inner, data);
      const expandedPayload = expand(conditionalPayload, baseDir, depth + 1);
      const slots = parseSlots(expandedPayload);

      const partialPath = path.resolve(baseDir, src);
      let content = '';
      if (fs.existsSync(partialPath)) {
        content = fs.readFileSync(partialPath, 'utf8');
        content = extractMergedStyles(content, partialPath);
        content = applyConditionals(content, data);
        content = render(content, data);
        content = fillSlots(content, slots);
        content = expand(content, path.dirname(partialPath), depth + 1);
      } else {
        console.error('[templa] partial not found:', partialPath);
      }

      html = html.slice(0, b.start) + content + html.slice(b.end);
    } else {
      // Not a partial include (e.g. <template slot="x"> filler); recurse
      // into its inner so any partials there get expanded in this context.
      const expandedInner = expand(b.inner, baseDir, depth + 1);
      if (expandedInner !== b.inner) {
        const open = `<template${b.attrs}>`;
        html = html.slice(0, b.start) + open + expandedInner + '</template>' + html.slice(b.end);
      }
    }
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

      if (path.resolve(inPath) === distAbs) continue;

      if (entry.isDirectory()) {
        if (isPartial(entry.name)) { stats.partials++; continue; }
        fs.mkdirSync(outPath, { recursive: true });
        visit(inPath, outPath);
      } else if (entry.name.endsWith('.html')) {
        if (isPartial(entry.name)) { stats.partials++; continue; }
        let html = expand(fs.readFileSync(inPath, 'utf8'), dir);
        html = stripRuntimeScripts(html);
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

  console.log(`templa build`);
  console.log(`  src:  ${path.relative(process.cwd(), SRC) || '.'}`);
  console.log(`  dist: ${path.relative(process.cwd(), DIST) || '.'}`);
  console.log('');

  const t0 = Date.now();
  const stats = walk(SRC, DIST);
  flushMergedStyles(DIST);
  const ms = Date.now() - t0;

  console.log('');
  console.log(`✓ ${stats.files} page(s), ${stats.copied} asset(s), ${stats.partials} partial(s) skipped — ${ms}ms`);
}

// ─── entry ───────────────────────────────────────────────────────────
function help() {
  process.stdout.write(`
templa v${VERSION} — tiny HTML template loader

Usage:
  templa build [-i <src>] [-o <dist>]

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
  {{key}}                            HTML-escaped variable
  {{{key}}}                          raw variable
  <template if="key">…</template>    keep block when data[key] is truthy
  <template unless="key">…</template> keep block when data[key] is falsy

Passing data:
  <template src="card.html" title="Tiny" body="Light, ~3KB."></template>

Build also strips the runtime bootstrap from output HTML:
  <script src="...templa.js"></script>          (removed)
  <script type="module">await templa.start();   (line removed)
Add the data-keep attribute to opt out of the script-src strip.

Layouts (Web Components-style slots):
  <!-- _layouts/main.html -->
  <header><slot name="nav"></slot></header><main><slot></slot></main>

  <!-- page.html -->
  <template src="_layouts/main.html">
    <template slot="nav">…</template>
    <h1>Hello</h1>
  </template>

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
