/**
 * templa — HTML template loader (read as "tempura")
 *
 * A small bridge to the HTML we should have. templa expands
 * <template src="..."> elements into real markup, both at runtime in the
 * browser and at build time via the CLI. Pure ES, zero dependencies.
 *
 * Usage:
 *   <template src="partials/header.html" title="Home"></template>
 *   <script src="templa.js"></script>
 *   <script>templa.start();</script>
 *
 * Passing data:
 *   - Every attribute on <template> becomes a string data key, except
 *     src/slot/if/unless (reserved) and data-* attributes (skipped as
 *     metadata convention).
 *
 *     <template src="card.html" title="Tiny" body="Light"></template>
 *
 * Syntax:
 *   {{key}}                       HTML-escaped variable
 *   {{{key}}}                     raw variable (no escape)
 *   <template if="key">…</template>      keep block when data[key] is truthy
 *   <template unless="key">…</template>  keep block when data[key] is falsy
 *
 *   Conditionals are existence-based — no expressions, no helpers. For
 *   conditional attributes, write a plugin.
 *
 * Layouts:
 *   <!-- _layouts/main.html -->
 *   <header><slot name="nav"></slot></header><main><slot></slot></main>
 *
 *   <!-- page.html -->
 *   <template src="_layouts/main.html">
 *     <template slot="nav">…</template>
 *     <h1>Hello</h1>
 *   </template>
 *
 * Repository: https://github.com/yjmtmtk/templa
 * License: MIT
 */
const templa = (() => {
  const MAX_PASSES = 50;
  const cache = new Map();

  const fetchText = url => {
    if (!cache.has(url)) {
      cache.set(url, fetch(url).then(r => {
        if (!r.ok) console.error('[templa] fetch failed:', url, r.status);
        return r.ok ? r.text() : '';
      }).catch(e => {
        console.error('[templa] fetch error:', url, e);
        return '';
      }));
    }
    return cache.get(url);
  };

  // Co-located <style data-merge="..."> blocks: keep on first expansion of a
  // partial, strip on subsequent expansions so the rules appear in the DOM
  // exactly once. The target value is a build-only hint; at runtime the
  // browser resolves all <style> blocks globally regardless of position.
  const mergedSeen = new Set();
  const STYLE_MERGE = /<style\b[^>]*\bdata-merge\b[^>]*>[\s\S]*?<\/style>\s*/gi;
  const STRIP_MERGE_ATTR = /(<style\b[^>]*?)\s+data-merge\s*=\s*("[^"]*"|'[^']*')/gi;

  const handleMergedStyles = (html, url) => {
    if (mergedSeen.has(url)) return html.replace(STYLE_MERGE, '');
    if (STYLE_MERGE.test(html)) {
      mergedSeen.add(url);
      STYLE_MERGE.lastIndex = 0;
    }
    return html.replace(STRIP_MERGE_ATTR, '$1');
  };

  const esc = s => String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const render = (html, data) => html
    .replace(/{{{\s*(\w+)\s*}}}/g, (m, k) => k in data ? data[k] : m)
    .replace(/{{\s*(\w+)\s*}}/g, (m, k) => k in data ? esc(data[k]) : m);

  const rebase = (html, baseUrl) => html.replace(
    /(<template\b[^>]*\bsrc\s*=\s*["'])([^"']+)/gi,
    (_, pre, src) => pre + new URL(src, baseUrl).href
  );

  // Read an attribute value out of a raw attribute string. Tries double then
  // single quoting so values containing the other quote survive intact.
  const getAttr = (attrs, name) => {
    const dq = attrs.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`));
    if (dq) return dq[1];
    const sq = attrs.match(new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`));
    return sq ? sq[1] : null;
  };

  // Find top-level <template>...</template> blocks in `html`, depth-aware so
  // nested templates do not confuse the matching close. Scans against a
  // length-preserving redacted copy where quoted string contents are blanked,
  // so a literal `<template>` token inside an attribute value (e.g. inside a
  // params string) can't desync the depth counter.
  const TEMPLATE_OPEN = /<template((?:\s+[\w:.-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>/gi;
  const TEMPLATE_TAG = /<template\b|<\/template\s*>/gi;
  const redactStrings = s => s.replace(
    /"[^"]*"|'[^']*'/g,
    m => m[0] + ' '.repeat(m.length - 2) + m[m.length - 1]
  );

  const findTemplateBlocks = html => {
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
  };

  // Split inner content of a <template src> call into named slot fillers and
  // remaining default content. <template slot="X">...</template> becomes
  // named[X], everything else stays in default.
  const parseSlots = innerHtml => {
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
  };

  // Replace <slot> / <slot name="X"> in partial HTML with provided fillers,
  // falling back to the slot's own children when no filler is supplied.
  const fillSlots = (html, slots) => html.replace(
    /<slot(\s[^>]*?)?>([\s\S]*?)<\/slot>/gi,
    (_, attrs, fallback) => {
      const name = attrs ? getAttr(attrs, 'name') : null;
      if (name) return name in slots.named ? slots.named[name] : fallback;
      return slots.default.trim() ? slots.default : fallback;
    }
  );

  // <template if="key"> / <template unless="key"> — existence-based
  // conditional blocks. Iterates until stable so nested conditionals resolve.
  const applyConditionals = (html, data) => {
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
  };

  // Every attribute is a string data key, except: src/slot/if/unless are
  // reserved, and any data-* attribute is treated as metadata (skipped).
  const RESERVED = new Set(['src', 'slot', 'if', 'unless']);
  const collectData = el => {
    const data = {};
    for (const a of el.attributes) {
      if (RESERVED.has(a.name) || a.name.startsWith('data-')) continue;
      data[a.name] = a.value;
    }
    return data;
  };

  const expand = async el => {
    const src = el.getAttribute('src');
    const url = new URL(src, location.href).href;
    const data = collectData(el);
    // Resolve conditionals in slot payload using this call's data so a slot
    // filler can be wrapped in <template if="key">.
    const slots = parseSlots(applyConditionals(el.innerHTML, data));

    const html = handleMergedStyles(await fetchText(url), url);
    const conditional = applyConditionals(rebase(html, url), data);
    let out = fillSlots(render(conditional, data), slots);
    const frag = document.createRange().createContextualFragment(out);
    const waits = [...frag.querySelectorAll('link[rel="stylesheet"], script[src]')]
      .map(r => new Promise(done => { r.onload = r.onerror = done; }));

    el.replaceWith(frag);
    await Promise.all(waits);
  };

  const run = async (selector = 'template[src]') => {
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      const targets = [...document.querySelectorAll(selector)];
      if (!targets.length) return;
      await Promise.all(targets.map(el =>
        expand(el).catch(e => {
          console.error('[templa] failed:', el.getAttribute('src'), e);
          el.remove();
        })
      ));
    }
    console.warn('[templa] max passes reached; possible recursive include');
  };

  const start = cb => {
    const headTask = run('head template[src]');
    addEventListener('DOMContentLoaded', async () => {
      await headTask;
      await run('body template[src]');
      cb?.();
    });
  };

  return { run, start };
})();

if (typeof window !== 'undefined') window.templa = templa;
if (typeof module !== 'undefined' && module.exports) module.exports = templa;
