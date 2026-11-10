/* workshop-api — the one external service.
 *
 * A Cloudflare Worker over a D1 database. It exists for the length of one
 * workshop and can be deleted afterwards: once the votes are exported to
 * content/workshop.json and committed, the published network is pure static
 * output and never calls this again.
 *
 * Two secrets, two privilege levels:
 *
 *   JOIN_CODE     shown on a slide in the room. Lets a phone read the roster,
 *                 write its own ranked ballot, and add a walk-in name.
 *                 Public by nature — it is typed by every attendee — so it must
 *                 never authorise anything destructive.
 *   ADMIN_TOKEN   yours alone. Sets the current talk, the number of groups,
 *                 freezes, adds projects, and reads the live vote counts.
 *
 * Everything a voter can do is idempotent — a ballot write replaces one
 * person's ranking whole, and a name insert is deduped — so a leaked join code
 * costs you noise, not data.
 *
 * Deploy: see README.md
 */

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

/* ------------------------------------------------------------------ util -- */

function cors(env, request) {
  /* Explicit allow-list. The site is the only legitimate caller; a wildcard
     would let any page on the internet spend your quota. */
  const allowed = (env.ALLOWED_ORIGINS || 'https://onkar.sadekar.net')
    .split(',').map(s => s.trim()).filter(Boolean);
  const origin = request.headers.get('Origin') || '';
  const ok = allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : allowed[0],
    'Access-Control-Allow-Headers': 'content-type, x-join, x-admin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function reply(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({}, JSON_HEADERS, headers || {})
  });
}

/* Constant-time-ish compare. Not a serious threat model here (the join code is
   read aloud in a room), but the admin token deserves better than ===. */
function tokenEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const isAdmin = (req, env) => tokenEq(req.headers.get('x-admin') || '', env.ADMIN_TOKEN || ' ');
const hasJoin = (req, env) => tokenEq(req.headers.get('x-join') || '', env.JOIN_CODE || ' ');

async function settings(env) {
  const { results } = await env.DB.prepare('SELECT key, value FROM setting').all();
  const out = {};
  for (const r of results) out[r.key] = r.value;
  return out;
}

/* Next sequential id in a table: p01, p02, … Sequence gaps do not matter, only
   uniqueness does, so COUNT+1 is fine at workshop scale. Two phones adding at
   the same instant can still land on the same id, so the callers retry the
   INSERT on the resulting primary-key clash rather than assuming it is rare. */
async function nextId(env, table, prefix) {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM ' + table).first();
  const n = (row ? row.n : 0) + 1;
  return prefix + String(n).padStart(2, '0');
}

/* INSERT under a nextId() key, retrying a few times if a concurrent add took
   that id first. `build(id)` returns the prepared statement to run. */
async function insertSeq(env, table, prefix, build) {
  for (let attempt = 0; ; attempt++) {
    const id = await nextId(env, table, prefix);
    try {
      await build(id).run();
      return id;
    } catch (e) {
      if (attempt >= 4 || !/UNIQUE|constraint/i.test(String((e && e.message) || e))) throw e;
    }
  }
}

/* ---------------------------------------------------------------- cache -- */

/* A short-lived cache inside this isolate for the reads every phone and the
   projector repeat: the roster, the projects, the settings, the export. D1's
   free tier allows 5M rows read a day; forty phones re-reading the roster every
   few seconds for a week would get uncomfortably close. Any write through this
   isolate clears it at once, and other isolates catch up within TTL_MS. */
const TTL_MS = 8000;
const memo = new Map();

async function cached(key, fn) {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = await fn();
  memo.set(key, { at: Date.now(), value });
  return value;
}
function bust() { memo.clear(); }

const MAX_RANKS = 4;

/* ------------------------------------------------------------- endpoints -- */

async function shared(env) {
  return cached('shared', async () => {
    const set = await settings(env);
    const cats = await env.DB.prepare(
      'SELECT id, label, short, description, added_live FROM category ' +
      'ORDER BY added_live, created_at, id').all();
    const people = await env.DB.prepare(
      'SELECT id, name FROM attendee WHERE active = 1 ORDER BY name').all();
    return { set, categories: cats.results, attendees: people.results };
  });
}

/* One call powers the whole phone screen: roster, ballot, this person's
   ranking, and the live state. Polled every ~30s for a freeze or a new talk. */
