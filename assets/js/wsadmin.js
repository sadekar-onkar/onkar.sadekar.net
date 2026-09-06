/* wsadmin.js — the screen Onkar drives the workshop from.
 *
 * The admin token is typed in once and held in sessionStorage. It is never
 * built into the page and never written to localStorage: closing the tab ends
 * the session. All authority is server-side — this file only asks.
 *
 * Live counts live here and deliberately nowhere else. Putting them on the
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
    counts: root.querySelector('[data-adm-counts]'),
    voters: root.querySelector('[data-adm-voters]'),
    freeze: root.querySelector('[data-adm-freeze]'),
    stateLabel: root.querySelector('[data-adm-state]'),
    exportBtn: root.querySelector('[data-adm-export]'),
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
    function (v) { return Store.addCategory(v); }, 'Category added');
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

  if (el.exportBtn) {
    el.exportBtn.addEventListener('click', function () {
      Store.exportData().then(function (json) {
        var text = JSON.stringify(json, null, 2);
        if (el.exportOut) el.exportOut.value = text;
        if (el.exportWrap) el.exportWrap.hidden = false;

        /* Hand over a real file — this is destined for content/workshop.json,
           and asking someone to select 40 KB out of a textarea on a laptop at
           the end of a long day is how data gets lost. */
        var blob = new Blob([text], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'workshop.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);

        flash('Downloaded workshop.json — ' + json.people.length + ' people, ' +
              json.votes.length + ' votes');
      }, function (err) { setStatus('error', err.message); });
    });
  }

  /* --------------------------------------------------------------- display -- */

  function renderCounts() {
    if (!el.counts) return;
    var counts = {};
    (data.counts || []).forEach(function (c) { counts[c.category_id] = c.n; });
    var cats = (data.categories || []).slice().sort(function (a, b) {
      return (counts[b.id] || 0) - (counts[a.id] || 0);
    });
    var max = cats.reduce(function (a, c) { return Math.max(a, counts[c.id] || 0); }, 0) || 1;

    el.counts.textContent = '';
    cats.forEach(function (c) {
      var n = counts[c.id] || 0;
      var li = document.createElement('li');
      li.className = 'ws-cat';

      var label = document.createElement('span');
      label.className = 'ws-cat-label';
      label.textContent = c.label;                    // untrusted
      if (c.added_live) {
        var tag = document.createElement('em');
        tag.textContent = ' live';
        label.appendChild(tag);
      }

      var bar = document.createElement('span');
      bar.className = 'ws-cat-bar';
      bar.style.setProperty('--pct', Math.round(n / max * 100) + '%');

      var num = document.createElement('span');
      num.className = 'ws-cat-n';
      num.textContent = String(n);

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
    if (el.stateLabel) {
      el.stateLabel.textContent = data.state === 'frozen' ? 'Frozen' : 'Open';
      el.stateLabel.dataset.state = data.state;
    }
    if (el.freeze) {
      el.freeze.textContent = data.state === 'frozen' ? 'Re-open voting' : 'Freeze and publish';
    }
    renderCounts();
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
      setStatus('', '');
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
  function stopPoll() { if (timer) { clearInterval(timer); timer = null; } }

  /* ------------------------------------------------------------------ boot -- */

  if (!Store.available()) { show('unconfigured'); return; }
  if (Store.hasAdmin() && Store.joinCode()) {
    refresh().then(function () { if (data) { show('panel'); startPoll(); } });
  } else {
    show('token');
  }
})();
