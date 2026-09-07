/* store.js — everything that talks to the outside world.
 *
 * The whole point of this file is that it is the ONLY file that knows a server
 * exists. Swap the provider (Cloudflare Worker, Supabase, anything that speaks
 * the same handful of endpoints) and nothing else on the site changes.
 *
 * Plain fetch, no SDK, no CDN script — the site's zero-third-party-request rule
 * survives, and the published network never loads this file at all.
 *
 * The offline queue is the part that matters on conference wifi. A vote is an
 * upsert keyed on (person, category), so replaying a queued write can never
 * double-count; and because only the LAST state of each pair is kept, toggling
 * a chip on-off-on while offline sends one request, not three.
 *
 * Publishes window.WorkshopStore.
 */

(function () {
  'use strict';

  var K = {
    join: 'ws-join-v1',
    person: 'ws-person-v1',
    queue: 'ws-queue-v1',
    admin: 'ws-admin-v1'   // sessionStorage only, never localStorage
  };

  /* Storage can throw outright in private mode or when site data is blocked,
     so every access is guarded and the caller always gets a usable default. */
  function lsGet(k, fallback) {
    try { var v = localStorage.getItem(k); return v === null ? fallback : v; }
    catch (e) { return fallback; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, v); } catch (e) { /* nothing we can do */ }
  }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  var base = '';
  var listeners = [];

  function emit(event, detail) {
    listeners.forEach(function (fn) { fn(event, detail); });
  }

  function headers(extra) {
    var h = { 'content-type': 'application/json' };
    var j = lsGet(K.join, '');
    if (j) h['x-join'] = j;
    var a = '';
    try { a = sessionStorage.getItem(K.admin) || ''; } catch (e) {}
    if (a) h['x-admin'] = a;
    for (var k in (extra || {})) h[k] = extra[k];
    return h;
  }

  function request(method, path, body) {
    if (!base) return Promise.reject(new Error('no API configured'));
    return fetch(base + path, {
      method: method,
      headers: headers(),
      body: body === undefined ? undefined : JSON.stringify(body),
      // The join code is in a header, not a cookie; keep credentials out of it.
      credentials: 'omit',
      cache: 'no-store'
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var err = new Error(data.error || ('HTTP ' + res.status));
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  /* ------------------------------------------------------------- identity -- */

  function joinCode() { return lsGet(K.join, ''); }
  function person() { return lsGet(K.person, ''); }

  /* ---------------------------------------------------------------- queue -- */

  function readQueue() {
    try { return JSON.parse(lsGet(K.queue, '[]')) || []; }
    catch (e) { return []; }
  }
  function writeQueue(q) { lsSet(K.queue, JSON.stringify(q)); }

  /* Last write wins per (person, category) — see the header note. Every entry
     carries a unique seq so the flush loop can remove exactly the row it sent:
     if the user re-toggles the same chip while its write is in flight, the
     replacement gets a new seq and survives, and the stale one is dropped
     without ever removing the wrong entry or spinning on it.

     Seeded from whatever survived in storage, because a reload must not restart
     the counter at 0 and start colliding with entries queued before it. */
  var seq = readQueue().reduce(function (a, x) { return Math.max(a, x.seq || 0); }, 0);

  function enqueue(item) {
    var q = readQueue().filter(function (x) {
      return !(x.personId === item.personId && x.categoryId === item.categoryId);
    });
    item.seq = ++seq;
    q.push(item);
    writeQueue(q);
    emit('pending', q.length);
  }

  function drop(id) {
    writeQueue(readQueue().filter(function (x) { return x.seq !== id; }));
  }

  var flushing = false;

  function flush() {
    if (flushing) return Promise.resolve(0);
    var q = readQueue();
    if (!q.length) return Promise.resolve(0);
    flushing = true;

    /* Serial, not Promise.all: a flaky link handles one small request at a
       time far better than a burst, and a failure mid-way must leave the rest
       of the queue intact rather than losing it. */
    var sent = 0;
    function next() {
      var pending = readQueue();
      if (!pending.length) return Promise.resolve();
      var item = pending[0];
      return request('POST', '/vote', {
        personId: item.personId, categoryId: item.categoryId, on: item.on
      }).then(function () {
        drop(item.seq);
        sent++;
        emit('pending', readQueue().length);
        return next();
      }, function (err) {
        /* A rejection the server will never accept (closed voting, unknown id)
           must be dropped, or the queue jams forever retrying it. Network
           errors have no status and are kept for the next attempt. */
        if (err.status && err.status !== 429 && err.status < 500) {
          drop(item.seq);
          emit('rejected', { item: item, error: err.message });
          return next();
        }
        throw err;
      });
    }

    return next().then(function () {
      flushing = false;
      emit('flushed', sent);
      return sent;
    }, function (err) {
      flushing = false;
      emit('offline', err.message);
      return sent;
    });
  }

  /* ------------------------------------------------------------------ api -- */

  var Store = {
    configure: function (opts) {
      base = (opts.base || '').replace(/\/+$/, '');
      return Store;
    },

    available: function () { return !!base; },
    joinCode: joinCode,
    person: person,
    pending: function () { return readQueue().length; },

    /* What this phone has written but not yet delivered, as
       {categoryId: on}. The ballot needs it to avoid letting a /bootstrap
       response overwrite newer local choices. Exposed so callers never have to
       know the storage key. */
    queued: function () {
      var out = {};
      readQueue().forEach(function (q) { out[q.categoryId] = q.on; });
      return out;
    },

    on: function (fn) { listeners.push(fn); return Store; },

    /* Verifying the code IS the bootstrap call — there is no separate login. */
    join: function (code) {
      lsSet(K.join, (code || '').trim());
      return Store.bootstrap().catch(function (err) {
        if (err.status === 401) lsDel(K.join);
        throw err;
      });
    },

    leave: function () { lsDel(K.join); lsDel(K.person); lsDel(K.queue); },

    setPerson: function (id) { lsSet(K.person, id || ''); },

    bootstrap: function () {
      var p = person();
      return request('GET', '/bootstrap' + (p ? '?person=' + encodeURIComponent(p) : ''));
    },

    /* Optimistic: queue first, flush immediately. The caller updates the UI
       without waiting, and the queue guarantees the write eventually lands. */
    vote: function (categoryId, on) {
      var p = person();
      if (!p) return Promise.reject(new Error('no person selected'));
      enqueue({ personId: p, categoryId: categoryId, on: !!on });
      return flush();
    },

    flush: flush,

    /* --- self-service: a topic or a walk-in name, on the join code alone --- */
    addCategory: function (label) { return request('POST', '/category', { label: label }); },
    addAttendee: function (name) { return request('POST', '/attendee', { name: name }); },

    /* --- admin --- */
    setAdmin: function (token) {
      try {
        if (token) sessionStorage.setItem(K.admin, token);
        else sessionStorage.removeItem(K.admin);
      } catch (e) {}
    },
    hasAdmin: function () {
      try { return !!sessionStorage.getItem(K.admin); } catch (e) { return false; }
    },
    setState: function (patch) { return request('POST', '/state', patch); },
    exportData: function () { return request('GET', '/export'); }
  };

  /* Drain the queue whenever the network or the tab comes back. */
  window.addEventListener('online', function () { flush(); });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) flush();
  });

  /* Read the endpoint from the page. build.py writes this from the
     `workshop:` block in content/site.md, so the URL is configuration, not code. */
  var meta = document.querySelector('meta[name="workshop-api"]');
  if (meta && meta.content) Store.configure({ base: meta.content });

  window.WorkshopStore = Store;
})();
