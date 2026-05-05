# AGENTS.md — guide for AI agents working with tmpla

This file is for AI coding agents (Claude Code, Cursor, Aider, Copilot, etc.) tasked with editing a tmpla-based website. **Read it before touching files.** It is structured as a workflow first, reference second.

## TL;DR

tmpla is a tiny HTML template loader giving you:

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

---

## How to build a site — the two-phase rule

Building a coherent site requires **two distinct phases**, in order. Skipping or interleaving them produces visually fragmented sites where every section reinvents its own typography, spacing, and component shapes.

```
┌────────────────────────────┐      ┌────────────────────────────┐
│  Phase 1 — skeleton        │      │  Phase 2 — content fill    │
│  serial, orchestrator only │  →   │  parallel, sub-agents      │
│                            │      │                            │
│  • design tokens           │      │  • write copy into shapes  │
│  • layout                  │      │  • compose pages           │
│  • shape primitives        │      │  • call partials w/ params │
│  • chrome partials         │      │                            │
│  • empty page shells       │      │  one sub-agent per file    │
└────────────────────────────┘      └────────────────────────────┘
```

### Phase 1 — skeleton (serial, orchestrator only)

Lock down everything downstream sections will *consume*. **One agent in charge. No parallel work yet.**

1. **Design tokens in `style.css`** — base typography, color scale, spacing scale, radius / shadow values. Every later style decision derives from these.
2. **Layout** — `_layouts/main.html` as a body fragment (no `<html>`/`<body>` wrapper) with `<header>`, the main `<slot>`, and `<footer>`.
3. **Chrome partials** — `_partials/meta.html` (shared `<head>`), `_partials/nav.html`, anything else that appears identically on every page.
4. **Shape primitives** — the visual building blocks every content section will reuse. A typical kit:

   | Partial | Purpose |
   |---|---|
   | `_partials/hero.html` | Landing-page hero (large, full-bleed) |
   | `_partials/sub-hero.html` | Inner-page header (smaller, page title + tagline) |
   | `_partials/card.html` | Reusable card with `title` / `body` / optional `image` params |
   | `_partials/section.html` | Generic titled section wrapper (optional) |
   | `_partials/button.html` | Call-to-action button (optional) |

   Add primitives only when the design clearly needs them. Resist over-design: `card`, `hero`, `sub-hero` cover most sites.

5. **Page shells** — every entry HTML file (`index.html`, `about.html`, …) exists as a thin `<template src>` composition, with placeholder slot fillers if the content isn't ready.

Phase 1 is complete when:

- `npx @yjmtmtk/tmpla build` succeeds.
- The output renders cohesively even with placeholder copy.
- Every shape that downstream sections might need is already a partial.

### Phase 2 — content fill (parallel, sub-agents)

With the skeleton locked, dispatch sub-agents to fill in the actual content. **One sub-agent per content unit, all running concurrently.**

Sub-agents may:

- Edit one page's body — slot fillers between `<template src="_layouts/...">` tags.
- Create a new page by composing existing shapes.
- Pass new params to existing shape partials.
- Write page-specific copy and small page-specific styles inline.

Sub-agents must **not**:

- Touch `style.css` (design tokens / shape styles live there).
- Touch `_layouts/`.
- Touch any shape primitive in `_partials/`.
- Invent a new shape primitive. If a sub-agent decides one is needed, **stop, escalate to the orchestrator** for a brief phase 1.5 (extend the skeleton serially), then resume phase 2.

### Why this order matters

Parallel agents have no shared visual context. Started before the skeleton locks the design system and shape vocabulary, each agent will:

- Pick its own typography and spacing → site looks Frankensteined.
- Reinvent card and section shapes → CSS bloats, components don't compose.
- Make inconsistent inner-page headers → no rhythm between pages.

The **sub-hero** pattern is the canonical example. Define it once in phase 1; every inner page calls it in phase 2 → consistent inner-page chrome with zero coordination overhead between sub-agents.

---

## File conventions

```
src/
├── index.html              ← entry page (written to dist/)
├── about.html              ← entry page
├── style.css               ← design tokens + shape styles (touched only in phase 1)
├── _layouts/               ← layouts (skipped from output)
│   └── main.html
└── _partials/              ← partials (skipped from output)
    ├── meta.html           ← chrome
    ├── nav.html            ← chrome
    ├── hero.html           ← shape primitive
    ├── sub-hero.html       ← shape primitive
    ├── card.html           ← shape primitive
    └── …content sections…
```

- Files and directories starting with `_` are partials and are **not copied** to the build output. Reference them with relative paths.
- Entry pages live at any non-underscore path under the source root.
- `<template src="X">` inside a partial is resolved relative to **the file containing the tag**, not the entry page. A layout in `_layouts/` referencing `_partials/foo.html` must write `../_partials/foo.html`.

---

## Composition pattern

Every page is a thin composition. Sections and primitives are partials.

```html
<!-- src/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <title>Home</title>
  <template src="_partials/meta.html"></template>
  <link rel="stylesheet" href="./style.css" />
</head>
<body data-page="home">
  <template src="_layouts/main.html">
    <template slot="nav">
      <template src="_partials/nav.html"></template>
    </template>

    <template src="_partials/hero.html" params="{
      heading: 'Compose HTML in HTML',
      subheading: 'A tiny template loader.'
    }"></template>

    <section class="cards">
      <template src="_partials/card.html" params="{
        title: 'Tiny',
        body: '~3KB gzipped, zero dependencies.'
      }"></template>
      <template src="_partials/card.html" params="{
        title: 'Native',
        body: 'Built on the standard template element.'
      }"></template>
    </section>
  </template>
</body>
</html>
```

