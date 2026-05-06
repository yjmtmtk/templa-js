# Phase 1 Plan — instruction prompt for an AI orchestrator

You are about to design the **Phase 1 skeleton** of a templa project from a free-form site brief. Read this entire file before doing anything. Your single deliverable is a written plan in chat. **You will not create or modify any files in this step.**

If you have not already, also read `AGENTS.md` in this repository. It is the source of truth for templa's two-phase workflow, syntax, and conventions. This file complements `AGENTS.md`; it does not replace it.

## Your role

You are the orchestrator. Given a free-form site brief from the user, your job is to produce a complete, executable Phase 1 plan — detailed enough that downstream sub-agents (or you, in a follow-up step) can implement Phase 1 without asking another question.

Phase 1 is the serial part of building a templa site. It locks down design tokens, layout, chrome partials, shape primitives, and empty page shells before any parallel Phase 2 content work begins.

## Hard rules

1. **Do not create or modify any file.** Output the plan only. The user reviews and approves before any implementation step.
2. **Do not run any build, `npm`, or shell command.** This is a planning step.
3. **Default to the canonical primitive kit** — `hero`, `sub-hero`, `card`. Add a new primitive only when the brief unambiguously needs one (e.g., a testimonial-heavy site genuinely needs `testimonial-card`). Each addition is a cost, not a default.
4. **Honor templa conventions.** Layouts are body fragments (no `<html>` / `<body>`). Partials receive data via plain HTML attributes; `data-*` attributes are reserved as metadata and skipped. Shape primitives ship with co-located `<style data-merge="style.css">` blocks.
5. **If something in the brief is ambiguous, list it under "Open questions" at the end of the plan.** Do not invent and do not guess silently.

## Project layout assumed by this plan

All paths in the plan are relative to the **project root**. The expected layout:

```
project-root/
├── plan.md            ← this plan, lives here
├── src/               ← templa source (build input)
│   ├── style.css
│   ├── _layouts/
│   ├── _partials/
│   ├── assets/        ← images, copied to dist/ as-is
│   └── *.html         ← entry pages
└── dist/              ← build output (gitignored, not authored)
```

The build command is therefore `npx @yjmtmtk/templa build -i ./src -o ./dist` (the templa CLI defaults). `plan.md` stays at root and is never inside `src/` (so it never leaks into the build output).

## Input you will receive

A free-form site brief from the user. It may include any of:

- Project name and one-line pitch
- Target audience
- Brand vibe (warm / clean / playful / minimal / dark / editorial / …)
- Color or typography hints
- Pages they want
- Content sections per page
- Specific features (FAQ, contact form, image gallery, blog, pricing table, …)

It may be a single paragraph or several pages. Read it twice. Extract intent before writing.

## Process — walk these in order

### 1. Restate the brief in 3–5 lines

Compress the user's brief to its essentials. Confirms you understood and surfaces any gap.

### 2. Decide the page set

List every entry HTML file the site will produce. Default minimum: `index.html`. Add pages named or strongly implied by the brief (`about.html`, `contact.html`, `products.html`, `pricing.html`, …). Pages are bare filenames at the source root.

### 3. Wireframe + section list per page

For each page, produce **both**:

(a) A small ASCII wireframe showing the visual structure top-to-bottom, including grid arrangements (e.g. cards in 3 columns), and labelling each section. Keep it readable — boxes drawn with `┌─┬─┐` style, ~40–60 chars wide. Show the layout chrome (header, footer) so the sub-agent sees the full page envelope.

(b) A concise section list under the wireframe with one-line notes per section (purpose, primitive used if any, attributes it accepts).

Example for a home page:

```text
┌────────────────────────────────────────┐
│ HEADER (brand · nav)                   │
├────────────────────────────────────────┤
│                                        │
│              HERO                      │
│           [bg image]                   │
│           Tea, slowly                  │
│         [Browse our teas]              │
│                                        │
├────────────────────────────────────────┤
│  A few favourites                      │
│  ┌──────┐ ┌──────┐ ┌──────┐             │
│  │ card │ │ card │ │ card │             │
│  └──────┘ └──────┘ └──────┘             │
├────────────────────────────────────────┤
│  Questions                             │
│  ▶ Q1                                  │
│  ▶ Q2                                  │
│  ▶ Q3                                  │
├────────────────────────────────────────┤
│ FOOTER                                 │
└────────────────────────────────────────┘
```

Sections (top → bottom):
- hero — primitive, attrs: image / heading / subheading / ctaLabel / ctaHref. Optional fields wrapped in `<template if="ctaLabel">` inside the primitive.
- "A few favourites" — section with `<h2>` + card-grid of 3 card primitives
- "Questions" — inline Alpine accordion (no primitive; lives only on this page)

The wireframe is for both you (the orchestrator confirming structure) and the Phase 2 sub-agent who will implement the page.

### 4. Decide the primitive kit

From the section list, infer which shape primitives are needed.

- `hero` — large landing-only header (image, headline, CTA)
- `sub-hero` — compact inner-page header (title + tagline)
- `card` — reusable item with optional image / title / body / optional price

If a non-default section type recurs across two or more pages (testimonials, blog post snippets, team members, menu items, pricing rows), promote it to a new primitive. Otherwise inline it in the single page that needs it.

For each primitive, name the pages and sections that consume it. If a primitive has optional fields (e.g. `ctaLabel`, `image`, `price`), the primitive's HTML wraps them in `<template if="key">…</template>` so an unspecified attribute simply omits that markup.

### 5. Decide design tokens

Pick concrete values; do not stay vague. Provide all of:

