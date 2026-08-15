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
index.html          hero + about + research teaser + selected papers + news
research.html       five research themes, each with an inline SVG motif
publications.html   full list, filterable (filters are progressive enhancement)
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

Repo: `sadekar-onkar/sadekar-onkar.github.io`, branch **`gh-pages`** (that is
what GitHub Pages serves — not `main`/`master`).

```bash
git add -A && git commit -m "..." && git push origin gh-pages
```

Custom domain **onkar.sadekar.net** is configured in the repo's GitHub Pages
settings, not by a `CNAME` file in the tree. **Do not create a `CNAME` file** and
do not remove `.nojekyll`.

## Theming

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

## The hero network (`assets/js/network.js`)

Four modes, one chosen at random per visit; the "another view" button cycles them:

- `simplicial` — hypergraph with filled 2- and 3-faces, cooperation spreading
- `coauthors` — real co-authorship network, derived from `PAPERS`
- `papers` — one node per paper, clustered by theme, click to open the DOI
- `abstract` — generative modular graph, different every load

Colours are read from the CSS custom properties at runtime and re-read on the
`themechange` event, so the viz follows the palette automatically. It honours
`prefers-reduced-motion` (settles, then stops) and pauses when scrolled out of view.

`PAPERS` at the top of that file feeds two of the four modes. **It must be kept in
sync with `publications.html` by hand.**

Append `?net=simplicial` (or `coauthors`, `papers`, `abstract`) to the homepage
URL to force a particular mode instead of the random pick — useful when checking
a change to the visualisation.

Layout tuning lives in three places: `G.scale` in `load()` sets the overall
spacing from the canvas size, per-link `len`/`k` set rest length and stiffness
(soft `k` lets a long bridge suggest a connection without shoving two clusters
apart), and per-mode `rep` scales the global repulsion.

## Adding a paper

1. `publications.html` — copy an existing `<li class="pub" data-tags="...">`
   block. `data-tags` must be one of `higher-order`, `collective`, `culture`,
   `statphys`, `applied` (that is what the filter buttons match).
2. Update the `data-pub-count` number in the toolbar.
3. `assets/js/network.js` — add an entry to `PAPERS` so the network modes know
   about it.
4. Optionally add it to "Selected papers" on `index.html` and to the relevant
   theme on `research.html`.

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

## Planned, not built

A private area for personal material. Nothing in the current tree anticipates it
beyond leaving room in the nav. GitHub Pages serves everything publicly, so this
will need either a separate private host or client-side gating with the clear
understanding that client-side gating is not real security.
