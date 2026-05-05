# AGENTS.md — guide for AI agents working with tmpla

This file is for AI agents (Claude Code, Cursor, Aider, Copilot, etc.) tasked with editing a tmpla-based website. Read it before touching files.

## TL;DR

tmpla is a tiny HTML template loader that gives you:

- `<template src="...">` to inline another HTML file
- `{{var}}`, `{{#if}}/{{else}}/{{/if}}`, `{{#unless}}` for variables and conditionals
- `<slot>` and `<slot name="X">` for Web Components-style layouts
- A build CLI (`npx @yjmtmtk/tmpla build`) that statically expands all of the above

Same syntax works at runtime (browser) and at build time. Zero dependencies.

## When tmpla fits

| Task | tmpla? |
|---|---|
| Marketing site / landing page (1–30 pages) | ✅ great |
| Documentation site, portfolio, personal blog | ✅ great |
| Page-driven static site that needs SEO | ✅ build mode |
| App with auth, DB, server-rendered data | ❌ pick Next.js / Astro |
| SPA with heavy client state | ❌ pick React / Vue / Svelte |
| Quick interactive widgets on otherwise static pages | ✅ tmpla + Alpine.js |

## File conventions

Always follow these rules — the build CLI depends on them.

```
src/
├── index.html              ← entry page (written to dist/)
├── about.html              ← entry page
├── _layouts/               ← layouts (skipped from output)
│   └── main.html
└── _partials/              ← partials (skipped from output)
    ├── intro.html
    └── features.html
```

- **`_` prefix** on a file or directory marks it as a partial — it is not copied to the build output. Reference partials with relative paths from the file using them.
- Entry pages live at any non-underscore path under the source root.
- A partial referenced by `<template src="X">` is resolved relative to **the file containing the tag**, not relative to the entry page. Layouts referencing other partials must use paths relative to the layout file (e.g. `../_partials/foo.html` if the layout lives in `_layouts/`).

## Composition pattern (recommended)

Make every page a thin composition. Put each section into its own partial. This lets multiple agents edit different sections in parallel without conflicts and keeps each file small enough to review at a glance.

```html
<!-- src/index.html — page is just composition -->
<!DOCTYPE html>
<html>
<head>
  <title>Home</title>
  <link rel="stylesheet" href="./style.css" />
</head>
<body>
  <template src="_layouts/main.html" params="{ site: 'My Site', year: 2026 }">
    <template slot="nav">
      <template src="_partials/site-nav.html"></template>
    </template>

    <template src="_partials/hero.html"></template>
    <template src="_partials/features.html"></template>
    <template src="_partials/cta.html"></template>
  </template>
</body>
</html>
```

```html
<!-- src/_layouts/main.html — body fragment, NOT a full document -->
<header>
  <strong>{{site}}</strong>
  <slot name="nav"></slot>
</header>
<main>
  <slot></slot>
</main>
<footer>
  <small>&copy; {{year}} {{site}}</small>
</footer>
```

```html
<!-- src/_partials/hero.html — focused, AI-editable in isolation -->
<section class="hero">
  <h1>One product. Many wins.</h1>
  <p>Short tagline.</p>
</section>
```

### Why thin composition

- Each section file is small → fits well within an AI context window.
- Sections have no shared state → multiple agents (or parallel tool calls) can edit different partials without merge conflicts.
- The page file rarely needs editing once the composition is set.

## Syntax reference

### Variables

```
{{key}}        HTML-escaped variable
{{{key}}}      raw variable (use only for trusted HTML)
```

Pass values via `params` on the `<template>` tag:

```html
<template src="_partials/hero.html" params="{ title: 'Home', count: 3 }">
</template>
```

`params` is evaluated as a JS object literal — use single quotes for strings inside, since the attribute itself uses double quotes. Trailing commas are allowed.

### Conditionals

```
{{#if key}}…{{/if}}
{{#if key}}…{{else}}…{{/if}}
{{#unless key}}…{{/unless}}
```

Conditionals can be nested.

### Layouts and slots

```html
<!-- _layouts/page.html -->
<header><slot name="nav"></slot></header>
<main><slot></slot></main>
<footer><slot name="footer">&copy; 2026</slot></footer>
```

```html
<!-- a page using the layout -->
<template src="_layouts/page.html">
  <template slot="nav">…</template>     <!-- → <slot name="nav"> -->
  <h1>…</h1>                            <!-- → <slot> (default) -->
  <p>…</p>                              <!-- → <slot> (default) -->
  <template slot="footer">…</template>  <!-- → <slot name="footer"> -->
</template>
```

