# PLANNER.md — AI orchestrator prompt for templa project skeletons

You are about to design the **skeleton** of a templa project from a free-form site brief. Read this entire file before doing anything. Your single deliverable is a written plan in chat — the user will save it as `plan.md` at their project root if they accept it. **You will not create or modify any files in this step.**

If you have not already, also read `AGENTS.md` (same directory). It is the source of truth for templa's two-phase workflow, syntax, and conventions. This file complements `AGENTS.md`; it does not replace it.

## Your role

You are the orchestrator. Given a free-form site brief, your job is to produce a complete, executable plan — detailed enough that downstream sub-agents (or you, in a follow-up step) can implement the skeleton without asking another question.

The plan covers the serial part of building a templa site: design tokens, layout, chrome partials, and empty page shells. Parallel content fill happens after this plan is approved and the skeleton built.

## Hard rules

1. **Do not create or modify any file.** Output the plan only. The user reviews and approves before any implementation step.
2. **Do not run any build, `npm`, or shell command.** This is a planning step.
3. **Default to the canonical `common-*` set** — `common-head`, `common-layout`, `common-header`, `common-footer`, `common-subhero`. Add a new `common-*` template only when the brief unambiguously needs one (e.g. a recurring site-wide CTA banner). Each addition is a cost, not a default.
4. **Honor templa conventions.** `common-layout.html` is a body fragment (no `<html>` / `<body>`). Partials receive data via plain HTML attributes; `data-*` attributes are reserved as metadata and skipped. Section files ship with co-located `<style data-merge="css/style.css">` blocks and class names matching the filename.
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

(b) A concise section list under the wireframe with one-line notes per section (filename, purpose, `common-*` template used if any, attributes it accepts).

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
- `_partials/index-hero.html` — landing hero, attrs image / heading / subheading / ctaLabel / ctaHref. Optional fields wrapped in `<template if="ctaLabel">` inside the section.
- `_partials/index-favourites.html` — section with `<h2>` + grid of 3 inline `<article>` cards (no separate template; markup lives in this section file)
- `_partials/index-faq.html` — inline Alpine accordion (lives only on this page)

The wireframe is for both you (the orchestrator confirming structure) and the content sub-agent who will implement the page.

### 4. Decide the section list per page

For each page in §2, list the section files that will exist as `_partials/[pagename]-[sectionname].html`. The wireframe in §3 gives you the order; this step turns that into a flat file list.

Use the shared `common-subhero.html` for inner-page headers — do not introduce per-page subhero variants. Anything else gets its own `[pagename]-[sectionname].html` file.

If a non-trivial section type would recur across two or more pages (testimonials, blog post snippets, team-member cards, pricing rows), surface it as an "open question" at the end of the plan rather than silently inventing a new `common-*`. The orchestrator decides whether to extend Phase 1 with a new `common-*` template or to inline the duplication across pages.

### 5. Decide design tokens

Pick concrete values; do not stay vague. Provide all of:

- **Color** — 4–6 CSS-variable tokens with real hex codes that suit the inferred vibe:
  `--color-bg`, `--color-surface`, `--color-text`, `--color-muted`, `--color-accent`, `--color-accent-dark`, `--color-border`.
- **Typography** — one serif heading family + one sans body family. Use real Google Fonts names with the matching `family=` URL.
- **Spacing scale** — `--space-1` … `--space-7` (`.25rem` … ~`4rem`). The default scaffold ships these; tune values to fit the brief.
- **Radius / shadow** — 1–2 values each.
- **Container widths** — `--max-w` (text column, ~720px) and optionally `--max-w-wide` (~1100px).

If the brief was vague on aesthetics, infer from the project type and brand vibe and note explicitly that the values are an inference the user can override.

### 6. Decide the `common-*` templates

(All paths below are project-root relative.)

- **`src/_partials/common-head.html`** — `<head>` chrome: charset, viewport, theme-color, font preconnect/links, `./css/style.css` link. Title comes from the page's `<template src="…common-head.html" title="…">` attribute.
- **`src/_partials/common-layout.html`** — body fragment: invokes `common-header`, wraps a default `<slot>` in `<main>`, invokes `common-footer`.
- **`src/_partials/common-header.html`** — `<header>` element: brand + navigation anchors, each with `data-nav="<page-id>"` for active styling driven by `body[data-page="..."]` selectors in `src/css/style.css`.
- **`src/_partials/common-footer.html`** — `<footer>` element with copyright/social, identical on every page.
- **`src/_partials/common-subhero.html`** — `<section>` for inner-page headers, parameterized by `title` and optionally `bg`. Used by every page except the home page.

