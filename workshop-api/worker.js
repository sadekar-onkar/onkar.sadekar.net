/* workshop-api — the one external service.
 *
 * A Cloudflare Worker over a D1 database. It exists for the length of one
 * workshop and can be deleted afterwards: once the votes are exported to
 * content/workshop.json and committed, the published network is pure static
 * output and never calls this again.
 *
 * Two secrets, two privilege levels:
 *
 *   JOIN_CODE     shown on a slide in the room. Lets a phone read the roster
 *                 and write its own votes. Public by nature — it is typed by
 *                 every attendee — so it must never authorise anything
 *                 destructive.
 *   ADMIN_TOKEN   yours alone. Adds categories, freezes, exports.
 *
 * Everything a voter can do is idempotent and scoped to a single
 * (person, category) row, so a leaked join code costs you noise, not data.
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
   uniqueness does, so COUNT+1 is fine at workshop scale (no concurrent admins). */
async function nextId(env, table, prefix) {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM ' + table).first();
  const n = (row ? row.n : 0) + 1;
  return prefix + String(n).padStart(2, '0');
}

/* ------------------------------------------------------------- endpoints -- */

/* One call powers the whole phone screen: roster, ballot, this person's
   existing votes, and the live state. Polled every ~10s for new categories. */
async function bootstrap(request, env, url) {
  const person = url.searchParams.get('person') || '';
  const set = await settings(env);

  const cats = await env.DB.prepare(
    'SELECT id, label, added_live FROM category ORDER BY added_live, created_at, id').all();
  const people = await env.DB.prepare(
    'SELECT id, name, consent FROM attendee WHERE active = 1 ORDER BY name').all();
  const voters = await env.DB.prepare(
    'SELECT COUNT(DISTINCT person_id) AS n FROM vote').first();

  const body = {
    state: set.state || 'open',
    currentTalk: set.current_talk || '',
    categories: cats.results,
    attendees: people.results,
    voterCount: voters ? voters.n : 0,
    rosterSize: people.results.length
  };

  if (person) {
    const mine = await env.DB.prepare(
      'SELECT category_id FROM vote WHERE person_id = ?').bind(person).all();
    body.mine = mine.results.map(r => r.category_id);
    const me = await env.DB.prepare(
      'SELECT consent FROM attendee WHERE id = ?').bind(person).first();
    body.consent = me ? !!me.consent : false;
  }

  /* Live counts are for the admin screen only — showing them on the phones
     would bias later voting toward whatever is already winning. */
  if (isAdmin(request, env)) {
    const counts = await env.DB.prepare(
      'SELECT category_id, COUNT(*) AS n FROM vote GROUP BY category_id').all();
    body.counts = counts.results;
  }
  return body;
}

async function castVote(request, env) {
  const set = await settings(env);
  if (set.state === 'frozen') return reply({ error: 'voting closed' }, 409);

  const { personId, categoryId, on } = await request.json();
  if (!personId || !categoryId) return reply({ error: 'personId and categoryId required' }, 400);

  /* Both foreign keys must exist. Without this a typo'd or spoofed id would
     create a phantom node in the final network. */
  const p = await env.DB.prepare('SELECT id FROM attendee WHERE id = ? AND active = 1')
    .bind(personId).first();
  const c = await env.DB.prepare('SELECT id FROM category WHERE id = ?')
    .bind(categoryId).first();
  if (!p || !c) return reply({ error: 'unknown person or category' }, 404);

  if (on) {
    await env.DB.prepare(
      'INSERT INTO vote (person_id, category_id) VALUES (?, ?) ' +
      'ON CONFLICT (person_id, category_id) DO UPDATE SET updated_at = datetime(\'now\')')
      .bind(personId, categoryId).run();
  } else {
    await env.DB.prepare('DELETE FROM vote WHERE person_id = ? AND category_id = ?')
      .bind(personId, categoryId).run();
  }
  return reply({ ok: true, personId, categoryId, on: !!on });
}

async function setConsent(request, env) {
  const { personId, consent } = await request.json();
  if (!personId) return reply({ error: 'personId required' }, 400);
  await env.DB.prepare('UPDATE attendee SET consent = ? WHERE id = ?')
    .bind(consent ? 1 : 0, personId).run();
  return reply({ ok: true, consent: !!consent });
}