Anything inside the calling `<template src>` that is **not** wrapped in a `<template slot="X">` becomes the default slot's payload. A slot's own children are the fallback used when no filler is supplied.

## Dynamic interactivity: pair with Alpine.js

For interactive bits (modals, dropdowns, counters, tabs, form behaviour) prefer **Alpine.js**. It is HTML-first like tmpla, has no build step of its own, and adds reactive state via `x-*` attributes you write directly in your partials.

Add the script once, in the page (or layout) `<head>`:

```html
<script src="https://cdn.jsdelivr.net/npm/alpinejs@3/dist/cdn.min.js" defer></script>
```

Then in any partial:

```html
<section x-data="{ open: false }">
  <button @click="open = !open" x-text="open ? 'Hide' : 'Show'">Show</button>
  <div x-show="open">Hidden content here.</div>
</section>
```

Decision rule:

- **Static composition / repetition / conditional rendering at build time** → tmpla
- **Stateful UI / event handlers / runtime show-hide / fetched data** → Alpine

Do not use Alpine to compose the page (use tmpla). Do not use tmpla for runtime state (use Alpine).

## Runtime vs build — pick one per project

| Mode | Setup | Best for |
|---|---|---|
| **Runtime** | `<script src="…/tmpla.min.js"></script><script>tmpla.start();</script>` | Local dev, prototypes, internal tools, pages where SEO doesn't matter |
| **Build** | `npx @yjmtmtk/tmpla build -i ./src -o ./dist` | Production, SEO, social previews, fastest first paint |

Layout source files must be **body fragments** (no `<html>` / `<body>` wrapper) so they expand correctly in both modes.

For SEO-sensitive pages, always build before deploy. Crawlers other than Googlebot frequently do not run JavaScript, and social-preview crawlers (Twitter, Facebook, Slack) never do.

## Build CLI

```bash
npx @yjmtmtk/tmpla build           # default: ./src → ./dist
npx @yjmtmtk/tmpla build -i pages -o public
npx @yjmtmtk/tmpla --help
```

The CLI walks every `.html` file in the source tree (skipping `_*` files and directories), expands templates and slots recursively, and writes the result to the output directory. Other files are copied as-is.

## Common pitfalls — read before debugging

1. **Forgot the `_` prefix**: a partial that is referenced by other pages but lives at e.g. `src/header.html` will be written to `dist/header.html`, leaking your shell. Rename to `_header.html` or move into `_partials/`.

2. **Wrong relative path in a layout**: a layout in `_layouts/` calling `<template src="_partials/x.html">` resolves to `_layouts/_partials/x.html` (which doesn't exist). Use `../_partials/x.html`.

3. **Double quotes inside `params`**: the attribute uses `"…"`, so use **single quotes** for strings inside (`params="{ title: 'Home' }"`). If you must mix, swap the attribute to single quotes (`params='{ "title": "Home" }'`).

4. **`<title>` / `<meta og:*>` in a head partial when running in runtime mode**: SNS crawlers and the first wave of Google's index don't run JS, so they will see no title and no description. Either build, or keep these tags inline in the page.

5. **Strict CSP without `'unsafe-eval'`**: the runtime evaluates `params` via `new Function`. If the deployment forbids `'unsafe-eval'`, switch to build mode — the output HTML contains no template syntax and needs no runtime.

6. **`<slot name="head">` inside a body-fragment layout**: `<slot>` only fills where it sits in the DOM. To inject head content per-page, write it directly in the page's `<head>` rather than relying on the layout.

## Parallelism playbook

When asked to add a new page or update many sections at once, prefer parallel edits over a single long file rewrite:

1. Decide on the page's section list (e.g. hero, features, pricing, faq, cta).
2. Generate (or update) each section as a separate file under `_partials/`.
3. Compose them in the page's `<template src="_layouts/…">` block.

When using a multi-tool environment, dispatch one tool call per section partial and run them concurrently.

## Quick command reference

```bash
# Install
npm install @yjmtmtk/tmpla

# Build
npx @yjmtmtk/tmpla build -i ./src -o ./dist

# Version
npx @yjmtmtk/tmpla --version

# CDN (runtime)
# <script src="https://cdn.jsdelivr.net/npm/@yjmtmtk/tmpla/tmpla.min.js"></script>
```
