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
 * runtime: {{key}}, {{{key}}}, {{#if}}/{{else}}/{{/if}}, {{#unless}},
 * plus Web Components-style <slot> for layouts.
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

// ─── attribute / template / slot parsing ─────────────────────────────
function getAttr(attrs, name) {
  const dq = attrs.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`));
  if (dq) return dq[1];
  const sq = attrs.match(new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`));
  return sq ? sq[1] : null;
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

// ─── recursive expansion ─────────────────────────────────────────────
function expand(html, baseDir, depth = 0) {
  if (depth > MAX_DEPTH) {
    console.warn('[tmpla] max include depth reached; possible recursion');
    return html;
  }

  const blocks = findTemplateBlocks(html);
  if (blocks.length === 0) return html;

  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    const src = getAttr(b.attrs, 'src');

    if (src) {
      const paramsAttr = getAttr(b.attrs, 'params');
      let data = {};
      if (paramsAttr) {
        try { data = new Function(`return (${paramsAttr})`)(); }
        catch (e) { console.error('[tmpla] bad params:', paramsAttr, e.message); }
      }

      // Expand any partials inside the slot payload first, in *this* dir
      const expandedPayload = expand(b.inner, baseDir, depth + 1);
      const slots = parseSlots(expandedPayload);

      const partialPath = path.resolve(baseDir, src);
      let content = '';
      if (fs.existsSync(partialPath)) {
        content = fs.readFileSync(partialPath, 'utf8');
        content = render(content, data);
        content = fillSlots(content, slots);
        content = expand(content, path.dirname(partialPath), depth + 1);
      } else {
        console.error('[tmpla] partial not found:', partialPath);
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

Layouts (Web Components-style slots):
  <!-- _layouts/main.html -->
  <body><main><slot></slot></main><footer><slot name="meta"></slot></footer></body>

  <!-- page.html -->
  <template src="_layouts/main.html">
    <h1>Hello</h1>
    <template slot="meta">Posted today</template>
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