async function addCategory(request, env) {
  const { label } = await request.json();
  const text = (label || '').trim();
  if (!text) return reply({ error: 'label required' }, 400);

  const dup = await env.DB.prepare('SELECT id FROM category WHERE lower(label) = lower(?)')
    .bind(text).first();
  if (dup) return reply({ ok: true, id: dup.id, duplicate: true });

  const id = await nextId(env, 'category', 'c');
  await env.DB.prepare('INSERT INTO category (id, label, added_live) VALUES (?, ?, 1)')
    .bind(id, text).run();
  return reply({ ok: true, id, label: text });
}

async function addAttendee(request, env) {
  const { name } = await request.json();
  const text = (name || '').trim();
  if (!text) return reply({ error: 'name required' }, 400);
  const id = await nextId(env, 'attendee', 'p');
  await env.DB.prepare('INSERT INTO attendee (id, name) VALUES (?, ?)').bind(id, text).run();
  return reply({ ok: true, id, name: text });
}

async function setState(request, env) {
  const body = await request.json();
  if (typeof body.currentTalk === 'string') {
    await env.DB.prepare(
      'INSERT INTO setting (key, value) VALUES (\'current_talk\', ?) ' +
      'ON CONFLICT (key) DO UPDATE SET value = excluded.value').bind(body.currentTalk).run();
  }
  if (typeof body.frozen === 'boolean') {
    await env.DB.prepare(
      'INSERT INTO setting (key, value) VALUES (\'state\', ?) ' +
      'ON CONFLICT (key) DO UPDATE SET value = excluded.value')
      .bind(body.frozen ? 'frozen' : 'open').run();
  }
  return reply(Object.assign({ ok: true }, await settings(env)));
}

/* The seam between the ephemeral half and the permanent one. This JSON is
 * exactly what build.py reads from content/workshop.json — nothing reshapes it
 * on the way in. Only people who actually voted appear; a roster entry that
 * never voted is not a node.
 *
 * Public once frozen, so workshop.html can render the moment you hit Freeze,
 * without waiting for a commit and a CI run. */
async function exportJson(env) {
  const set = await settings(env);
  const people = await env.DB.prepare(
    'SELECT a.id, a.name, a.consent FROM attendee a ' +
    'WHERE a.active = 1 AND EXISTS (SELECT 1 FROM vote v WHERE v.person_id = a.id) ' +
    'ORDER BY a.id').all();
  const cats = await env.DB.prepare(
    'SELECT c.id, c.label, c.added_live FROM category c ' +
    'WHERE EXISTS (SELECT 1 FROM vote v WHERE v.category_id = c.id) ' +
    'ORDER BY c.added_live, c.created_at, c.id').all();
  const votes = await env.DB.prepare(
    'SELECT person_id, category_id FROM vote ORDER BY person_id, category_id').all();

  return {
    workshop: set.workshop_name || 'Workshop',
    date: set.workshop_date || new Date().toISOString().slice(0, 10),
    frozen_at: new Date().toISOString(),
    state: set.state || 'open',
    people: people.results.map(p => ({ id: p.id, name: p.name, consent: !!p.consent })),
    categories: cats.results.map(c => ({ id: c.id, label: c.label, live: !!c.added_live })),
    votes: votes.results.map(v => [v.person_id, v.category_id])
  };
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
      /* Export is public once frozen — that is what lets the published page
         go live on a click instead of on a deploy. */
      if (path === '/export' && request.method === 'GET') {
        const data = await exportJson(env);
        if (data.state !== 'frozen' && !admin) return reply({ error: 'not frozen' }, 403, head);
        return reply(data, 200, head);
      }

      if (!join) return reply({ error: 'bad join code' }, 401, head);

      if (path === '/bootstrap' && request.method === 'GET') {
        return reply(await bootstrap(request, env, url), 200, head);
      }
      if (path === '/vote' && request.method === 'POST') {
        return withCors(await castVote(request, env), head);
      }
      if (path === '/consent' && request.method === 'POST') {
        return withCors(await setConsent(request, env), head);
      }

      if (!admin) return reply({ error: 'admin token required' }, 403, head);

      if (path === '/category' && request.method === 'POST') {
        return withCors(await addCategory(request, env), head);
      }
      if (path === '/attendee' && request.method === 'POST') {
        return withCors(await addAttendee(request, env), head);
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