async function bootstrap(request, env, url) {
  const person = url.searchParams.get('person') || '';
  const { set, categories, attendees } = await shared(env);

  const body = {
    state: set.state || 'open',
    currentTalk: set.current_talk || '',
    maxRanks: MAX_RANKS,
    categories,
    attendees,
    rosterSize: attendees.length
  };

  if (person) {
    const mine = await env.DB.prepare(
      'SELECT category_id FROM vote WHERE person_id = ? ORDER BY rank').bind(person).all();
    body.mine = mine.results.map(r => r.category_id);
  }

  /* Live counts are for the admin screen only — showing them on the phones
     would bias later voting toward whatever is already winning. */
  if (isAdmin(request, env)) {
    const counts = await env.DB.prepare(
      'SELECT category_id, COUNT(*) AS n, SUM(rank = 1) AS first ' +
      'FROM vote GROUP BY category_id').all();
    const voters = await env.DB.prepare(
      'SELECT COUNT(DISTINCT person_id) AS n FROM vote').first();
    body.counts = counts.results;
    body.voterCount = voters ? voters.n : 0;
    body.groups = +set.groups || 5;
    body.spread = set.spread === undefined ? 1 : +set.spread;
  }
  return body;
}

/* The whole ranked ballot, replaced atomically. `ranking` is an ordered list
   of category ids, favourite first, at most MAX_RANKS long; [] withdraws. */
async function castBallot(request, env) {
  const set = await settings(env);
  if (set.state === 'frozen') return reply({ error: 'voting closed' }, 409);

  const { personId, ranking } = await request.json();
  if (!personId || !Array.isArray(ranking)) {
    return reply({ error: 'personId and ranking required' }, 400);
  }
  const ids = ranking.map(String);
  if (ids.length > MAX_RANKS) return reply({ error: 'at most ' + MAX_RANKS + ' projects' }, 400);
  if (new Set(ids).size !== ids.length) return reply({ error: 'a project is ranked twice' }, 400);

  /* Every id must exist. Without this a typo'd or spoofed id would create a
     phantom node in the final network. */
  const p = await env.DB.prepare('SELECT id FROM attendee WHERE id = ? AND active = 1')
    .bind(personId).first();
  if (!p) return reply({ error: 'unknown person' }, 404);
  const { categories } = await shared(env);
  const known = new Set(categories.map(c => c.id));
  if (!ids.every(id => known.has(id))) return reply({ error: 'unknown project' }, 404);

  /* D1 runs a batch as one transaction: nobody ever reads half a ballot. */
  const stmts = [env.DB.prepare('DELETE FROM vote WHERE person_id = ?').bind(personId)];
  ids.forEach((cid, i) => stmts.push(env.DB.prepare(
    'INSERT INTO vote (person_id, category_id, rank) VALUES (?, ?, ?)').bind(personId, cid, i + 1)));
  await env.DB.batch(stmts);
  bust();
  return reply({ ok: true, personId, ranking: ids });
}

async function addCategory(request, env) {
  const { label, short, description } = await request.json();
  const text = (label || '').trim();
  if (!text) return reply({ error: 'label required' }, 400);

  const dup = await env.DB.prepare('SELECT id FROM category WHERE lower(label) = lower(?)')
    .bind(text).first();
  if (dup) return reply({ ok: true, id: dup.id, duplicate: true });

  const id = await insertSeq(env, 'category', 'c', (cid) =>
    env.DB.prepare('INSERT INTO category (id, label, short, description, added_live) ' +
                   'VALUES (?, ?, ?, ?, 1)')
      .bind(cid, text, (short || text).trim(), (description || '').trim()));
  bust();
  return reply({ ok: true, id, label: text });
}

async function addAttendee(request, env) {
  const { name } = await request.json();
  const text = (name || '').trim().slice(0, 80);
  if (!text) return reply({ error: 'name required' }, 400);

  /* Case-insensitive de-dupe, like addCategory. Two rows with the same name
     would collapse into one node in the final network (and seed.py already
     refuses a roster with duplicates for the same reason), so a walk-in who
     is in fact already on the list just gets pointed back at their own id. */
  const dup = await env.DB.prepare(
    'SELECT id FROM attendee WHERE active = 1 AND lower(name) = lower(?)').bind(text).first();
  if (dup) return reply({ ok: true, id: dup.id, duplicate: true });

  const id = await insertSeq(env, 'attendee', 'p', (pid) =>
    env.DB.prepare('INSERT INTO attendee (id, name) VALUES (?, ?)').bind(pid, text));
  bust();
  return reply({ ok: true, id, name: text });
}

async function putSetting(env, key, value) {
  await env.DB.prepare(
    'INSERT INTO setting (key, value) VALUES (?, ?) ' +
    'ON CONFLICT (key) DO UPDATE SET value = excluded.value').bind(key, String(value)).run();
}

