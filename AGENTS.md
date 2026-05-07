# AGENTS.md — guide for AI agents working with templa

This file is for AI coding agents (Claude Code, Cursor, Aider, Copilot, etc.) tasked with editing a templa-based website. **Read it before touching files.** It is structured as a workflow first, reference second.

## TL;DR

templa is a tiny HTML template loader giving you:

- `<template src="...">` to inline another HTML file
- `{{var}}` for variables; `<template if="key">` / `<template unless="key">` for existence-based conditionals
- `<slot>` and `<slot name="X">` for Web Components-style layouts
- A build CLI (`npx @yjmtmtk/templa build`) that statically expands all of the above

Same syntax works at runtime (browser) and at build time. Zero dependencies.

## When templa fits

| Task | templa? |
|---|---|
| Marketing site / landing page (1–30 pages) | ✅ great |
| Documentation site, portfolio, personal blog | ✅ great |
| Page-driven static site that needs SEO | ✅ build mode |
| App with auth, DB, server-rendered data | ❌ pick Next.js / Astro |
| SPA with heavy client state | ❌ pick React / Vue / Svelte |
| Quick interactive widgets on otherwise static pages | ✅ templa + Alpine.js |

---

## How to build a site — the two-phase rule

Building a coherent site requires **two distinct phases**, in order. Skipping or interleaving them produces visually fragmented sites where every section reinvents its own typography, spacing, and component shapes.

```
┌────────────────────────────┐      ┌────────────────────────────┐
│  Phase 1 — skeleton        │      │  Phase 2 — section fill    │
│  serial, orchestrator only │  →   │  parallel, sub-agents      │
│                            │      │                            │
│  • design tokens           │      │  • one sub-agent per       │
│  • common-* templates      │      │    [page]-[section].html   │
│  • page entry HTML         │      │  • full HTML + co-located  │
│  • empty section files     │      │    style per section       │
└────────────────────────────┘      └────────────────────────────┘
```

### Phase 1 — skeleton (serial, orchestrator only)

Lock down everything Phase 2 sub-agents will *consume*. **One agent in charge. No parallel work yet.**

> Need a structured way to design the skeleton from a brief? Use `PLANNER.md` — an instruction prompt that walks through the same checklist below and produces a `plan.md` for the project before any file is written.

1. **Design tokens in `src/css/style.css`** — base typography, color scale, spacing scale (`--space-1` … `--space-7`), radius / shadow values, and document chrome (`<header>`, `<footer>`, layout grid helpers). Per-section visual rules do NOT live here — they ship co-located inside each section's partial via `<style data-merge="css/style.css">`. The build merges them into `style.css` automatically.

2. **The five `common-*` templates in `src/_partials/`** — these are the project's chrome and shared section vocabulary. Lock them in Phase 1; sub-agents do not touch them.

   | File | Purpose |
   |---|---|
   | `common-head.html` | Everything inside `<head>` except doctype/title — charset, viewport, font links, stylesheet link |
   | `common-layout.html` | Body skeleton: invokes `common-header`, wraps a default `<slot>` in `<main>`, invokes `common-footer` |
   | `common-header.html` | The site `<header>` element (brand + nav) |
   | `common-footer.html` | The site `<footer>` element |
   | `common-subhero.html` | Shared inner-page subhero, parameterized via `title` (and optionally `bg`) |

   A project may add more `common-*` files (e.g. `common-cta-banner.html`) only by orchestrator decision — never by sub-agent invention.

3. **Page entry HTML files** — each `src/[pagename].html` is a thin composition: an HTML5 document whose `<head>` calls `common-head`, whose `<body>` calls `common-layout` containing an ordered list of `<template src="_partials/[pagename]-[section].html">` lines. No inline section content.

4. **Empty section files** — every `_partials/[pagename]-[section].html` referenced by a page exists as a placeholder file (a single HTML comment is enough) so `npx @yjmtmtk/templa build` succeeds against the skeleton.

Phase 1 is complete when:

- `npx @yjmtmtk/templa build` succeeds — **this is the gate; do not dispatch Phase 2 sub-agents until it passes.** Phase 2 assumes a sound skeleton; starting parallel work on a broken one produces incoherent output that's hard to recover from.
- The output renders cohesively even with placeholder section content.
- Every section file the pages reference exists on disk.

### Phase 2 — section fill (parallel, sub-agents)

With the skeleton locked, dispatch sub-agents to fill in each section. **One sub-agent per `_partials/[pagename]-[section].html` file, all running concurrently.**

