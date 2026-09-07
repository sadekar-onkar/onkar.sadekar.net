/* vote.js — the screen an attendee gets after scanning the QR code.
 *
 * Four states, one at a time: join -> who are you -> ballot -> closed.
 *
 * Every label that reaches the DOM here (attendee names, category labels) was
 * typed by a person — the roster, the admin screen, or another attendee's
 * phone — so it is set with textContent and never innerHTML. Treat it as
 * untrusted.
 *
 * Voting is optimistic: the chip flips the instant it is tapped and the write
 * goes to the queue in store.js. On a bad link the UI stays responsive and the
 * queue drains later; the (person, category) upsert makes that safe.
 *
 * Needs store.js. Publishes nothing.
 */

(function () {
  'use strict';

  var root = document.querySelector('[data-vote]');
  if (!root || !window.WorkshopStore) return;

  var Store = window.WorkshopStore;
  var POLL_MS = 10000;

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
    chips: root.querySelector('[data-ws-chips]'),
    addCatForm: root.querySelector('[data-ws-addcat-form]'),
    addCatInput: root.querySelector('[data-ws-addcat-input]'),
    me: root.querySelector('[data-ws-me]'),
    tally: root.querySelector('[data-ws-tally]'),
    change: root.querySelector('[data-ws-change]')
  };

  var state = {
    screen: null,
    data: null,
    mine: {},          // categoryId -> true
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

  function renderChips() {
    if (!el.chips) return;
    var cats = state.data.categories || [];
    el.chips.textContent = '';

    cats.forEach(function (c) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ws-chip';
      btn.dataset.on = state.mine[c.id] ? 'true' : 'false';
      btn.setAttribute('aria-pressed', state.mine[c.id] ? 'true' : 'false');
      if (c.added_live) btn.dataset.live = 'true';

      var label = document.createElement('span');
      label.textContent = c.label;       // untrusted: never innerHTML
      btn.appendChild(label);

      btn.addEventListener('click', function () {
        var on = !state.mine[c.id];
        if (on) state.mine[c.id] = true; else delete state.mine[c.id];
        btn.dataset.on = on ? 'true' : 'false';
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        renderTally();
        Store.vote(c.id, on).then(refreshStatus, refreshStatus);
      });

      el.chips.appendChild(btn);
    });
  }

  function renderTally() {
    if (!el.tally) return;
    var n = Object.keys(state.mine).length;
    el.tally.textContent = n === 0
      ? 'Nothing picked yet'
      : n + (n === 1 ? ' interest marked' : ' interests marked');
  }

  /* Missing a topic? Add it, and tick it — you almost certainly want it on.
     The poll (or the refresh below) brings the new chip in for everyone. */
  if (el.addCatForm) {
    el.addCatForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var label = (el.addCatInput.value || '').trim();
      if (!label) return;
      setStatus('pending', 'Adding…');
      Store.addCategory(label).then(function (res) {
        setStatus('', '');
        el.addCatInput.value = '';
        if (res && res.id) {
          state.mine[res.id] = true;
          Store.vote(res.id, true).then(refreshStatus, refreshStatus);
        }
        refresh();
      }, function (err) {
        setStatus('error', err.message || 'Could not add that topic. Try again.');
      });
    });
  }

  /* --------------------------------------------------------------- refresh -- */

  /* Rendering is driven entirely by a /bootstrap payload, so a poll that finds
     a new category, a new current talk, or a freeze redraws the right screen
     without any special-case transition code. */
  function apply(data) {
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

    /* Server state wins on load, but never clobber writes still queued on this
       phone — those are newer than anything /bootstrap can know about. */
    var queued = Store.queued();

    state.mine = {};
    (data.mine || []).forEach(function (id) { state.mine[id] = true; });
    Object.keys(queued).forEach(function (id) {
      if (queued[id]) state.mine[id] = true; else delete state.mine[id];
    });

    if (el.me) el.me.textContent = me.name;
    if (el.talk) {
      el.talk.textContent = data.currentTalk || '';
      el.talk.hidden = !data.currentTalk;
    }
    renderChips();
    renderTally();
    show('ballot');
  }

  function refresh() {
    return Store.bootstrap().then(apply, function (err) {
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