```html
<!-- src/_layouts/main.html — body fragment, NOT a full document -->
<header><nav><slot name="nav"></slot></nav></header>
<main><slot></slot></main>
<footer><small>&copy; 2026</small></footer>
```

```html
<!-- src/_partials/card.html — focused, parameterized -->
<article class="card">
  <h3>{{title}}</h3>
  <p>{{body}}</p>
</article>
```

---

## Syntax reference

### Variables

```
{{key}}        HTML-escaped variable
{{{key}}}      raw variable (use only for trusted HTML)
```

Pass values via the `params` attribute:

```html
<template src="_partials/card.html" params="{ title: 'Home', count: 3 }">
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
<footer>&copy; 2026</footer>
```

```html
<!-- a page using the layout -->
<template src="_layouts/page.html">
  <template slot="nav">…</template>     <!-- → <slot name="nav"> -->
  <h1>…</h1>                            <!-- → <slot> (default) -->
  <p>…</p>                              <!-- → <slot> (default) -->
</template>
```

Anything inside the calling `<template src>` not wrapped in a `<template slot="X">` becomes the default slot's payload. A slot's own children are the **fallback** used when no filler is supplied.

---

## Static composition vs runtime interactivity

Decision rule:

- **Anything resolvable at build time / page load** → tmpla
- **Anything that depends on user input or runtime state** → Alpine.js

Pair tmpla with [Alpine.js](https://alpinejs.dev/) for interactive bits (modals, dropdowns, accordions, tabs, form behaviour). Add Alpine once in your meta partial or page `<head>`:

```html
<script src="https://cdn.jsdelivr.net/npm/alpinejs@3/dist/cdn.min.js" defer></script>
```

Use `x-*` attributes inside any partial:

```html
<section x-data="{ open: false }">
  <button @click="open = !open" x-text="open ? 'Hide' : 'Show'">Show</button>
  <div x-show="open">Hidden content here.</div>
</section>
```

Do not use Alpine to compose the page (use tmpla). Do not use tmpla for runtime state (use Alpine).

---

## Runtime vs build

| Mode | Setup | Best for |
|---|---|---|
| **Runtime** | `<script src="…/tmpla.min.js"></script><script>tmpla.start();</script>` | Local dev, prototypes, internal tools, pages where SEO doesn't matter |
| **Build** | `npx @yjmtmtk/tmpla build -i ./src -o ./dist` | Production, SEO, social previews, fastest first paint |

Layout source files must be **body fragments** (no `<html>` / `<body>` wrapper) so they expand correctly in both modes.

For SEO-sensitive pages, always build before deploy. Crawlers other than Googlebot frequently do not run JavaScript, and social-preview crawlers (Twitter, Facebook, Slack) never do.

---

## Build CLI

```bash
npx @yjmtmtk/tmpla build           # default: ./src → ./dist
npx @yjmtmtk/tmpla build -i pages -o public
npx @yjmtmtk/tmpla --help
```

The CLI walks every `.html` file in the source tree (skipping `_*` files and directories), expands templates and slots recursively, and writes the result to the output directory. Other files are copied as-is.

---

## Pitfalls — read before debugging

1. **Started phase 2 too early.** If sub-agents are producing visually inconsistent sections, your skeleton wasn't done. Stop, finish phase 1, restart phase 2.

2. **Sub-agent invented a new primitive.** This silently breaks visual consistency. Audit `_partials/` for new shape files added during phase 2; revert them and escalate to phase 1.5 instead.

3. **Forgot the `_` prefix.** A partial referenced by other pages but living at `src/header.html` will be written to `dist/header.html`, leaking your shell. Rename or move into `_partials/`.

4. **Wrong relative path in a layout.** A layout in `_layouts/` calling `<template src="_partials/x.html">` resolves to `_layouts/_partials/x.html` (which doesn't exist). Use `../_partials/x.html`.

5. **Double quotes inside `params`.** The attribute uses `"…"`, so use **single quotes** for strings inside (`params="{ title: 'Home' }"`).

6. **`<title>` / `<meta og:*>` in a head partial when running in runtime mode.** SNS crawlers and Google's first wave don't run JS, so they will see no title and no description. Either build, or keep these tags inline in the page.

7. **Strict CSP without `'unsafe-eval'`.** The runtime evaluates `params` via `new Function`. If the deployment forbids `'unsafe-eval'`, switch to build mode — the output HTML contains no template syntax and needs no runtime.

8. **`<slot name="head">` inside a body-fragment layout.** `<slot>` only fills where it sits in the DOM. To inject head content per-page, write it directly in the page's `<head>`.

9. **Runtime + Alpine timing.** Alpine auto-initializes before tmpla finishes expanding body templates, so x-data inside expanded content is missed. Pattern:

   ```html
   <script src="../tmpla.js"></script>
   <script src="https://cdn.jsdelivr.net/npm/alpinejs@3/dist/cdn.min.js" defer></script>
   <script>
     tmpla.start(() => window.Alpine && Alpine.initTree(document.body));
   </script>
   ```

   In build mode, Alpine attributes are pre-rendered into the static HTML and Alpine inits normally — no coordination needed.

---

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