A sub-agent's brief is exactly:
- The single file path it owns (e.g. `_partials/index-hero.html`).
- A 2–3 line description of what the section should contain.
- The page's existing wireframe / surrounding context (so it knows what comes before and after, but not so it can edit those).

Sub-agents may:
- Write the full HTML for their section, including a `<style data-merge="css/style.css">` block with section-scoped rules.
- Use design tokens defined in `style.css` (`var(--space-*)`, color tokens, etc.).
- Pick a class name matching the file (`.index-hero` for `index-hero.html`).

Sub-agents must **not**:
- Touch `style.css` (design tokens — locked in Phase 1).
- Touch any `common-*.html` file.
- Touch any other `[pagename]-[section].html` owned by another sub-agent.
- Touch page entry HTML files (`src/index.html`, `src/about.html`, …).
- Reference another section file via `<template src>` (sections are leaves, not composers).
- Invent a new `common-*` template. If a sub-agent decides one is needed, **stop, escalate to the orchestrator** for a brief Phase 1.5 (extend the skeleton serially), then resume Phase 2.

### Why this order matters

Parallel sub-agents have no shared visual context. Started before the skeleton locks the design tokens and chrome, each agent will:

- Pick its own typography and spacing → site looks Frankensteined.
- Reinvent header/footer shapes → CSS bloats, components don't compose.
- Make inconsistent inner-page headers → no rhythm between pages.

The **`common-subhero.html`** pattern is the canonical example. Define it once in Phase 1; every inner page calls it in Phase 2 → consistent inner-page chrome with zero coordination overhead between sub-agents.

---

## File conventions

```
src/
├── index.html              ← page entry (written to dist/)
├── about.html              ← page entry
├── css/style.css           ← design tokens + base + chrome (locked in Phase 1)
└── _partials/              ← partials (skipped from output)
    ├── common-head.html        ← <head> chrome
    ├── common-layout.html      ← body skeleton with <main><slot/></main>
    ├── common-header.html      ← <header> chrome
    ├── common-footer.html      ← <footer> chrome
    ├── common-subhero.html     ← shared inner-page subhero
    ├── index-hero.html         ← page-specific section (sub-agent owned)
    ├── index-features.html
    ├── index-cta.html
    └── about-body.html
```

- Files and directories starting with `_` are partials and are **not copied** to the build output. Reference them with relative paths.
- Entry pages live at any non-underscore path under the source root.
- `<template src="X">` inside a partial is resolved relative to **the file containing the tag**, not the entry page. `common-layout.html` lives in `_partials/` so it references its siblings as `<template src="common-header.html">` (no `_partials/` prefix). Page entries live at `src/`, so they reference partials as `<template src="_partials/common-head.html">`.
- Section file class names match the filename: `_partials/index-hero.html` styles `.index-hero`. This makes the cascade easy to audit and prevents class collisions across pages.
- The `data-merge` attribute on a section's `<style>` block is the **dist-relative path** to the linked stylesheet — e.g. `data-merge="css/style.css"` when the page links `./css/style.css`. Mismatched paths cause merged styles to land in a file the page doesn't load.

---

## Composition pattern

Every page is a thin HTML5 document whose body is a `common-layout` invocation containing an ordered list of section partials.

```html
<!-- src/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <template src="_partials/common-head.html" title="Home"></template>
</head>
<body>
  <template src="_partials/common-layout.html">
    <template src="_partials/index-hero.html"></template>
    <template src="_partials/index-features.html"></template>
    <template src="_partials/index-cta.html"></template>
  </template>
  <script src="./js/templa.js"></script>
  <script type="module">await templa.start();</script>
</body>
</html>
```

```html
<!-- src/_partials/common-layout.html — body fragment, NOT a full document -->
<template src="common-header.html"></template>
<main>
  <slot></slot>
</main>
<template src="common-footer.html"></template>
```

```html
<!-- src/_partials/index-hero.html — focused, self-styling, leaf section -->
<style data-merge="css/style.css">
  .index-hero { padding: var(--space-6) 0 var(--space-5); text-align: center; }
  .index-hero h1 { margin: 0 0 var(--space-2); font-size: 2rem; }
</style>
<section class="index-hero">
  <h1>Hello, templa</h1>
  <p>A tiny HTML template loader.</p>
</section>
```

A page's diff when "add a section" is requested: 1 new file in `_partials/` plus 1 new line in the page's body.

---

## Syntax reference

### Passing data to a partial

Each attribute on the calling `<template>` becomes a string data key inside the partial. That covers the common case:

```html
<template src="_partials/card.html" title="Tiny" body="Light, ~3KB."></template>
```

