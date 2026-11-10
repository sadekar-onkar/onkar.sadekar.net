/* vote.js — the screen an attendee gets after scanning the QR code.
 *
 * Four states, one at a time: join -> who are you -> ballot -> closed.
 *
 * Every label that reaches the DOM here (attendee names, project labels) was
 * typed by a person — the roster, the admin screen, or another attendee's
 * phone — so it is set with textContent and never innerHTML. Treat it as
 * untrusted.
 *
 * The ballot is a ranking of up to four projects: tapping a project adds it at
 * the next rank, tapping it again removes it, and the arrows reorder. Voting
 * is optimistic: the screen changes the instant it is tapped and the whole
 * ranking goes to the queue in store.js. On a bad link the UI stays responsive
 * and the queue drains later; replacing the ballot whole makes that safe.
 *
 * Needs store.js. Publishes nothing.
 */

(function () {
  'use strict';

  var root = document.querySelector('[data-vote]');
  if (!root || !window.WorkshopStore) return;

  var Store = window.WorkshopStore;
  /* Only a freeze or a new "current talk" banner needs picking up; nothing
     else changes under a voter. 30s keeps forty phones well inside the free
     tier for a week. */
  var POLL_MS = 30000;

  var el = {
    status: root.querySelector('[data-ws-status]'),
    joinForm: root.querySelector('[data-ws-join-form]'),
    joinInput: root.querySelector('[data-ws-join-input]'),
    joinError: root.querySelector('[data-ws-join-error]'),
    search: root.querySelector('[data-ws-search]'),
    roster: root.querySelector('[data-ws-roster]'),
    addNameForm: root.querySelector('[data-ws-addname-form]'),
    addNameInput: root.querySelector('[data-ws-addname-input]'),
    talk: root.querySelector('[data-ws-talk]'),
    ranking: root.querySelector('[data-ws-ranking]'),
    chips: root.querySelector('[data-ws-projects]'),
    me: root.querySelector('[data-ws-me]'),
    tally: root.querySelector('[data-ws-tally]'),
    change: root.querySelector('[data-ws-change]')
  };

  var state = {
    screen: null,
    data: null,
    ranking: [],       // category ids, favourite first
    edits: 0,          // bumped on every local change; see apply()
    filter: '',
    timer: null
  };

  /* ---------------------------------------------------------------- chrome -- */

  function show(name) {
    state.screen = name;
    root.querySelectorAll('[data-ws-screen]').forEach(function (s) {
      s.hidden = s.dataset.wsScreen !== name;
    });
  }

  function setStatus(kind, text) {
    if (!el.status) return;
    el.status.textContent = text || '';
    el.status.dataset.kind = kind || '';
    el.status.hidden = !text;
  }

  function refreshStatus() {
    var n = Store.pending();
    if (n) setStatus('pending', n + (n === 1 ? ' vote waiting to send' : ' votes waiting to send'));
    else if (!navigator.onLine) setStatus('offline', 'Offline — your votes are saved on this phone');
    else setStatus('', '');
  }

  Store.on(function (event, detail) {
    if (event === 'pending' || event === 'flushed') refreshStatus();
    if (event === 'offline') setStatus('offline', 'Cannot reach the server — retrying');
    if (event === 'rejected') setStatus('error', detail.error);
  });
  window.addEventListener('online', refreshStatus);
  window.addEventListener('offline', refreshStatus);

  /* ------------------------------------------------------------------ join -- */

  if (el.joinForm) {
    el.joinForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var code = (el.joinInput.value || '').trim();
      if (!code) return;
      el.joinError.hidden = true;
      setStatus('pending', 'Checking…');
      Store.join(code).then(function (data) {
        setStatus('', '');
        apply(data);
      }, function (err) {
        setStatus('', '');
        el.joinError.textContent = err.status === 401
          ? 'That code is not right. Check the slide.'
          : 'Could not reach the server. Check your connection.';
        el.joinError.hidden = false;
      });
    });
  }

  /* ------------------------------------------------------------- who are you -- */

  function renderRoster() {
    if (!el.roster) return;
    var q = state.filter.toLowerCase();
    var people = (state.data.attendees || []).filter(function (p) {
      return !q || p.name.toLowerCase().indexOf(q) !== -1;
    });

    el.roster.textContent = '';
    if (!people.length) {
      var li = document.createElement('li');
      li.className = 'ws-roster-empty';
      li.textContent = state.filter
        ? 'No one by that name — add yourself below.'
        : 'No names yet — add yourself below.';
      el.roster.appendChild(li);
      return;
    }

    people.forEach(function (p) {
      var li = document.createElement('li');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ws-person';
      btn.textContent = p.name;          // untrusted: never innerHTML
      btn.addEventListener('click', function () {
        Store.setPerson(p.id);
        refresh();
      });
      li.appendChild(btn);
      el.roster.appendChild(li);
    });
  }

  if (el.search) {
    el.search.addEventListener('input', function () {
      state.filter = el.search.value || '';
      renderRoster();
    });
  }

  if (el.change) {
    el.change.addEventListener('click', function () {
      /* Deliberately does NOT clear the queue — pending votes still belong to
         the person who cast them and must still be delivered. */
      Store.setPerson('');
      state.filter = '';
      if (el.search) el.search.value = '';
      refresh();
    });
  }

  /* Not on the roster? Add yourself. The server de-dupes on name, so someone
     who was in fact already listed is just handed back their own id. */
  if (el.addNameForm) {
    el.addNameForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = (el.addNameInput.value || '').trim();
      if (!name) return;
      setStatus('pending', 'Adding you…');
      Store.addAttendee(name).then(function (res) {
        setStatus('', '');
        el.addNameInput.value = '';
        Store.setPerson(res.id);
        refresh();
      }, function (err) {
        setStatus('error', err.message || 'Could not add that. Try again.');
      });
    });
  }

  /* ---------------------------------------------------------------- ballot -- */

  var ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th'];

  function maxRanks() { return (state.data && state.data.maxRanks) || 4; }

  function catById(id) {
    return (state.data.categories || []).filter(function (c) { return c.id === id; })[0];
  }

  /* Every change sends the whole ranking. Optimistic: the screen redraws at
     once and the queue in store.js makes sure the write lands. */
  function commit() {
    state.edits++;
    renderBallot();
    Store.ballot(state.ranking).then(refreshStatus, refreshStatus);
  }

  function toggle(id) {
    var i = state.ranking.indexOf(id);
    if (i !== -1) state.ranking.splice(i, 1);
    else if (state.ranking.length < maxRanks()) state.ranking.push(id);
    else {
      setStatus('error', 'You have ranked ' + maxRanks() + ' already — remove one first.');
      setTimeout(refreshStatus, 2500);
      return;
    }
    commit();
  }

  function move(i, by) {
    var j = i + by;
    if (j < 0 || j >= state.ranking.length) return;
    var t = state.ranking[i];
    state.ranking[i] = state.ranking[j];
    state.ranking[j] = t;
    commit();
  }

  function smallBtn(text, label, fn, disabled) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'ws-rank-btn';
    b.textContent = text;
    b.setAttribute('aria-label', label);
    b.disabled = !!disabled;
    b.addEventListener('click', fn);
    return b;
  }

  /* "Your ranking": the picks in order, each movable and removable. */
  function renderRanking() {
    if (!el.ranking) return;
    el.ranking.textContent = '';
    if (!state.ranking.length) {
      var empty = document.createElement('li');
      empty.className = 'ws-rank-empty';
      empty.textContent = 'Nothing yet — tap a project below. Your first tap is your favourite.';
      el.ranking.appendChild(empty);
      return;
    }
    state.ranking.forEach(function (id, i) {
      var c = catById(id);
      if (!c) return;
      var li = document.createElement('li');
      li.className = 'ws-rank-item';
      var n = document.createElement('span');
      n.className = 'ws-rank-n';
      n.textContent = ORD[i];
      var label = document.createElement('span');
      label.className = 'ws-rank-label';
      label.textContent = c.short || c.label;            // untrusted: never innerHTML
      var tools = document.createElement('span');
      tools.className = 'ws-rank-tools';
      tools.appendChild(smallBtn('↑', 'Move up', function () { move(i, -1); }, i === 0));
      tools.appendChild(smallBtn('↓', 'Move down', function () { move(i, 1); },
                                 i === state.ranking.length - 1));
      tools.appendChild(smallBtn('×', 'Remove', function () { toggle(id); }));
      li.appendChild(n);
      li.appendChild(label);
      li.appendChild(tools);
      el.ranking.appendChild(li);
    });
  }

  /* The projects themselves: tap to add at the next rank, tap again to drop. */
  function renderProjects() {
    if (!el.chips) return;
    var cats = state.data.categories || [];
    var full = state.ranking.length >= maxRanks();
    el.chips.textContent = '';

    cats.forEach(function (c) {
      var at = state.ranking.indexOf(c.id);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ws-project';
      btn.dataset.on = at !== -1 ? 'true' : 'false';
      btn.dataset.full = full && at === -1 ? 'true' : 'false';
      btn.setAttribute('aria-pressed', at !== -1 ? 'true' : 'false');

      var head = document.createElement('span');
      head.className = 'ws-project-head';
      var short = document.createElement('b');
      short.textContent = c.short || c.label;             // untrusted: never innerHTML
      head.appendChild(short);
      if (at !== -1) {
        var badge = document.createElement('span');
        badge.className = 'ws-project-rank';
        badge.textContent = ORD[at];
        head.appendChild(badge);
      }
      btn.appendChild(head);

      if (c.short && c.label && c.label !== c.short) {
        var title = document.createElement('span');
        title.className = 'ws-project-title';
        title.textContent = c.label;
        btn.appendChild(title);
      }
      if (c.description) {
        var d = document.createElement('span');
        d.className = 'ws-project-desc';
        d.textContent = c.description;
        btn.appendChild(d);
      }

      btn.addEventListener('click', function () { toggle(c.id); });
      el.chips.appendChild(btn);
    });
  }

  function renderTally() {
    if (!el.tally) return;
    var n = state.ranking.length, max = maxRanks();
    el.tally.textContent = n === 0
      ? 'Rank up to ' + max + ' projects. Fewer is fine.'
      : n + ' of ' + max + ' ranked · saved automatically';
  }

  function renderBallot() {
    renderRanking();
    renderProjects();
    renderTally();
  }

  /* --------------------------------------------------------------- refresh -- */

  /* Rendering is driven entirely by a /bootstrap payload, so a poll that finds
     a new category, a new current talk, or a freeze redraws the right screen
     without any special-case transition code. */
  function apply(data, editsAtRequest) {
    state.data = data;

    if (data.state === 'frozen') { show('closed'); stopPoll(); return; }

    if (!Store.person()) {
      renderRoster();
      show('who');
      return;
    }

    var me = (data.attendees || []).filter(function (p) {
      return p.id === Store.person();
    })[0];
    if (!me) {                            // removed from the roster
      Store.setPerson('');
      renderRoster();
      show('who');
      return;
    }

    /* Server state wins on load, but never clobber a ballot still queued on
       this phone — it is newer than anything /bootstrap can know about. */
    var queued = Store.queued();
    var known = {};
    (data.categories || []).forEach(function (c) { known[c.id] = true; });
    /* A response to a request sent BEFORE the latest tap describes an older
       ballot, even once the queue has drained — keep what is on screen. */
    var stale = editsAtRequest !== undefined && editsAtRequest !== state.edits;
    var source = stale ? state.ranking : (queued || data.mine || []);
    state.ranking = source.filter(function (id) { return known[id]; });

    if (el.me) el.me.textContent = me.name;
    if (el.talk) {
      el.talk.textContent = data.currentTalk || '';
      el.talk.hidden = !data.currentTalk;
    }
    renderBallot();
    show('ballot');
  }

  function refresh() {
    var at = state.edits;
    return Store.bootstrap().then(function (data) { apply(data, at); }, function (err) {
      if (err.status === 401) { show('join'); return; }
      setStatus('offline', 'Cannot reach the server — retrying');
    });
  }

  function startPoll() {
    stopPoll();
    state.timer = setInterval(function () {
      if (document.hidden) return;        // no point polling a backgrounded tab
      refresh();
    }, POLL_MS);
  }
  function stopPoll() {
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && state.screen !== 'closed') refresh();
  });

  /* ------------------------------------------------------------------ boot -- */

  if (!Store.available()) {
    show('unconfigured');
    return;
  }
  if (!Store.joinCode()) {
    show('join');
  } else {
    refresh();
  }
  startPoll();
  refreshStatus();
  Store.flush();
})();
