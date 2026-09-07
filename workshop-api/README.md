# workshop-api

The one external service. A Cloudflare Worker over a D1 database that collects
workshop votes for a day and is then deleted.

The site itself stays a static host: GitHub Pages serves files and executes
nothing, so it cannot accept a vote. This is the smallest thing that can.
**Once `content/workshop.json` is committed, the published network no longer
touches this at all** — you can tear the whole Worker down and the page keeps
working forever.

---

## Setup, once

```bash
npm install -g wrangler          # or: npx wrangler ...
wrangler login

wrangler d1 create workshop      # paste the returned id into wrangler.toml
wrangler d1 execute workshop --remote --file=schema.sql

wrangler secret put JOIN_CODE    # short, readable aloud. e.g. NETS26
wrangler secret put ADMIN_TOKEN  # long and random: openssl rand -hex 24

wrangler deploy
```

Then put the deployed URL into `content/site.md`:

```yaml
workshop:
  api: "https://workshop-api.<your-subdomain>.workers.dev"
```

…and edit `ALLOWED_ORIGINS` in `wrangler.toml` if you want to test against
`http://localhost:8000`. The origin allow-list is enforced; a wildcard would
let any page on the internet spend your quota.

## Seed the roster and the predefined categories

```bash
cp roster.example.txt roster.txt      # then edit: one attendee per line
cp categories.example.txt categories.txt
python3 seed.py roster.txt categories.txt "Workshop name" 2026-09-20 > seed.sql
wrangler d1 execute workshop --remote --file=seed.sql
```

`roster.txt` is **gitignored on purpose**. Attendee names are never committed
and never baked into the site — the phones fetch the roster from this API at
runtime. That is also what lets you add walk-ins on the day without a rebuild.

Re-running `seed.py` is safe (every statement is `INSERT OR IGNORE`), but do
not reorder `roster.txt` once voting has started: ids are positional.

## The QR code

Point it at the short, extensionless URL — fewer characters means a coarser,
easier-to-scan code from the back of a room:

```bash
brew install qrencode
qrencode -o ../files/workshop-qr.png -s 12 -m 2 "https://onkar.sadekar.net/vote"
```

`files/*.png` is copied to `assets/img/` by the build, so you can then put it on
a slide or reference it from a page. Any QR tool will do — this is a one-off,
so nothing is added to the build dependencies.

---

## On the day

1. Open `/wsadmin` on your laptop. Enter the room code and the admin token.
2. Put the QR code and the room code on a slide.
3. After each talk, optionally set **Current talk** — it shows as a banner on
   every phone. Topics can be added from any phone or from `/wsadmin`, and
   appear everywhere within ten seconds; so can walk-in names.
4. Watch **n of N have voted**. Below roughly 15 voters the projection is noise,
   so this number matters more than any of the maths.
5. `/workshop` renders live for anyone with the room code and re-polls every few
   seconds, so you can put it on a screen and watch the network build up.
6. At the end, **Freeze and publish**. Phones stop accepting votes and
   `/workshop` goes world-public immediately by fetching `/export`.
7. Click **Download workshop.json**, save it as `content/workshop.json`,
   uncomment the Workshop line in `content/site.md`'s `nav:`, commit and push.
   The page is now fully static.
8. Delete the Worker and the database whenever you like.

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/bootstrap?person=<id>` | join code | roster, ballot, this person's votes, state. Counts too, if the admin token is present |
| POST | `/vote` | join code | upsert or delete one (person, category) pair |
| POST | `/category` | join code | add a topic mid-workshop (deduped) |
| POST | `/attendee` | join code | add a walk-in name (deduped) |
| POST | `/state` | admin | set the current talk, or freeze |
| GET | `/export` | public **once frozen**, else join code | the JSON `build.py` reads; `/workshop` polls it to render live |

## Security model

- The **join code is public by nature** — every attendee types it, and it will
  end up in a photo of a slide. So it authorises nothing destructive: reading
  the roster, upserting votes under a person id, and adding a topic or a walk-in
  name (both deduped). The worst a leaked code buys someone is noise, not damage.
- The **admin token** is the real boundary — freezing, the current-talk banner,
  the live vote counts, and reading `/export` before the freeze. It is typed
  into `/wsadmin` once and held in `sessionStorage`; it is never built into any
  page and never written to `localStorage`. Closing the tab ends the session.
- Every vote is an **upsert keyed on (person, category)**, so a replayed or
  retried write is a no-op. That is what makes the phone's offline queue safe.
- `/export` is world-readable only after you freeze. Before that it takes the
  join code, so `/workshop` can render the network live during the session
  without votes-in-progress being readable from outside the room.

### What this does not defend against

Anyone in the room can vote as anyone else on the roster — there is no per-person
authentication, by design, because the alternative is emailing 40 people a magic
link for a two-hour workshop. This rests on the same social trust as a show of
hands, and is worth knowing rather than pretending otherwise. If that is not
acceptable for your setting, the fix is per-attendee tokens printed on their
badges, which is a real change to `seed.py` and `/bootstrap`, not a config flag.

There is also no rate limiting. At workshop scale D1's free tier is not
reachable by hand, but a determined script could burn quota. If that worries
you, put a Cloudflare Rate Limiting rule in front of the Worker.

## Privacy

The workshop is small and everyone knows everyone, so there is **no consent
step** — every attendee is shown by name. What still happens at build time:
`anonymise()` in `build.py` re-keys all person ids in a salted order before the
JSON is written into the page. Seeded ids are positional — `p07` is the seventh
name on an alphabetical roster — so anyone holding that roster could otherwise
read a seat off the network. `anonymise()` also still honours an explicit
`consent: false` on a person (the render path and the test fixture exercise it);
nothing in the live flow sets it any more.

The published network carries link counts only — never which categories a pair
has in common, and never anyone's ballot.
