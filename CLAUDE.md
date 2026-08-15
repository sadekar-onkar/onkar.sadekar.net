# onkar.sadekar.net — working notes

Personal academic site for Onkar Sadekar. Read this before changing anything.

## The one rule

**Static, zero-dependency.** Plain HTML, CSS and vanilla JS. No frameworks, no
bundler, no package manager, no build step, no CDN requests, no trackers.
`git push` is the entire deploy. If a change would add a dependency, it is the
wrong change.

Fonts are self-hosted in `assets/fonts/` (three variable `.woff2` files, ~102 KB
total) precisely so the site makes no third-party requests.

## Stack & layout

```
index.html          hero (ambient network bg) + about + research teaser + news
research.html       five research themes, each with an inline SVG motif
publications.html   papers grouped by year, filterable + papers/concepts graph
collaborators.html  co-author graph + the full list of people
talks.html          talks, teaching, service
code.html           released code & data
cv.html             structured CV + PDF download
404.html
.nojekyll           tells GitHub Pages to serve the files as-is
assets/
  css/site.css      everything; the palette system lives at the top
  js/site.js        theme + palette switching, nav, filters, reveal-on-scroll
  js/network.js     the hero visualisation (four modes)
  fonts/*.woff2     self-hosted
  img/              portrait, favicon
  pdf/              CV
```

Header and footer are **duplicated in every page**. That is the deliberate cost
of having no build step: change the nav in one file, change it in all seven.

## Deploy

Repo: `sadekar-onkar/sadekar-onkar.github.io`, branch **`gh-pages`**.

```bash
git add -A && git commit -m "..." && git push origin gh-pages
```

**Important:** this repo's Pages setting is `build_type: workflow`, so a push to
`gh-pages` does **not** publish anything by itself — `.github/workflows/pages.yml`
is what actually deploys. Before it existed, the last successful deployment was
December 2023, which is why commits made to `gh-pages` through 2024–2025 never
appeared on the live site. If the site ever stops updating, check the Actions tab
first, not the branch.

The workflow copies the tree as-is (no build) and excludes `.git`, `.github` and
this file. The stale al-folio workflow on the `master` branch is unrelated and
only fires on pushes to `master`.

Custom domain **onkar.sadekar.net** is configured in the repo's GitHub Pages
settings, not by a `CNAME` file in the tree. **Do not create a `CNAME` file** and
do not remove `.nojekyll`.

## Theming

The theme is stored under `theme-v2` / `palette-v2`. The v1 build wrote the
theme on **every page load**, which pinned whichever mode the visitor's OS was
in at their first visit and then ignored the OS forever. Only an explicit click
writes to storage now; renaming the keys retired the bad values. Do not call
`setTheme()` on load without passing `persist === false`.

Two independent axes, both on `<html>` and both persisted in `localStorage`:

- `data-theme` — `light` | `dark`. Defaults to the OS preference, and keeps
  following it until the visitor clicks the toggle.
- `data-palette` — `citrus` | `coral` | `indigo` | `botanical`.

Every colour in the site is a semantic custom property (`--bg`, `--ink`,
`--ink-2`, `--line`, `--a1`, `--a2`, `--a3`, `--a1-ink`, `--glow`, `--surface`,
`--bg-soft`). **No literal colour appears anywhere else in `site.css`.** Adding a
palette means adding two blocks near the top of the stylesheet and one entry to
`PALETTES` in `site.js`; nothing else needs to change.

All eight palette × theme combinations were checked to WCAG AA (4.5:1) for text,
muted text and accents against every background they sit on. If you change an
accent, re-check it.

An inline script in each `<head>` applies the stored theme before first paint.
Keep it — removing it reintroduces a flash of the wrong colours.

## The networks (`assets/js/network.js`)

Three figures, each chosen by the `data-network` attribute on its container:

- `papers` (publications.html) — bipartite: papers and the concepts they use.
  An edge means "this paper uses this concept".
- `collab` (collaborators.html) — co-authors around a hub. Clicking a person
  fills the panel above the list with the papers you share.
- `ambient` (index.html) — decorative background behind the hero. No labels,
  no interaction, `pointer-events: none`.

**There is no data array in this file.** Both real graphs are built by reading
the page's own HTML, so `publications.html` and `collaborators.html` are the
single source of truth. Add a paper to the page and the graph picks it up.

- papers graph reads `.pub[data-concepts]` — the space-separated concept slugs.
  Add a slug to `CONCEPT_LABEL` at the top of network.js to give it a caption.
- collaborators graph reads `.collab[data-person]` and the `<li>` items inside
  its `.collab-papers` list. Add `data-url="…"` to a `.collab` to give that
  person a profile link in the panel.

Two things that are deliberate and should not be "fixed":

1. **No cursor-repulsion force.** An earlier version pushed nodes away from the
   pointer. It looked lively and made the graph unusable — nodes fled the
   cursor, so they could never be hovered or clicked.
2. **The simulation stops when it settles.** `frame()` returns once kinetic
   energy drops below a threshold. A static graph is what makes clicking feel
   solid, and it keeps the page off the CPU. Anything that changes the picture
   calls `start()` (physics) or `repaint()` (draw only).

Labels are placed largest-first with collision detection; any label that would
overlap one already placed is dropped, so the figure never turns into
overlapping text.

Layout tuning: `G.scale` in `load()` sets overall spacing from the canvas size,
per-link `len`/`k` set rest length and stiffness, per-graph `rep` scales global
repulsion.

## Adding a paper

Everything about a paper lives in **`publications.html`** and nowhere else.

1. Copy an existing `<li class="pub" …>` block into the right
   `<section class="pub-year">` (or add a new year section — the heading is
   `<h3 class="year-head"><span>2027</span></h3>`).
2. `data-tags` drives the filter buttons: one of `higher-order`, `collective`,
   `culture`, `statphys`, `applied`.
3. `data-concepts` drives the graph: space-separated slugs from `CONCEPT_LABEL`
   in network.js.
4. Update the `data-pub-count` number in the toolbar.
5. Optionally add it to "Selected papers" on `index.html`, to the relevant theme
   on `research.html`, and to the people involved in `collaborators.html`.

Publications are hand-written HTML rather than generated from a data file so
they are indexable and work without JavaScript. The filtering on top is
progressive enhancement — with JS off, the full list still renders.

## Content still to verify

- The **Fall 2025 teaching entry** ("Current debates in evolutionary biology and
  anthropology") is attributed to UZH on `talks.html`; the source CV does not
  name the institution. Confirm.
- The **peer review** card on `talks.html` is generic — name the actual journals.
- The **CEU Best Dissertation Award** wording was reconstructed from a 2026 payment
  form (three recipients, EUR 1,500). Check CEU's official name for the award.
- `assets/pdf/Onkar_Sadekar_CV.pdf` is the May 2026 version and does not include
  the June 2026 NBA preprint.
- The portrait is from 2022.

## Not planned

A private area was discussed and dropped. Do not build one without being asked
again.