Inside `card.html`, `{{title}}` resolves to `Tiny` and `{{body}}` to `Light, ~3KB.`.

Reserved attributes — these are NOT collected as data:

| Attribute | Purpose |
|---|---|
| `src` | path of the partial to fetch |
| `slot` | slot filler name (see Layouts) |
| `if` / `unless` | existence-based conditional markers (see Conditionals below) |

Any `data-*` attribute on a `<template>` is also skipped from data collection — it's reserved as HTML metadata convention.

Strings handle every common case. For conditionals, the value is checked existentially (truthy unless empty), so `featured="yes"` is enough. There's no typed-value escape hatch in the core; if a project needs typed values (numbers, booleans, arrays, objects, computed values), that goes through a plugin.

A few patterns to avoid (they are silently ignored):

```html
<!-- Vue/Alpine binding prefix — not recognized by templa. -->
<template src="x.html" :params="{ ... }"></template>

<!-- Pre-0.2.0 syntax — REMOVED. Use multi-attribute. -->
<template src="x.html" params="{ ... }"></template>

<!-- Pre-0.5.0 typed escape — REMOVED. data-* attributes are now metadata. -->
<template src="x.html" data-params="{ count: 3 }"></template>
```

### Variables in templates

Once data is passed in, partials read it with these placeholders:

```
{{key}}        HTML-escaped variable
{{{key}}}      raw variable (use only for trusted HTML)
```

### Co-located styles (`<style data-merge="...">`)

A partial can carry its own CSS in a `<style>` block tagged with `data-merge="<file>"`. templa extracts it once per partial and appends it to the named output stylesheet, so the same partial used 100 times still contributes its rules exactly once.

```html
<!-- _partials/card.html -->
<style data-merge="style.css">
  .card { background: #fff; border: 1px solid #ddd; padding: 1rem; }
  .card h3 { margin: 0 0 .5rem; }
</style>
<article class="card">
  <h3>{{title}}</h3>
  <p>{{body}}</p>
</article>
```

**Build mode:** the `<style>` block is removed from each card's expanded HTML and appended to `dist/style.css` (created if missing) with a `/* templa merged */` marker.

**Runtime mode:** on the first expansion of a partial with a merge style, the `<style>` block stays in place (browsers handle `<style>` globally regardless of position); subsequent expansions of the same partial drop it. The `data-merge` attribute is the dedupe signal — the target value is a build-only hint.

A `<style>` without `data-merge` stays inline as written.

When to use: any partial whose presence implies its own visual rules. Co-locating keeps each section a single self-contained unit and matches Phase 1's design token discipline.

### Conditionals

```
<template if="key">…</template>
<template unless="key">…</template>
```

**Existence-based only.** The value of `if`/`unless` is a single key looked up in the surrounding data. There are no expressions, no operators, no helpers, no `else`. If you need an else branch, write the inverse pair:

```html
<template if="loggedIn"><a href="/logout">Logout</a></template>
<template unless="loggedIn"><a href="/login">Login</a></template>
```

Conditionals can be nested. Resolution iterates until stable.

For **conditional attributes** (`disabled` on/off, `target="_blank"` only when external, etc.), templa core does not provide a built-in mechanism — that is intentional. Use a plugin (`@yjmtmtk/templa-plugin-attrs` or similar) when a project needs them. Keeping the core to existence-based block conditionals preserves the "templa looks like HTML the platform should ship" stance.

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

- **Anything resolvable at build time / page load** → templa
- **Anything that depends on user input or runtime state** → Alpine.js