- **Color** — 4–6 CSS-variable tokens with real hex codes that suit the inferred vibe:
  `--color-bg`, `--color-surface`, `--color-text`, `--color-muted`, `--color-accent`, `--color-accent-dark`, `--color-border`.
- **Typography** — one serif heading family + one sans body family. Use real Google Fonts names with the matching `family=` URL.
- **Spacing scale** — base unit and a named scale `--space-1` … `--space-7` (`.5rem` … ~`6rem`).
- **Radius / shadow** — 1–2 values each.
- **Container widths** — `--max-w` (text column, ~720px) and optionally `--max-w-wide` (~1100px).

If the brief was vague on aesthetics, infer from the project type and brand vibe and note explicitly that the values are an inference the user can override.

### 6. Decide layout and chrome

(All paths below are project-root relative.)

- **`src/_layouts/main.html`** — a body fragment (no `<html>` / `<body>` wrapper). Describe its slot shape. Almost always: `<header>` with brand + named `nav` slot, `<main>` with default slot, static `<footer>`.
- **`src/_partials/meta.html`** — `<head>` chrome: charset, viewport, theme-color, font preconnect/links, `./style.css` link.
- **`src/_partials/nav.html`** — navigation anchors, each with `data-nav="<page-id>"` for active styling driven by `body[data-page="..."]` selectors in `src/style.css`.

### 7. Produce the file inventory

A complete listing of every file Phase 1 will create, **paths relative to the project root**. Each line: path + a one-line role comment. Group by purpose. Page entries should hint at their Phase 2 section composition. Example skeleton:

```text
src/style.css                       // tokens + base + chrome (source of truth)
src/_layouts/main.html              // body fragment — header / main slot / footer
src/_partials/meta.html             // <head> chrome (charset, viewport, fonts, css link)
src/_partials/nav.html              // global nav with data-nav="<page>" attributes
src/_partials/hero.html             // primitive: landing hero (co-located styles)
src/_partials/sub-hero.html         // primitive: inner-page header
src/_partials/card.html             // primitive: reusable item card
src/index.html                      // shell — sections: hero, featured cards, faq
src/about.html                      // shell — sections: sub-hero, prose
src/contact.html                    // shell — sections: sub-hero, contact, map
src/assets/                         // images / fonts / etc., copied to dist/ as-is
```

### 8. Sketch the Phase 2 dispatch

One sub-agent per entry page. For each, give a 2–3-line brief: which primitives the page composes, which sections need inline content, any image/asset references, any Alpine.js bits to author inline.

### 9. State the build gate command

End the plan with this line, verbatim:

```bash
npx @yjmtmtk/templa build -i ./src -o ./dist
```

This is the gate that separates Phase 1 from Phase 2. Phase 2 sub-agents must not be dispatched until this command succeeds against the placeholder skeleton.

## Output format — your reply takes this shape

```markdown
# Phase 1 plan: <project name>

## 1. Brief, restated
…

## 2. Page set
- src/index.html — …
- src/about.html — …

## 3. Wireframes + sections per page

### index.html
```text
┌──────────────────────────────────────┐
│ HEADER                               │
├──────────────────────────────────────┤
│            HERO                      │
├──────────────────────────────────────┤
│ A few favourites                     │
│ ┌────┐ ┌────┐ ┌────┐                  │
│ └────┘ └────┘ └────┘                  │
├──────────────────────────────────────┤
│ Questions (FAQ accordion)            │
├──────────────────────────────────────┤
│ FOOTER                               │
└──────────────────────────────────────┘
```
- hero — primitive, attrs image/heading/subheading/ctaLabel/ctaHref
- card grid (×3) — uses card primitive
- faq — inline Alpine accordion

### about.html
```text
┌──────────────────────────────────────┐
│ HEADER                               │
├──────────────────────────────────────┤
│           SUB-HERO                   │
├──────────────────────────────────────┤
│           PROSE                      │
│            ¶ ¶ [img] ¶ ¶              │
├──────────────────────────────────────┤
│ FOOTER                               │
└──────────────────────────────────────┘
```
- sub-hero — primitive, attrs title/tagline
- prose — `<article class="prose">` with 4 paragraphs and 1 image

## 4. Primitive kit
- hero  → consumed by index.html (hero section)
- sub-hero → consumed by about.html, contact.html
- card → consumed by index.html (featured ×3)

## 5. Design tokens
```css
:root {
  --color-bg: #faf8f3;
  --color-text: #1f1f1c;
  /* … */
}
```
Fonts: Inter (body), Lora (headings).
(Note: tokens inferred from the "warm, slow" vibe; override if you want.)

## 6. Layout and chrome
- src/_layouts/main.html — header (brand + nav slot), main (default slot), footer (static)
- src/_partials/meta.html — charset, viewport, theme-color, fonts, ./style.css
- src/_partials/nav.html — 3 entries with data-nav

## 7. File inventory
```text
… full listing per the example above …
```

## 8. Phase 2 dispatch
- Sub-agent A → src/index.html — composes hero + 3 cards + inline FAQ accordion (Alpine)
- Sub-agent B → src/about.html — composes sub-hero + prose article with one image

## 9. Build gate
```bash
npx @yjmtmtk/templa build -i ./src -o ./dist
```

## Open questions
- (only if any; otherwise omit this section)
```

End the plan with one line:

> Plan complete — awaiting user approval before any Phase 1 file is written.

## After you finish

Stop. Wait for the next instruction. Implementation (writing files, building, dispatching Phase 2) is a separate step driven by a different prompt or an upcoming SKILL.
