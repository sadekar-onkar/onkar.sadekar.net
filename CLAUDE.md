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
  workshop.md        the published workshop network (prose)
  workshop.json      the workshop vote data — absent until a workshop happens
  vote.md            wording for the attendee voting screen
  wsadmin.md         wording for the workshop control screen
files/
  photo.jpg          just replace it
  cv.pdf             just replace it
assets/              css, js, fonts, favicon — design, not content
build.py             content/ + files/  ->  _site/
workshop-api/        the Cloudflare Worker; NOT part of the site (see below)
tests/               ./tests/run.sh — the workshop maths and rendering
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
- **workshop** — canvas, `data-network="workshop"`. The person-person projection
  of the workshop votes. Unlike collab it reads a JSON blob, not the DOM,
  because the thresholding is interactive. See "The workshop" below.
- **ambient** — `data-network="ambient"`. Currently **unused**: the home page
  switched to `particles.js` and the markup went with it, so `buildAmbient()`
  and the `.hero-bg` CSS are orphaned. `network.js` is still loaded on
  index.html where it has nothing to bind to.

Two things in `network.js` are deliberate and should not be "fixed":

1. **No cursor-repulsion force.** An earlier version pushed nodes away from the
   pointer; nodes fled the cursor and could never be hovered or clicked.
2. **The simulation stops once it settles.** A static graph is what makes
   clicking feel solid and keeps the page off the CPU. `start()` resumes physics,
   `repaint()` redraws only.

Labels are placed largest-first with collision detection; any that would overlap
one already placed is dropped.

## The workshop

Three pages that let a room vote on topics during a workshop and turn the result
into a published network. Added September 2026.

**The shape of it.** GitHub Pages serves files and executes nothing, so it
cannot accept a vote — the same wall the private-area idea hit (see "Not
planned"). So the system is split in two:

- **Live, throwaway.** `vote.html` (phones) and `wsadmin.html` (Onkar's laptop)
  talk to a Cloudflare Worker in `workshop-api/`. Both are `noindex`, neither is
  in `nav:`, and neither holds any data.
- **Permanent, static.** At the end you freeze, export `content/workshop.json`,
  commit, and `workshop.html` renders it with no network calls at all. **The
  Worker can then be deleted and the page still works.** That is the whole
  design: the external dependency is temporary by construction.

`workshop.html` falls back to polling `/export` when `content/workshop.json` is
absent or empty, re-drawing every few seconds so the network builds up on
screen as votes come in, until voting is frozen. `/export` takes the join code
before the freeze — so the live view works for anyone in the room without
votes-in-progress being world-readable — and is public after it. This is also
what lets the finished network go live the moment you click Freeze, without
waiting for a commit and a CI run.

**Switching it off.** `workshop.api` in `content/site.md` is empty by default;
the pages then say they are not configured. Nothing else on the site is
affected, and no other page ever gets the API `<meta>` — the
zero-third-party-request rule still holds everywhere else.

**The maths** is in `assets/js/projection.js`, and it is the part worth being
careful with. A one-mode projection of a bipartite graph is dense and
hub-driven: raw co-occurrence makes whoever ticked the most boxes look like the
centre of the room. Three views ship behind a toggle — raw count, Jaccard, and
a statistically validated network (hypergeometric test per pair,
Benjamini-Hochberg across all pairs; Tumminello et al. 2011). **Expect the
validated view to keep zero edges on a short ballot** — with 13 categories even
a perfect overlap cannot clear the corrected threshold, and the page says so in
those words rather than showing an empty canvas. That is a fact about the ballot
length, not a bug; do not "fix" it by dropping the correction.

Run `./tests/run.sh` after touching any of this. The hypergeometric tail is
checked against exact rational arithmetic in Python, and BH against the worked
example in the 1995 paper.

**Names.** The workshop is small and everyone knows everyone, so there is no
consent step — every attendee is shown by name (this replaced an opt-in
checkbox in Sept 2026). `anonymise()` in build.py still re-keys every person id
in a salted order *before* the JSON is written into the page — seeded ids are
positional, so `p07` is the seventh name on an alphabetical roster and anyone
holding that roster could otherwise just count — and it still honours an
explicit `consent: false` on a person (the render path and the test fixture
exercise that path), there just isn't anything in the live flow that sets it any
more. The roster itself is never committed: it lives in `workshop-api/roster.txt`
(gitignored) and the phones fetch it from the API. Published links carry a count
only, never which categories a pair shares.

Attendees can add their **own** name and add **topics** straight from `/vote` —
both need only the join code (they are additive and server-deduped, the same
threat model as a vote), so the admin is no longer the funnel for walk-ins and
late topics.

`workshop-api/README.md` has the deploy steps and the day-of runbook.

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

The workshop Worker is **not** a precedent for this. It accepts writes for one
day and is deleted; it guards nothing and serves no page. Access control would
have to be permanent and sit in front of the whole site, which is a different
problem with a different answer.