Pair templa with [Alpine.js](https://alpinejs.dev/) for interactive bits (modals, dropdowns, accordions, tabs, form behaviour). Add Alpine once in your meta partial or page `<head>`:

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

Do not use Alpine to compose the page (use templa). Do not use templa for runtime state (use Alpine).

---

## Runtime vs build

| Mode | Setup | Best for |
|---|---|---|
| **Runtime** | `<script src="…/templa.min.js"></script><script type="module">await templa.start();</script>` | Local dev, prototypes, internal tools, pages where SEO doesn't matter |
| **Build** | `npx @yjmtmtk/templa build -i ./src -o ./dist` | Production, SEO, social previews, fastest first paint |

Layout source files must be **body fragments** (no `<html>` / `<body>` wrapper) so they expand correctly in both modes.

For SEO-sensitive pages, always build before deploy. Crawlers other than Googlebot frequently do not run JavaScript, and social-preview crawlers (Twitter, Facebook, Slack) never do.

---

## Build CLI

```bash
npx @yjmtmtk/templa build           # default: ./src → ./dist
npx @yjmtmtk/templa build -i pages -o public
npx @yjmtmtk/templa --help
```

The CLI walks every `.html` file in the source tree (skipping `_*` files and directories), expands templates and slots recursively, and writes the result to the output directory. Other files are copied as-is.

---

## Pitfalls — read before debugging

1. **Started Phase 2 too early.** If sub-agents are producing visually inconsistent sections, your skeleton wasn't done. Stop, finish Phase 1, restart Phase 2.

2. **Sub-agent invented a new `common-*` template.** This silently breaks the orchestrator-only contract. Audit `_partials/common-*.html` for new files added during Phase 2; revert them and escalate to Phase 1.5 instead.

3. **Forgot the `_` prefix.** A partial referenced by other pages but living at `src/header.html` will be written to `dist/header.html`, leaking your shell. Rename or move into `_partials/`.

4. **Wrong relative path in a layout.** A layout in `_layouts/` calling `<template src="_partials/x.html">` resolves to `_layouts/_partials/x.html` (which doesn't exist). Use `../_partials/x.html`.

5. **`{{key}}` placeholders surviving into the output as literal text.** The partial received no value for that key. Pass it as a regular attribute (`title="Home"`). The pre-0.2.0 `params="{ ... }"` and pre-0.5.0 `data-params="{ ... }"` forms have been removed; all data flows through plain attributes.

6. **Conditional that always renders or never renders.** `<template if>` is existence-based and any non-empty string is truthy, including the literal string `"false"`. Omit the attribute (or set it to empty `""`) to express "no". For inverse, use `<template unless="key">`.

7. **`<title>` / `<meta og:*>` in a head partial when running in runtime mode.** SNS crawlers and Google's first wave don't run JS, so they will see no title and no description. Either build, or keep these tags inline in the page.

8. **Strict CSP without `'unsafe-eval'`.** The runtime evaluates `params` via `new Function`. If the deployment forbids `'unsafe-eval'`, switch to build mode — the output HTML contains no template syntax and needs no runtime.

9. **`<slot name="head">` inside a body-fragment layout.** `<slot>` only fills where it sits in the DOM. To inject head content per-page, write it directly in the page's `<head>`.

10. **Runtime + Alpine timing.** Alpine auto-initializes before templa finishes expanding body templates, so x-data inside expanded content is missed. Pattern:

   ```html
   <script src="../templa.js"></script>
   <script src="https://cdn.jsdelivr.net/npm/alpinejs@3/dist/cdn.min.js" defer></script>
   <script type="module">
     await templa.start();
     window.Alpine && Alpine.initTree(document.body);
   </script>
   ```

   In build mode, Alpine attributes are pre-rendered into the static HTML and Alpine inits normally — no coordination needed.

11. **Runtime bootstrap leaks into build output.** The build CLI strips the canonical loader and start call automatically:

    | Source | Build output |
    |---|---|
    | `<script src="…/templa.js"></script>` | removed |
    | `<script src="…/templa.js" data-keep></script>` | preserved (opt-out) |
    | `<script type="module">await templa.start();</script>` | tag removed |
    | `<script>templa.start();</script>` | tag removed |
    | multi-line module with `await templa.start();` followed by post-init | only the `await` line is removed; post-init survives |
    | `templa.start().then(...)`, `const p = templa.start()`, etc. | left alone — write these only when you intentionally want runtime behaviour preserved |

    Stick to the canonical `await templa.start();` form unless you have a reason not to. Anything more complex falls outside the strip and will run at the consumer's page if your build output keeps it.

12. **Sub-agent referenced another section file with `<template src>`.** Sections are leaves; they don't compose other sections. If two sections share content, that content belongs in a `common-*.html` template introduced via Phase 1.5.

13. **Class name doesn't match the filename.** `_partials/index-hero.html` styles must be scoped under `.index-hero`. Different names invite cross-page class collisions and break the audit-by-grep workflow.

14. **Page entry file edited during Phase 2.** Page files are part of the skeleton; only the orchestrator adds, removes, or reorders the `<template src>` lines. A sub-agent that wants to add a new section asks the orchestrator to wire it in, then writes the new partial.

---

## Quick command reference

```bash
# Install
npm install @yjmtmtk/templa

# Build
npx @yjmtmtk/templa build -i ./src -o ./dist

# Version
npx @yjmtmtk/templa --version

# CDN (runtime)
# <script src="https://cdn.jsdelivr.net/npm/@yjmtmtk/templa/templa.min.js"></script>
```
