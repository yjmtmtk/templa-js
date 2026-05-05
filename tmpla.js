/**
 * tmpla — HTML template loader (read as "tempura")
 *
 * Drops <template src="..."> elements into the DOM and expands them
 * client-side. Supports {{key}} variables and {{#if}} / {{#unless}}
 * conditionals. Pure ES, zero dependencies.
 *
 * Usage:
 *   <template src="partials/header.html" params="{ title: 'Home' }"></template>
 *   <script src="tmpla.js"></script>
 *   <script>tmpla.start();</script>
 *
 * Syntax:
 *   {{key}}                              HTML-escaped variable
 *   {{{key}}}                            raw variable (no escape)
 *   {{#if key}}...{{else}}...{{/if}}     conditional
 *   {{#unless key}}...{{/unless}}        inverse conditional
 *
 * Repository: https://github.com/yjmtmtk/tmpla
 * License: MIT
 */
const tmpla = (() => {
  const MAX_PASSES = 50;
  const cache = new Map();

  const fetchText = url => {
    if (!cache.has(url)) {
      cache.set(url, fetch(url).then(r => {
        if (!r.ok) console.error('[tmpla] fetch failed:', url, r.status);
        return r.ok ? r.text() : '';
      }).catch(e => {
        console.error('[tmpla] fetch error:', url, e);
        return '';
      }));
    }
    return cache.get(url);
  };

  const esc = s => String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  // Innermost {{#if|unless KEY}}...{{else}}...{{/if|unless}}
  // (innermost = block content contains no other {{#if}} / {{#unless}})
  const COND = /{{\s*#(if|unless)\s+(\w+)\s*}}((?:(?!{{\s*#(?:if|unless))[\s\S])*?)(?:{{\s*else\s*}}((?:(?!{{\s*#(?:if|unless))[\s\S])*?))?{{\s*\/\1\s*}}/g;

  const render = (html, data) => {
    let prev;
    do {
      prev = html;
      html = html.replace(COND, (_, type, key, t, f = '') =>
        (type === 'if' ? data[key] : !data[key]) ? t : f);
    } while (html !== prev);

    return html
      .replace(/{{{\s*(\w+)\s*}}}/g, (m, k) => k in data ? data[k] : m)
      .replace(/{{\s*(\w+)\s*}}/g, (m, k) => k in data ? esc(data[k]) : m);
  };

  // Rewrite <template src> in fetched HTML so nested partials resolve
  // relative to the parent partial, not the document.
  const rebase = (html, baseUrl) => html.replace(
    /(<template\b[^>]*\bsrc\s*=\s*["'])([^"']+)/gi,
    (_, pre, src) => pre + new URL(src, baseUrl).href
  );

  const expand = async el => {
    const src = el.getAttribute('src');
    const paramsAttr = el.getAttribute('params');
    const url = new URL(src, location.href).href;

    const html = await fetchText(url);
    let data = {};
    if (paramsAttr) {
      try { data = new Function(`return (${paramsAttr})`)(); }
      catch (e) { console.error('[tmpla] bad params:', paramsAttr, e); }
    }

    const out = render(rebase(html, url), data);
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
          console.error('[tmpla] failed:', el.getAttribute('src'), e);
          el.remove();
        })
      ));
    }
    console.warn('[tmpla] max passes reached; possible recursive include');
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

if (typeof window !== 'undefined') window.tmpla = tmpla;
if (typeof module !== 'undefined' && module.exports) module.exports = tmpla;
