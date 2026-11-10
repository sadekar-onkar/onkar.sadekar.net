/* workshop.js — the controls and readouts around the published groups.
 *
 * Two jobs.
 *
 * 1. Getting the data. Once content/workshop.json is committed it is already in
 *    the page: build.py inlines it at build time and this file makes no network
 *    call at all. Before that — during the workshop and in the window before
 *    the commit — there is no baked data, so if an API is configured this polls
 *    /export and regroups on screen as ballots come in, until voting is
 *    frozen. /export takes the join code before the freeze and is world-public
 *    after it.
 *
 * 2. The controls. Which of the four solutions (1st choices ... 4th choices),
 *    how many groups, and how far group sizes may stray from an even split.
 *    The admin's settings are the starting point; anything changed here is
 *    local to this browser tab.
 *
 * Every label written to the DOM came from a person (names, project titles),
 * so it goes in with textContent, never innerHTML.
 *
 * Needs groups.js and network.js (and store.js only for the live poll).
 */

(function () {
  'use strict';

  var root = document.querySelector('[data-workshop]');
  if (!root) return;

  var figure = root.querySelector('[data-network="workshop"]');
  var holder = document.getElementById('workshop-data');
  if (!figure || !holder) return;

  var page = root.closest ? (root.closest('.section') || document) : document;
  var el = {
    rounds: root.querySelectorAll('[data-ws-round]'),
    steps: root.querySelectorAll('[data-ws-step]'),
    groupsOut: root.querySelector('[data-ws-groups-out]'),
    spreadOut: root.querySelector('[data-ws-spread-out]'),
    stats: root.querySelector('[data-ws-stats]'),
    empty: root.querySelector('[data-ws-empty]'),
    note: root.querySelector('[data-ws-note]'),
    groups: page.querySelector('[data-ws-groups]'),
    cats: page.querySelector('[data-ws-cats]')
  };

  var ORD = ['', '1st', '2nd', '3rd', '4th'];
  var MAX_GROUPS = 10;
  var opts = { groups: 5, spread: 1, round: 1 };
  /* Until someone touches a control, follow the admin's numbers as they
     arrive with each live poll. After that, this tab is exploring. */
  var touched = { groups: false, spread: false };

  function node(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function readData() {
    try { return JSON.parse(holder.textContent || '{}') || {}; } catch (e) { return {}; }
  }

  function adopt(d, force) {
    if (!d) return;
    if ((force || !touched.groups) && +d.groups) opts.groups = +d.groups;
    if ((force || !touched.spread) && d.spread !== undefined) opts.spread = +d.spread;
    var nCats = (d.categories || []).length;
    if (nCats) opts.groups = Math.min(opts.groups, Math.min(MAX_GROUPS, nCats));
  }

  /* ---------------------------------------------------------------- render -- */

  function renderControls() {
    if (el.groupsOut) el.groupsOut.textContent = String(opts.groups);
    if (el.spreadOut) el.spreadOut.textContent = String(opts.spread);
    Array.prototype.forEach.call(el.rounds, function (b) {
      var on = +b.dataset.wsRound === opts.round;
      b.dataset.on = String(on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  function renderStats(res) {
    if (!el.stats) return;
    el.stats.textContent = '';
    if (!res.ok) return;
    var s = res.stats;
    var r = res.round;
    var bits = [
      [s.people, s.people === 1 ? 'person' : 'people'],
      [s.groups, s.groups === 1 ? 'group' : 'groups'],
      [s.minSize === s.maxSize ? String(s.minSize) : s.minSize + '–' + s.maxSize, 'per group'],
      [s.onTarget + '/' + s.people, r === 1 ? 'got their 1st choice'
                                            : 'got their ' + ORD[r] + ' (or last) choice'],
      [s.unranked, 'in a project they did not rank']
    ];
    if (r > 1) bits.push([s.moved, 'changed project since solution ' + (r - 1)]);
    bits.forEach(function (b) {
      var d = node('div', 'ws-stat');
      d.appendChild(node('b', '', String(b[0])));
      d.appendChild(node('span', '', b[1]));
      el.stats.appendChild(d);
    });
  }

  function renderNote(res) {
    if (!el.note) return;
    if (!res.ok) { el.note.textContent = res.reason; return; }
    var r = res.round;
    el.note.textContent = (r === 1
      ? 'Solution 1 puts as many people as possible in their favourite project.'
      : 'Solution ' + r + ' aims for everyone’s ' + ORD[r] + ' choice; people who ranked ' +
        'fewer than ' + r + ' projects aim for their last one, so a single pick never moves.') +
      ' Groups hold ' + res.stats.lo + '–' + res.stats.hi + ' people. Thick links are 1st ' +
      'choices; faint ones are projects someone did not rank.';
  }

  function renderGroups(res) {
    if (!el.groups) return;
    el.groups.textContent = '';
    if (!res.ok) return;
    res.groups.forEach(function (g, gi) {
      var card = node('section', 'ws-group');
      card.dataset.tone = String(gi % 5);
      var head = node('header', 'ws-group-head');
      head.appendChild(node('h3', 'ws-group-name', g.project.short));
      head.appendChild(node('span', 'ws-group-n mono',
        g.members.length + (g.members.length === 1 ? ' person' : ' people')));
      card.appendChild(head);
      if (g.project.label && g.project.label !== g.project.short) {
        card.appendChild(node('p', 'ws-group-title', g.project.label));
      }
      var ul = node('ul', 'ws-group-list');
      g.members.forEach(function (m) {
        var li = node('li', 'ws-member');
        li.dataset.rank = String(m.rank);
        li.appendChild(node('span', 'ws-member-name', m.label));
        li.appendChild(node('span', 'ws-member-rank mono', m.rank ? ORD[m.rank] : 'unranked'));
        ul.appendChild(li);
      });
      card.appendChild(ul);
      el.groups.appendChild(card);
    });
  }

  /* Popularity: how often each project was ranked, and how often first. */
  function renderCategories(res) {
    if (!el.cats) return;
    var cats = (res.categories || []).slice().sort(function (a, b) {
      return b.first - a.first || b.count - a.count;
    });
    var max = cats.reduce(function (a, c) { return Math.max(a, c.count); }, 0) || 1;
    el.cats.textContent = '';
    cats.forEach(function (c) {
      var li = node('li', 'ws-cat');
      var label = node('span', 'ws-cat-label', c.short);
      label.title = c.label;
      var bar = node('span', 'ws-cat-bar');
      bar.style.setProperty('--pct', Math.round(c.count / max * 100) + '%');
      bar.style.setProperty('--pct1', Math.round(c.first / max * 100) + '%');
      li.appendChild(label);
      li.appendChild(bar);
      li.appendChild(node('span', 'ws-cat-n', c.first + ' · ' + c.count));
      el.cats.appendChild(li);
    });
  }

  function renderAll(res) {
    if (!res) return;
    renderControls();
    renderStats(res);
    renderNote(res);
    renderGroups(res);
    renderCategories(res);
  }

  function update() {
    if (!figure.netUpdate) return;
    renderAll(figure.netUpdate({ groups: opts.groups, spread: opts.spread, round: opts.round }));
  }

  /* ---------------------------------------------------------------- wiring -- */

  function wire() {
    Array.prototype.forEach.call(el.rounds, function (btn) {
      btn.addEventListener('click', function () {
        opts.round = +btn.dataset.wsRound;
        update();
      });
    });
    Array.prototype.forEach.call(el.steps, function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.dataset.wsStep, by = +btn.dataset.by;
        var nCats = (readData().categories || []).length || MAX_GROUPS;
        var max = key === 'groups' ? Math.min(MAX_GROUPS, nCats) : 5;
        var min = key === 'groups' ? 1 : 0;
        var next = Math.min(max, Math.max(min, opts[key] + by));
        if (next === opts[key]) return;
        opts[key] = next;
        touched[key] = true;
        update();
      });
    });
  }

  function hasData() {
    var d = readData();
    return !!(d.people && d.people.length);
  }

  function boot() {
    if (el.empty) el.empty.hidden = true;
    figure.hidden = false;
    adopt(readData(), true);
    wire();
    /* Deferred scripts run before DOMContentLoaded, but network.js only
       attaches netUpdate in its own DOMContentLoaded handler. Registered
       after that one, this listener fires after it. */
    if (figure.netUpdate) update();
    else document.addEventListener('DOMContentLoaded', update);
  }

  if (hasData()) {
    boot();
    return;
  }

  /* No baked-in data. Either the JSON has not been committed yet, or the
     workshop is happening right now — poll /export and keep regrouping as
     ballots arrive, until voting is frozen. */
  var Store = window.WorkshopStore;
  if (!Store || !Store.available()) {
    if (el.empty) el.empty.hidden = false;
    figure.hidden = true;
    return;
  }

  /* 15s: a projector left open for a week stays far inside the free tier, and
     regrouping more often than that would only make people jump around. */
  var LIVE_MS = 15000;
  var liveTimer = null;
  var started = false;
  var lastSig = '';

  function setEmpty(text) {
    if (!el.empty) return;
    el.empty.hidden = false;
    el.empty.textContent = text;
  }

  function scheduleNext(state) {
    if (liveTimer) { clearTimeout(liveTimer); liveTimer = null; }
    if (state === 'frozen') return;     // the data we have is final; stop polling
    liveTimer = setTimeout(pollLive, LIVE_MS);
  }

  function pollLive() {
    if (liveTimer) { clearTimeout(liveTimer); liveTimer = null; }
    if (document.hidden) { scheduleNext('open'); return; }
    Store.exportData().then(function (payload) {
      var haveVotes = payload && payload.people && payload.people.length;
      if (!haveVotes) {
        if (!started) {
          setEmpty(payload && payload.state === 'frozen'
            ? 'Voting has closed with nothing to show yet.'
            : 'Waiting for the first ballots…');
        }
        scheduleNext(payload && payload.state);
        return;
      }
      /* Only regroup when something actually changed — re-solving identical
         ballots would just restart the physics for nothing. */
      var sig = JSON.stringify([payload.people, payload.votes, payload.categories,
                                payload.groups, payload.spread]);
      holder.textContent = JSON.stringify(payload);
      if (!started) {
        if (figure.netReload && figure.netReload()) {
          boot();
          started = true;
          lastSig = sig;
        } else {
          setEmpty('Could not render the groups.');
        }
      } else if (sig !== lastSig && figure.netData) {
        adopt(payload, false);
        if (figure.netData(payload)) {   // null mid-drag: retry on the next poll
          update();
          lastSig = sig;
        }
      }
      scheduleNext(payload.state);
    }, function (err) {
      if (!started) {
        setEmpty(err && (err.status === 403 || err.status === 401)
          ? 'The results are not published yet. Check back after the workshop.'
          : 'Could not reach the results — retrying.');
      }
      scheduleNext();
    });
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && !started) pollLive();
  });

  setEmpty('Fetching the results…');
  pollLive();
})();
