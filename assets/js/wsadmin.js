/* wsadmin.js — the screen Onkar drives the workshop from.
 *
 * The admin token is typed in once and held in sessionStorage. It is never
 * built into the page and never written to localStorage: closing the tab ends
 * the session. All authority is server-side — this file only asks.
 *
 * Live counts live here and deliberately nowhere else. Each project shows
 * "ranked 1st · ranked at all". Putting them on the
 * attendees' phones would bias later voting toward whatever is already
 * winning, which is exactly the artefact this workshop is trying to measure.
 *
 * Needs store.js. Publishes nothing.
 */

(function () {
  'use strict';

  var root = document.querySelector('[data-admin]');
  if (!root || !window.WorkshopStore) return;

  var Store = window.WorkshopStore;
  var POLL_MS = 5000;
  var timer = null;
  var data = null;

  var el = {
    status: root.querySelector('[data-ws-status]'),
    tokenForm: root.querySelector('[data-adm-token-form]'),
    tokenInput: root.querySelector('[data-adm-token-input]'),
    joinInput: root.querySelector('[data-adm-join-input]'),
    tokenError: root.querySelector('[data-adm-token-error]'),
    talkForm: root.querySelector('[data-adm-talk-form]'),
    talkInput: root.querySelector('[data-adm-talk-input]'),
    catForm: root.querySelector('[data-adm-cat-form]'),
    catInput: root.querySelector('[data-adm-cat-input]'),
    personForm: root.querySelector('[data-adm-person-form]'),
    personInput: root.querySelector('[data-adm-person-input]'),
    groupsForm: root.querySelector('[data-adm-groups-form]'),
    groupsInput: root.querySelector('[data-adm-groups-input]'),
    spreadInput: root.querySelector('[data-adm-spread-input]'),
    counts: root.querySelector('[data-adm-counts]'),
    voters: root.querySelector('[data-adm-voters]'),
    freeze: root.querySelector('[data-adm-freeze]'),
    stateLabel: root.querySelector('[data-adm-state]'),
    exportBtn: root.querySelector('[data-adm-export]'),
    ballotsToggle: root.querySelector('[data-adm-ballots-toggle]'),
    ballotsWrap: root.querySelector('[data-adm-ballots]'),
    ballotsTable: root.querySelector('[data-adm-ballots-table]'),
    ballotsLegend: root.querySelector('[data-adm-ballots-legend]'),
    ballotsNote: root.querySelector('[data-adm-ballots-note]'),
    ballotsCsv: root.querySelector('[data-adm-ballots-csv]'),
    exportOut: root.querySelector('[data-adm-export-out]'),
    exportWrap: root.querySelector('[data-adm-export-wrap]')
  };

  function show(name) {
    root.querySelectorAll('[data-adm-screen]').forEach(function (s) {
      s.hidden = s.dataset.admScreen !== name;
    });
  }

  function setStatus(kind, text) {
    if (!el.status) return;
    el.status.textContent = text || '';
    el.status.dataset.kind = kind || '';
    el.status.hidden = !text;
  }

  function flash(text) {
    setStatus('ok', text);
    setTimeout(function () { setStatus('', ''); }, 2500);
  }

  /* ----------------------------------------------------------------- auth -- */

  if (el.tokenForm) {
    el.tokenForm.addEventListener('submit', function (e) {
      e.preventDefault();
      Store.setAdmin((el.tokenInput.value || '').trim());
      /* The admin needs the join code too — every voter endpoint checks it,
         and /bootstrap is how this screen reads the counts. */
      var join = (el.joinInput.value || '').trim();
      if (join) {
        try { localStorage.setItem('ws-join-v1', join); } catch (err) {}
      }
      el.tokenError.hidden = true;
      refresh().then(function () {
        if (data) { show('panel'); startPoll(); }
      });
    });
  }

  /* --------------------------------------------------------------- actions -- */

  function submitter(form, input, action, okMsg) {
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var value = (input.value || '').trim();
      if (!value) return;
      action(value).then(function (res) {
        input.value = '';
        flash(res && res.duplicate ? 'Already on the list' : okMsg);
        refresh();
      }, function (err) {
        setStatus('error', err.message);
      });
    });
  }

  submitter(el.catForm, el.catInput,
    function (v) { return Store.addCategory(v); }, 'Project added');

  if (el.groupsForm) {
    el.groupsForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var groups = parseInt(el.groupsInput.value, 10);
      var spread = parseInt(el.spreadInput.value, 10);
      if (!(groups >= 1) || !(spread >= 0)) return;
      Store.setState({ groups: groups, spread: spread }).then(function () {
        flash(groups + ' groups, sizes ±' + spread + ' — /workshop picks this up within seconds');
        refresh();
      }, function (err) { setStatus('error', err.message); });
    });
  }
  submitter(el.personForm, el.personInput,
    function (v) { return Store.addAttendee(v); }, 'Attendee added');
  submitter(el.talkForm, el.talkInput,
    function (v) { return Store.setState({ currentTalk: v }); }, 'Talk updated');

  if (el.freeze) {
    el.freeze.addEventListener('click', function () {
      var frozen = data && data.state === 'frozen';
      var msg = frozen
        ? 'Re-open voting?'
        : 'Freeze voting? Phones stop accepting votes and the network goes live.';
      if (!window.confirm(msg)) return;
      Store.setState({ frozen: !frozen }).then(function () {
        flash(frozen ? 'Voting re-opened' : 'Voting frozen');
        refresh();
      }, function (err) { setStatus('error', err.message); });
    });
  }

  /* Hand over a real file — the JSON is destined for content/workshop.json,
     and asking someone to select 40 KB out of a textarea on a laptop at the
     end of a long day is how data gets lost. */
  function download(name, text, mime) {
    var blob = new Blob([text], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  if (el.exportBtn) {
    el.exportBtn.addEventListener('click', function () {
      Store.exportData().then(function (json) {
        var text = JSON.stringify(json, null, 2);
        if (el.exportOut) el.exportOut.value = text;
        if (el.exportWrap) el.exportWrap.hidden = false;
        download('workshop.json', text, 'application/json');
        flash('Downloaded workshop.json — ' + json.people.length + ' people, ' +
              json.votes.length + ' rankings');
      }, function (err) { setStatus('error', err.message); });
    });
  }

  /* --------------------------------------------------------------- ballots -- */

  /* The raw matrix: one row per person on the roster, one column per project,
     the cell is where that project sits on that person's ballot.
     `/bootstrap` already carries the roster on every poll, so the rows cost
     nothing extra; the ranks come from `/export`, which is the only endpoint
     that returns ballots. Hence the separate, slower poll, and only while the
     table is actually on screen — see the free-tier note in worker.js. */

  var BALLOT_MS = 15000;
  var ballots = null;          // last /export payload
  var ballotTimer = null;
  var ballotAt = 0;

  function ballotsOpen() { return !!(el.ballotsWrap && !el.ballotsWrap.hidden); }

  /* "P6/7 · Friendship, co-location…" -> "P6/7". The full name goes in the
     legend under the table and in the cell tooltip; ten long headings would
     make the matrix unreadable. */
  function code(cat) {
    var short = cat.short || cat.label || cat.id;
    var cut = short.indexOf('·');
    return (cut > 0 ? short.slice(0, cut) : short).trim() || cat.id;
  }

  /* roster (names) x projects (order) -> ranks */
  function matrix() {
    var cats = (ballots && ballots.categories && ballots.categories.length
                ? ballots.categories
                : (data && data.categories) || []);
    var rank = {};
    ((ballots && ballots.votes) || []).forEach(function (v) {
      (rank[v[0]] = rank[v[0]] || {})[v[1]] = +v[2] || 0;
    });

    /* Everyone active, not just everyone who voted — a blank row is the
       answer to "who still has not ranked anything?". */
    var roster = ((data && data.attendees) || []).slice();
    var seen = {};
    roster.forEach(function (p) { seen[p.id] = true; });
    ((ballots && ballots.people) || []).forEach(function (p) {
      if (!seen[p.id]) { seen[p.id] = true; roster.push(p); }
    });

    var rows = roster.map(function (p) {
      var mine = rank[p.id] || {};
      return {
        id: p.id,
        name: p.name || p.id,
        ranks: cats.map(function (c) { return mine[c.id] || 0; }),
        n: Object.keys(mine).length
      };
    });
    rows.sort(function (a, b) {
      return (b.n > 0) - (a.n > 0) ||
             a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
    return { cats: cats, rows: rows };
  }

  function cell(tag, text, cls) {
    var td = document.createElement(tag);
    if (text !== undefined && text !== null) td.textContent = text;   // untrusted
    if (cls) td.className = cls;
    return td;
  }

  function renderBallots() {
    if (!el.ballotsTable || !ballotsOpen()) return;
    var m = matrix();
    var cats = m.cats, rows = m.rows;

    el.ballotsTable.textContent = '';

    var thead = document.createElement('thead');
    var hr = document.createElement('tr');
    hr.appendChild(cell('th', 'Attendee', 'ws-th-name'));
    cats.forEach(function (c) {
      var th = cell('th', code(c));
      th.title = c.label || c.short || c.id;
      th.scope = 'col';
      hr.appendChild(th);
    });
    hr.appendChild(cell('th', '#', 'ws-th-n'));
    thead.appendChild(hr);
    el.ballotsTable.appendChild(thead);

    var tbody = document.createElement('tbody');
    rows.forEach(function (p) {
      var tr = document.createElement('tr');
      if (!p.n) tr.dataset.empty = 'true';
      tr.appendChild(cell('th', p.name, 'ws-th-name'));
      p.ranks.forEach(function (r, k) {
        var td = cell('td', r ? String(r) : '·');
        td.dataset.rank = r;
        if (r) td.title = p.name + ' ranked ' + (cats[k].short || cats[k].id) +
                          ' at ' + r;
        tr.appendChild(td);
      });
      tr.appendChild(cell('td', p.n || '', 'ws-th-n'));
      tbody.appendChild(tr);
    });
    el.ballotsTable.appendChild(tbody);

    /* Two footers: first choices, then mentions at any rank — the same pair of
       numbers as the bars above, read down the columns instead of across. */
    var firsts = cats.map(function () { return 0; });
    var anys = cats.map(function () { return 0; });
    rows.forEach(function (p) {
      p.ranks.forEach(function (r, k) { if (r) { anys[k]++; if (r === 1) firsts[k]++; } });
    });
    var tfoot = document.createElement('tfoot');
    [['1st', firsts], ['any', anys]].forEach(function (pair) {
      var tr = document.createElement('tr');
      tr.appendChild(cell('th', pair[0], 'ws-th-name'));
      pair[1].forEach(function (n) { tr.appendChild(cell('td', n || '·')); });
      tr.appendChild(cell('td', '', 'ws-th-n'));
      tfoot.appendChild(tr);
    });
    el.ballotsTable.appendChild(tfoot);

    if (el.ballotsLegend) {
      el.ballotsLegend.textContent = '';
      cats.forEach(function (c) {
        var li = document.createElement('li');
        li.appendChild(cell('b', code(c)));
        li.appendChild(cell('span', ' ' + (c.label || c.short || c.id)));
        el.ballotsLegend.appendChild(li);
      });
    }

    noteBallots(rows);
  }

  function noteBallots(rows) {
    if (!el.ballotsNote) return;
    if (!ballots) { el.ballotsNote.textContent = ''; return; }
    var voted = rows.filter(function (p) { return p.n; }).length;
    el.ballotsNote.textContent = voted + ' of ' + rows.length + ' ranked · refreshed ' +
      new Date(ballotAt).toLocaleTimeString() + ' · every ' + (BALLOT_MS / 1000) + 's';
  }

  function fetchBallots() {
    return Store.exportData().then(function (json) {
      ballots = json;
      ballotAt = Date.now();
      renderBallots();
    }, function (err) {
      setStatus('error', 'Could not read the ballots: ' + err.message);
    });
  }

  function startBallotPoll() {
    stopBallotPoll();
    ballotTimer = setInterval(function () {
      if (!document.hidden && ballotsOpen()) fetchBallots();
    }, BALLOT_MS);
  }
  function stopBallotPoll() {
    if (ballotTimer) { clearInterval(ballotTimer); ballotTimer = null; }
  }

  if (el.ballotsToggle) {
    el.ballotsToggle.addEventListener('click', function () {
      var open = !ballotsOpen();
      el.ballotsWrap.hidden = !open;
      el.ballotsToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      el.ballotsToggle.textContent = open ? 'Hide the ballots' : 'Show the ballots';
      if (open) { renderBallots(); fetchBallots(); startBallotPoll(); }
      else { stopBallotPoll(); if (el.ballotsNote) el.ballotsNote.textContent = ''; }
    });
  }

  /* A CSV of the same matrix: ranks, blank where the person did not rank the
     project. Quoted and CRLF so a name with a comma survives Excel. */
  function ballotsCsv() {
    var m = matrix();
    var q = function (v) {
      v = v === null || v === undefined ? '' : String(v);
      return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    };
    var lines = [['Attendee'].concat(m.cats.map(function (c) {
      return c.short || c.label || c.id;
    })).concat(['ranked']).map(q).join(',')];
    m.rows.forEach(function (p) {
      lines.push([p.name].concat(p.ranks.map(function (r) { return r || ''; }))
                 .concat([p.n]).map(q).join(','));
    });
    return lines.join('\r\n') + '\r\n';
  }

  if (el.ballotsCsv) {
    el.ballotsCsv.addEventListener('click', function () {
      /* Always a fresh read, whether or not the table is open. */
      Store.exportData().then(function (json) {
        ballots = json;
        ballotAt = Date.now();
        renderBallots();
        var name = 'ballots-' + new Date().toISOString().slice(0, 10) + '.csv';
        download(name, ballotsCsv(), 'text/csv;charset=utf-8');
        flash('Downloaded ' + name);
      }, function (err) { setStatus('error', err.message); });
    });
  }

  /* --------------------------------------------------------------- display -- */

  function renderCounts() {
    if (!el.counts) return;
    var counts = {}, firsts = {};
    (data.counts || []).forEach(function (c) {
      counts[c.category_id] = c.n;
      firsts[c.category_id] = c.first || 0;
    });
    var cats = (data.categories || []).slice().sort(function (a, b) {
      return (firsts[b.id] || 0) - (firsts[a.id] || 0) ||
             (counts[b.id] || 0) - (counts[a.id] || 0);
    });
    var max = cats.reduce(function (a, c) { return Math.max(a, counts[c.id] || 0); }, 0) || 1;

    el.counts.textContent = '';
    cats.forEach(function (c) {
      var n = counts[c.id] || 0;
      var li = document.createElement('li');
      li.className = 'ws-cat';

      var label = document.createElement('span');
      label.className = 'ws-cat-label';
      label.textContent = c.short || c.label;         // untrusted
      label.title = c.label;
      if (c.added_live) {
        var tag = document.createElement('em');
        tag.textContent = ' live';
        label.appendChild(tag);
      }

      var bar = document.createElement('span');
      bar.className = 'ws-cat-bar';
      bar.style.setProperty('--pct', Math.round(n / max * 100) + '%');
      bar.style.setProperty('--pct1', Math.round((firsts[c.id] || 0) / max * 100) + '%');

      var num = document.createElement('span');
      num.className = 'ws-cat-n';
      num.textContent = (firsts[c.id] || 0) + ' · ' + n;
      num.title = 'ranked 1st · ranked at all';

      li.appendChild(label);
      li.appendChild(bar);
      li.appendChild(num);
      el.counts.appendChild(li);
    });
  }

  function render() {
    if (el.voters) {
      el.voters.textContent = data.voterCount + ' of ' + data.rosterSize + ' have voted';
    }
    if (el.talkInput && document.activeElement !== el.talkInput) {
      el.talkInput.value = data.currentTalk || '';
    }
    if (el.groupsInput && document.activeElement !== el.groupsInput &&
        document.activeElement !== el.spreadInput) {
      el.groupsInput.value = data.groups || 5;
      el.spreadInput.value = data.spread === undefined ? 1 : data.spread;
      el.groupsInput.max = Math.min(10, (data.categories || []).length || 10);
    }
    if (el.stateLabel) {
      el.stateLabel.textContent = data.state === 'frozen' ? 'Frozen' : 'Open';
      el.stateLabel.dataset.state = data.state;
    }
    if (el.freeze) {
      el.freeze.textContent = data.state === 'frozen' ? 'Re-open voting' : 'Freeze and publish';
    }
    renderCounts();
    if (ballotsOpen()) renderBallots();
  }

  function refresh() {
    return Store.bootstrap().then(function (d) {
      data = d;
      if (d.counts === undefined) {
        /* /bootstrap only returns counts to a valid admin token, so their
           absence is how we detect a bad token. */
        Store.setAdmin('');
        el.tokenError.textContent = 'That token was not accepted.';
        el.tokenError.hidden = false;
        data = null;
        show('token');
        stopPoll();
        return;
      }
      // keep a just-flashed confirmation; clear only stale errors
      if (!el.status || el.status.dataset.kind !== 'ok') setStatus('', '');
      render();
    }, function (err) {
      if (err.status === 401) {
        el.tokenError.textContent = 'Join code missing or wrong — enter both.';
        el.tokenError.hidden = false;
        data = null;
        show('token');
        stopPoll();
        return;
      }
      setStatus('offline', 'Cannot reach the server — retrying');
    });
  }

  function startPoll() {
    stopPoll();
    timer = setInterval(function () { if (!document.hidden) refresh(); }, POLL_MS);
  }
  function stopPoll() {
    if (timer) { clearInterval(timer); timer = null; }
    stopBallotPoll();
  }

  /* ------------------------------------------------------------------ boot -- */

  if (!Store.available()) { show('unconfigured'); return; }
  if (Store.hasAdmin() && Store.joinCode()) {
    refresh().then(function () { if (data) { show('panel'); startPoll(); } });
  } else {
    show('token');
  }
})();
