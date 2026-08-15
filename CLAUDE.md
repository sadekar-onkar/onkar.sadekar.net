# onkar.sadekar.net — working notes

Personal academic site for Onkar Sadekar. Read this before changing anything.

## How to update the site

**Edit a `.md` file in `content/`, commit, push. That is the whole workflow.**
GitHub Actions runs `build.py`, which turns `content/` + `files/` into HTML and
deploys it. Onkar does not edit HTML, and there is no HTML in the repo.

To replace the photo or the CV: **drop a new file into `files/`** using the same
name (`photo.jpg`, `cv.pdf`). Nothing else changes.

```
content/
  site.md            everything global: name, nav, links, tag + concept vocabularies
  home.md            hero tagline, about, positions, theme cards, selected papers
  news.md            the "Recently" feed
  research.md        the five research themes
  publications.md    every paper — ALSO the source for the collaborators page
  talks.md           talks, teaching, service
  code.md            repositories
  cv.md              CV sections
  404.md
files/
  photo.jpg          just replace it
  cv.pdf             just replace it
assets/              css, js, fonts, favicon — design, not content
build.py             content/ + files/  ->  _site/
_site/               build output; gitignored, never committed
```

Local preview:

```bash
pip3 install markdown pyyaml    # once
python3 build.py --serve        # http://localhost:8000
```

## The one rule

The **output** is static and dependency-free: plain HTML, CSS and vanilla JS, no
frameworks, no CDN requests, no trackers. `markdown` and `pyyaml` are build-time
only and never reach the browser. Fonts are self-hosted in `assets/fonts/`
(~102 KB) so the site makes no third-party requests.

## Content format

Every content file uses the same shape: optional YAML front matter, then entries.

```markdown
### Title of the entry
key: value
key: value

Free Markdown body until the next ### heading.
```

`##` headings group entries into page sections. In `talks.md` the front matter's
`style:` map picks how each section renders (`timeline`, `rows`, `cards`,
`prose`).

### Adding a paper

Only `content/publications.md`. Copy a block:

- `authors:` — comma separated. `short_name` from site.md is bolded automatically.
- `venue:` — Markdown allowed (`*Physical Review E* 110, 014306`).
- `year:` — drives the year headings.
- `tags:` — filter buttons; keys come from `tags:` in site.md.
- `concepts:` — the bipartite diagram; keys come from `concepts:` in site.md.
- `links:` — `Label | url, Label | url`. The **first** link becomes the title link.

The **collaborators page is generated from the `authors:` lines** — there is no
separate people list to maintain. Give someone a profile link by adding them to
`profiles:` in site.md.

## Deploy

Repo `sadekar-onkar/sadekar-onkar.github.io`, branch **`gh-pages`**.

**This repo's Pages setting is `build_type: workflow`**, so pushing does not
publish by itself — `.github/workflows/pages.yml` does. Before that workflow
existed the last successful deployment was December 2023, which is why commits
made through 2024–2025 never appeared. If the site stops updating, check the
Actions tab first, not the branch.

Custom domain **onkar.sadekar.net** is set in the repo's Pages settings, not by a
`CNAME` file. **Do not create a `CNAME` file** and do not remove `.nojekyll`.

Making the repo private would require GitHub Pro; note the published site stays
public either way — a private repo hides the source, not the site.

## Theming

Stored under `theme-v2` / `palette-v2`. The v1 build wrote the theme on **every
page load**, which pinned whichever mode the visitor's OS was in at their first
visit and then ignored the OS forever. Only an explicit click writes to storage
now. Do not call `setTheme()` on load without `persist === false`.

Two axes on `<html>`: `data-theme` (`light`/`dark`, follows the OS until clicked)
and `data-palette` (`citrus`, `coral`, `indigo`, `botanical`).

Every colour is a semantic custom property (`--bg`, `--bg-soft`, `--surface`,
`--ink`, `--ink-2`, `--line`, `--a1`…`--a4`, `--a1-ink`, `--glow`). **No literal
colour appears anywhere else in `site.css`** except inside `@media print`. All
152 text/background pairs across the four palettes × light/dark are verified at
WCAG AA; re-check if you change an accent.

`--bg-soft` is the alternating band behind About / Selected papers / Contact.
It does switch correctly with the theme — verified by dumping computed styles on
both pages in both modes.

## The networks

- **publications** — a *static* bipartite SVG (papers ↔ concepts) emitted by
  `bipartite_svg()` in build.py. No JavaScript at all. The hover highlight is
  CSS `:has()`, which simply does nothing in browsers that lack it.
- **collaborators** — canvas, `data-network="collab"`. Reads the `.collab`
  entries from the page. Clicking a person fills the panel above the list.
- **home** — `data-network="ambient"`, decorative only, `pointer-events: none`.

Two things in `network.js` are deliberate and should not be "fixed":

1. **No cursor-repulsion force.** An earlier version pushed nodes away from the
   pointer; nodes fled the cursor and could never be hovered or clicked.
2. **The simulation stops once it settles.** A static graph is what makes
   clicking feel solid and keeps the page off the CPU. `start()` resumes physics,
   `repaint()` redraws only.

Labels are placed largest-first with collision detection; any that would overlap
one already placed is dropped.

## Content still to verify

- The **Fall 2025 teaching entry** is attributed to UZH in `talks.md`; the source
  CV does not name the institution.
- The **peer review** entry in `talks.md` is generic — name the actual journals.
- The **CEU Best Dissertation Award** wording was reconstructed from a 2026
  payment form (three recipients, EUR 1,500). Check CEU's official name.
- `files/cv.pdf` is the May 2026 version and predates the NBA preprint.
- The portrait is from 2022.

## Not planned

A private area was discussed and dropped. GitHub Pages has no server to
configure, so real access control there needs Cloudflare Access, Netlify, or
self-hosting. (Tiago Peixoto's skewed.de does it with Apache HTTP Basic Auth on
his own box — not something that ports to Pages.) Do not build one without being
asked again.
