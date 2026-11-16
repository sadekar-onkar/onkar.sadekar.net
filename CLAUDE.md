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
  workshop.md        the published workshop groups page (prose)
  workshop.json      the workshop ballots — `{}` until a workshop is exported
  vote.md            wording for the attendee voting screen
  wsadmin.md         wording for the workshop control screen
files/
  photo.jpg          just replace it
  cv.pdf             just replace it
assets/              css, js, fonts, favicon — design, not content
  js/viz.js          the shell for the interactive figure under each paper
  js/viz/<key>.js    one module per paper (see "The paper figures")
  data/viz/*.json    the real data five of those modules draw
build.py             content/ + files/  ->  _site/
tools/               prep_viz_data.py — NOT part of the build (see below)
workshop-api/        the Cloudflare Worker; NOT part of the site (see below)
tests/               ./tests/run.sh — the workshop group solver and rendering
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

- `viz:` / `viz_title:` — optional. The interactive figure under the paper and
  its heading; `viz:` names a file in `assets/js/viz/`. Whatever Markdown you
  write below the key lines is the note printed under the figure.

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
- **workshop** — canvas, `data-network="workshop"`. The workshop's discussion
  groups: one disconnected star per group, project at the hub. Unlike collab it
  reads a JSON blob, not the DOM, because the grouping is interactive. See
  "The workshop" below.
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

## The paper figures

Every paper on the publications page has an **Interactive** button that opens a
figure under it (added November 2026). `publications.html#viz-<key>` opens one
directly, which is what the home page's "Interactive figure" links use.

**Nothing loads until a button is pressed.** `viz.js` is the shell: it opens
the panel, injects `assets/js/viz/<key>.js` on first use, and hands the module
a small toolkit (theme-following canvas, sliders, an animation loop). A module
is one `PaperViz.register('key', function (v) { ... })`. Loops stop when the
panel is closed, off screen or the tab is hidden, and a step with nothing left
to animate calls `loop.sleep()`. With reduced motion set, nothing autoplays.

**What each one is — this matters more than how it looks.** A figure must not
claim more than the paper does, so each is one of three honest things, and its
note on the page says which:

| key | paper | what is drawn |
|---|---|---|
| `explosive` | PRL 2024 | the paper's mean-field solution + a live well-mixed simulation of the same game |
| `pgg` | arXiv 2026 | the paper's replicator equation, solved in closed form |
| `gamesel` | PRE 2024 | the paper's well-mixed model, simulated (payoff / k, Fermi with w = 1, as in the paper's code) |
| `tur` | PRE 2021 | closed-form heat statistics for two qubits / two oscillators; **the hybrid model is not drawn** |
| `abp` | PRE 2020 | the model, simulated, all three resetting protocols |
| `sep` | JSTAT 2020 | a small Monte Carlo version of the model on a ring |
| `overlap` | JRSI 2025 | **the paper's own simulation output**, not a re-run |
| `hazard` | Curr. Sci. 2021 | the paper's 446-city network; effective distance recomputed in the browser |
| `chimps` | Science 2024 | the paper's site / behaviour / genetic-link data |
| `cricket` | RSOS 2024 | real ODI careers from the paper's dataset |
| `nba` | arXiv 2026 | counts from the play-by-play behind the paper |
| `hoi` | NHB 2025 | a review, so: one model it covers (simplicial contagion) on a made-up network |

Things that are deliberate:

1. **`overlap` shows data, not a simulation.** A live lattice version was built
   first and thrown away: at a few hundred players the model just falls into
   all-cooperate or all-defect, and the averages the paper reports (1500
   players, 400 runs, quasi-stationary method) never appear. A toy that
   contradicts the paper is worse than no toy.
2. **Chimpanzee site coordinates are approximate**, typed in by hand (the data
   files have names and regions, not positions), and the coastline is a sketch.
   The note says so. Do not use them for anything but the picture.
3. **NBA lead changes are counted here as sign flips of the margin**, which is
   not necessarily the paper's count. The last-lead-change histogram uses the
   project's own table.
4. The `tur` formulas assume resonant exchange coupling, `tau = sin^2(Jt)`.
   They reproduce the structure the paper reports (a universal term >= 2 minus
   or plus the entropy production) and `tests/viz.test.js` checks them against
   the cumulants, but the constants in the time axis are not the paper's.

**The data files** in `assets/data/viz/` are made by
`python3 tools/prep_viz_data.py /path/to/onkar_main`, by hand, from research
folders that live **outside this repo** (it needs numpy/pandas/scipy and the
raw data; CI has neither and never runs it). The script is here so every number
can be traced. It asserts that the pruned India network still gives the paper's
Table 2 (Mumbai -> Thane 2.89, Pune 3.17, Delhi 3.70).

`tests/viz.test.js` checks the formulas, the models' invariants, and that
`publications.md`, the modules and the data files agree. It cannot check that a
picture looks right: after changing a module, open it.

To add a figure: write `assets/js/viz/<key>.js`, put `viz: <key>` on the paper,
add the key to `KEYS` in `tests/viz.test.js`. To remove one, delete the two
`viz` lines from the paper.

## The workshop

Three pages that let a room rank projects during a workshop and split it into
discussion groups. Added September 2026; switched from interest votes to ranked
ballots and groups in November 2026 for the Congolese Hunter-Gatherer Social
Network workshop (Rome, 12–15 Nov 2026).

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

**The ballot.** Each attendee ranks up to four projects (`maxRanks` in
`worker.js`). The phone always sends the whole ranking to `POST /ballot`, which
replaces that person's rows in one D1 batch — so the offline queue keeps only
the latest ballot per person and replays are harmless. The projects are the
programme's (`workshop-api/categories.txt`: `short | title | description`, P6
and P7 merged); only the admin can add one.

**The maths** is in `assets/js/groups.js`, and runs in the browser. Given K
groups and a size tolerance s, every group holds between `floor(N/K) - s`
(at least 1) and `ceil(N/K) + s` people. There are four solutions: solution r
aims for each person's r-th choice, or their last if they ranked fewer — so a
single pick never moves. **Each solution picks its own K projects.** Sharing
one set across all four was tried first and rejected: rounds 2–4 outvoted
round 1, and solution 1 stopped giving people their favourite. Cost of a
placement is its distance from the target on the person's ballot (0/100/300/600,
convex), 5000 for a project they did not rank. Each candidate project set is an
exact assignment problem (Hungarian algorithm on people × seats; seats below the
minimum carry a huge bonus so every group fills to its minimum, seats above an
even split a tiny growing penalty as the tie-break); all K-subsets are tried
with a lower-bound prune. Tests check it against exhaustive search.

The admin's K and s (`/state` → `groups`, `spread`) are what `/workshop` opens
with; its own steppers explore other values locally.

**The raw ballots.** `/wsadmin` also shows the matrix itself — the roster down,
the projects across, each cell that person's rank — with first-choice and
any-rank totals under the columns, and a `Download ballots.csv` button beside
the JSON export. The rows come from the roster `/bootstrap` already returns, so
somebody who has not voted is a blank row (which is the point: it answers "who
still hasn't ranked anything?"). The ranks come from `/export`, the only
endpoint that hands back ballots, so it is polled on its own slower timer
— every 15 s, and only while the table is open. Closed, the screen costs
exactly what it did before. The CSV is always a fresh read.

**Free-tier budget.** The Worker was meant to run a week unattended. D1's free
tier is 5M rows read a day, so: phones poll every 30 s (only a freeze or the
talk banner can change under them), `/workshop` every 15 s and only re-solves
when the ballots changed, and the Worker caches the roster/projects/settings
and `/export` in-isolate for 8 s, cleared by any write.

**Privacy changed with the groups.** The old projection published counts only.
A group list necessarily says who ranked what, so the page now carries the
ballots themselves (names re-keyed by `anonymise()` as before).

Run `./tests/run.sh` after touching any of this. The ballot matrix and its CSV
have their own suite (`tests/ballots.test.js`), which drives `wsadmin.js`
against a fake DOM and a fake store.

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