A project may add more `common-*` (rare). If you add any, justify it in §7's open questions.

### 7. Produce the file inventory

A complete listing of every file the skeleton will create, **paths relative to the project root**. Each line: path + a one-line role comment. Group by purpose. Example skeleton for a 3-page site (home, about, contact):

```text
src/css/style.css                       // tokens + base + chrome (locked in Phase 1)
src/_partials/common-head.html          // <head> chrome (charset, viewport, fonts, css link)
src/_partials/common-layout.html        // body skeleton: header / main slot / footer
src/_partials/common-header.html        // <header>: brand + nav with data-nav
src/_partials/common-footer.html        // <footer>: copyright + socials
src/_partials/common-subhero.html       // shared inner-page subhero (title, optional bg)
src/_partials/index-hero.html           // index — landing hero (sub-agent owned)
src/_partials/index-features.html       // index — features list
src/_partials/index-cta.html            // index — closing CTA
src/_partials/about-body.html           // about — prose / company story
src/_partials/contact-form.html         // contact — contact form
src/_partials/contact-map.html          // contact — embedded map
src/index.html                          // page entry — sections: hero, features, cta
src/about.html                          // page entry — sections: subhero, body
src/contact.html                        // page entry — sections: subhero, form, map
src/assets/                             // images / fonts / etc., copied to dist/ as-is
```

Every `[pagename]-[sectionname].html` listed above is a unit of Phase 2 sub-agent work. Every `common-*.html` is locked after Phase 1.

### 8. Sketch the section-fill dispatch

One sub-agent per `[pagename]-[sectionname].html` file. For each, give a 2–3-line brief: what the section contains, which design tokens to reach for, any image/asset references, any Alpine.js bits to author inline.

The dispatch is genuinely parallel — none of the section files share file content, so sub-agents never collide.

Example:

- Sub-agent A → `src/_partials/index-hero.html` — large landing hero, headline + subhead + CTA button. Use `--space-7` top padding, `--font-display` for the headline.
- Sub-agent B → `src/_partials/index-features.html` — 3-column grid of feature cards (inline `<article>` markup; no shared partial). Use `--space-5` between rows.
- Sub-agent C → `src/_partials/index-cta.html` — closing CTA strip with `--color-accent` background.
- Sub-agent D → `src/_partials/about-body.html` — prose-style "company story" article with one image.
- Sub-agent E → `src/_partials/contact-form.html` — `<form action="contact.php">` with name/email/message fields, inline Alpine validation if the brief asks.
- Sub-agent F → `src/_partials/contact-map.html` — Google Maps `<iframe>` embed.

### 9. State the build gate command

End the plan with this line, verbatim:

```bash
npx @yjmtmtk/templa build -i ./src -o ./dist
```

This is the gate that separates skeleton from content fill. Content sub-agents must not be dispatched until this command succeeds against the placeholder skeleton.

## Output format — your reply takes this shape

```markdown
# Plan: <project name>

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
- `_partials/index-hero.html` — landing hero, attrs image/heading/subheading/ctaLabel/ctaHref
- `_partials/index-favourites.html` — 3-column grid of inline `<article>` cards
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
- `_partials/common-subhero.html` — shared subhero, attrs title/tagline
- prose — `<article class="prose">` with 4 paragraphs and 1 image

## 4. Section list per page
- index — sections: index-hero, index-features, index-cta
- about — sections: common-subhero (title="About"), about-body

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

## 6. common-* templates
- src/_partials/common-head.html — charset, viewport, theme-color, fonts, ./css/style.css
- src/_partials/common-layout.html — header / <main><slot/></main> / footer
- src/_partials/common-header.html — brand + nav with data-nav
- src/_partials/common-footer.html — copyright + socials
- src/_partials/common-subhero.html — inner-page subhero (title attribute)

## 7. File inventory
```text
… full listing per the example above …
```

## 8. Section-fill dispatch
- Sub-agent A → src/_partials/index-hero.html — landing hero with image + CTA
- Sub-agent B → src/_partials/index-features.html — 3-column features grid
- Sub-agent C → src/_partials/index-cta.html — closing CTA strip
- Sub-agent D → src/_partials/about-body.html — prose "about us" article

## 9. Build gate
```bash
npx @yjmtmtk/templa build -i ./src -o ./dist
```

## Open questions
- (only if any; otherwise omit this section)
```

End the plan with one line:

> Plan complete — awaiting user approval before any file is written.

## After you finish

Stop. Wait for the next instruction. Implementation (writing files, building, dispatching content sub-agents) is a separate step driven by a different prompt or an upcoming SKILL.