async function setState(request, env) {
  const body = await request.json();
  if (typeof body.currentTalk === 'string') await putSetting(env, 'current_talk', body.currentTalk);
  if (typeof body.frozen === 'boolean') await putSetting(env, 'state', body.frozen ? 'frozen' : 'open');
  /* How many groups, and how far their sizes may stray from an even split.
     Only the defaults /workshop opens with — the page can still try others. */
  if (Number.isInteger(body.groups) && body.groups >= 1 && body.groups <= 30) {
    await putSetting(env, 'groups', body.groups);
  }
  if (Number.isInteger(body.spread) && body.spread >= 0 && body.spread <= 10) {
    await putSetting(env, 'spread', body.spread);
  }
  bust();
  return reply(Object.assign({ ok: true }, await settings(env)));
}

/* The seam between the ephemeral half and the permanent one. This JSON is
 * exactly what build.py reads from content/workshop.json — nothing reshapes it
 * on the way in. Only people who actually voted appear; a roster entry that
 * never voted is not a node. Every project appears, voted for or not: a group
 * can be assigned one nobody ranked first.
 *
 * Public once frozen, so workshop.html can render the moment you hit Freeze,
 * without waiting for a commit and a CI run. */
async function exportJson(env) {
  return cached('export', async () => {
    const set = await settings(env);
    const people = await env.DB.prepare(
      'SELECT a.id, a.name FROM attendee a ' +
      'WHERE a.active = 1 AND a.id IN (SELECT DISTINCT person_id FROM vote) ' +
      'ORDER BY a.id').all();
    const cats = await env.DB.prepare(
      'SELECT id, label, short, description, added_live FROM category ' +
      'ORDER BY added_live, created_at, id').all();
    const votes = await env.DB.prepare(
      'SELECT person_id, category_id, rank FROM vote ORDER BY person_id, rank').all();

    return {
      workshop: set.workshop_name || 'Workshop',
      date: set.workshop_date || new Date().toISOString().slice(0, 10),
      frozen_at: new Date().toISOString(),
      state: set.state || 'open',
      groups: +set.groups || 5,
      spread: set.spread === undefined ? 1 : +set.spread,
      /* consent is always true now — the workshop is small enough that everyone
         is shown by name. The field stays so build.py / groups.js and their
         tests keep a defined shape to read. */
      people: people.results.map(p => ({ id: p.id, name: p.name, consent: true })),
      categories: cats.results.map(c => ({
        id: c.id, label: c.label, short: c.short || c.label,
        description: c.description || '', live: !!c.added_live
      })),
      votes: votes.results.map(v => [v.person_id, v.category_id, v.rank])
    };
  });
}

/* The endpoint helpers build their own Response so they can pick a status;
   this glues the CORS headers on without rebuilding the body. */
function withCors(res, head) {
  const h = new Headers(res.headers);
  for (const k in head) h.set(k, head[k]);
  return new Response(res.body, { status: res.status, headers: h });
}

/* ----------------------------------------------------------------- entry -- */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const head = cors(env, request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: head });

    const path = url.pathname.replace(/\/+$/, '') || '/';
    const admin = isAdmin(request, env);
    const join = hasJoin(request, env) || admin;

    try {
      /* Export is public once frozen — that is what lets the published page go
         live on a click instead of on a deploy. Before the freeze, anyone with
         the join code can read it too, so /workshop can render the network live
         while voting is open: it stays inside the room, not world-readable. */
      if (path === '/export' && request.method === 'GET') {
        const data = await exportJson(env);
        if (data.state !== 'frozen' && !join) return reply({ error: 'not frozen' }, 403, head);
        return reply(data, 200, head);
      }

      if (!join) return reply({ error: 'bad join code' }, 401, head);

      if (path === '/bootstrap' && request.method === 'GET') {
        return reply(await bootstrap(request, env, url), 200, head);
      }
      if (path === '/ballot' && request.method === 'POST') {
        return withCors(await castBallot(request, env), head);
      }

      /* Adding your own name needs only the join code: additive and de-duped
         server-side, so the worst a leaked code buys is noise — the same threat
         model as a vote. Walk-ins do this themselves. */
      if (path === '/attendee' && request.method === 'POST') {
        return withCors(await addAttendee(request, env), head);
      }

      if (!admin) return reply({ error: 'admin token required' }, 403, head);

      /* The projects are the programme's, so only the admin adds one. */
      if (path === '/category' && request.method === 'POST') {
        return withCors(await addCategory(request, env), head);
      }

      if (path === '/state' && request.method === 'POST') {
        return withCors(await setState(request, env), head);
      }

      return reply({ error: 'not found' }, 404, head);
    } catch (err) {
      return reply({ error: String((err && err.message) || err) }, 500, head);
    }
  }
};
