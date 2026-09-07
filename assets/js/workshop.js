/* workshop.js — the controls under the published network.
 *
 * Two jobs.
 *
 * 1. Getting the data. Once content/workshop.json is committed it is already in
 *    the page: build.py inlines it at build time and this file makes no network
 *    call at all. Before that — during the workshop and in the window before
 *    the commit — there is no baked data, so if an API is configured this polls
 *    /export every few seconds and grows the network on screen as votes come
 *    in, until voting is frozen. /export takes the join code before the freeze
 *    and is world-public after it.
 *
 * 2. The threshold controls. A projection drawn at one arbitrary cutoff asks
 *    to be trusted; a projection you can re-threshold shows its own
 *    sensitivity. Dragging from a dense count-based graph to the sparse
 *    statistically validated one, and watching most edges evaporate, is the
 *    honest summary of what a few dozen votes can support.
 *
 * Needs projection.js and network.js (and store.js only for the live poll).
 */

(function () {
  'use strict';

  var root = document.querySelector('[data-workshop]');
  if (!root) return;

  var figure = root.querySelector('[data-network="workshop"]');
  var holder = document.getElementById('workshop-data');
  if (!figure || !holder) return;

  var el = {
    methods: root.querySelectorAll('[data-ws-method]'),
    slider: root.querySelector('[data-ws-threshold]'),
    sliderLabel: root.querySelector('[data-ws-threshold-label]'),
    sliderName: root.querySelector('[data-ws-threshold-name]'),
    stats: root.querySelector('[data-ws-stats]'),
    cats: root.querySelector('[data-ws-cats]'),
    empty: root.querySelector('[data-ws-empty]'),
    note: root.querySelector('[data-ws-note]')
  };

  /* Slider semantics change with the method, so each one carries its own
     scale and formatter rather than sharing one meaningless 0-100 range. */
  var SCALES = {
    count: {
      name: 'Shared categories, at least',
      values: function (stats) {
        var out = [];
        for (var i = 1; i <= Math.max(stats.maxShared, 1); i++) out.push(i);
        return out;
      },
      format: function (v) { return String(v); },
      apply: function (v) { return { threshold: v }; },
      note: 'Raw co-occurrence. Someone who ticked everything links to everyone, ' +
            'so read the hubs with suspicion.'
    },
    jaccard: {
      name: 'Jaccard similarity, at least',
      values: function () {
        var out = [];
        for (var i = 1; i <= 19; i++) out.push(Math.round(i * 5) / 100);
        return out;
      },
      format: function (v) { return v.toFixed(2); },
      apply: function (v) { return { threshold: v }; },
      note: 'Overlap divided by union, so enthusiasm cancels out. A reasonable default.'
    },
    validated: {
      name: 'False discovery rate',
      values: function () { return [0.001, 0.005, 0.01, 0.02, 0.05, 0.1]; },
      format: function (v) { return v < 0.01 ? v.toFixed(3) : v.toFixed(2); },
      apply: function (v) { return { alpha: v }; },
      note: 'Each pair tested against the null that the two chose independently ' +
            '(hypergeometric), with Benjamini-Hochberg correction across all pairs. ' +
            'Few surviving edges is a statement about sample size, not a bug.'
    }
  };

  var method = 'jaccard';
  var scale = null;
  var lastStats = null;

  function fmtPct(x) { return (x * 100).toFixed(1) + '%'; }

  function renderStats(res) {
    if (!res || !el.stats) return;
    var s = res.stats;
    lastStats = s;

    var bits = [
      [s.people, s.people === 1 ? 'person' : 'people'],
      [s.edges, s.edges === 1 ? 'link' : 'links'],
      [fmtPct(s.density), 'of possible'],
      [s.communities, s.communities === 1 ? 'group' : 'groups'],
      [s.isolated, 'unconnected']
    ];
    if (method === 'validated' && s.cutoff >= 0) {
      bits.push([s.cutoff.toExponential(1), 'p cutoff']);
    }

    el.stats.textContent = '';
    bits.forEach(function (b) {
      var d = document.createElement('div');
      d.className = 'ws-stat';
      var n = document.createElement('b');
      n.textContent = String(b[0]);
      var t = document.createElement('span');
      t.textContent = b[1];
      d.appendChild(n);
      d.appendChild(t);
      el.stats.appendChild(d);
    });

    var note = scale ? scale.note : '';

    /* An empty canvas reads as a broken page, so say why it is empty. When the
       smallest p-value in the data cannot clear the rank-1 Benjamini-Hochberg
       bar, no pair could have passed however perfectly two people agreed: the
       ballot was too short to carry that much evidence. That is a fact about
       the study design and worth stating plainly rather than hiding. */
    if (method === 'validated' && s.edges === 0) {
      if (s.minP !== null && s.bar !== null && s.minP > s.bar) {
        note = 'No link survives, and none could: with ' + s.categories +
          ' categories the strongest possible agreement gives p = ' +
          s.minP.toExponential(1) + ', while correcting for ' + s.possible +
          ' pairs demands p < ' + s.bar.toExponential(1) + '. A longer ballot, ' +
          'not more people, is what this test would need. ' + note;
      } else {
        note = 'No pair clears the corrected threshold at this false discovery ' +
          'rate. ' + note;
      }
    }
    if (el.note) el.note.textContent = note;
  }

  /* Aggregate popularity of each category. Safe to publish: it is a count over
     everyone, and says nothing about any individual's ballot. */
  function renderCategories(res) {
    if (!res || !el.cats) return;
    var cats = res.categories.slice().sort(function (a, b) { return b.count - a.count; });
    var max = cats.reduce(function (a, c) { return Math.max(a, c.count); }, 0) || 1;

    el.cats.textContent = '';
    cats.forEach(function (c) {
      var li = document.createElement('li');
      li.className = 'ws-cat';

      var label = document.createElement('span');
      label.className = 'ws-cat-label';
      label.textContent = c.label;              // untrusted, typed by a person
      if (c.live) {
        var tag = document.createElement('em');
        tag.title = 'Added during the workshop';
        tag.textContent = 'live';
        label.appendChild(tag);
      }

      var bar = document.createElement('span');
      bar.className = 'ws-cat-bar';
      bar.style.setProperty('--pct', Math.round(c.count / max * 100) + '%');

      var n = document.createElement('span');
      n.className = 'ws-cat-n';
      n.textContent = String(c.count);

      li.appendChild(label);
      li.appendChild(bar);
      li.appendChild(n);
      el.cats.appendChild(li);
    });
  }

  function update(opts) {
    if (!figure.netUpdate) return;
    var res = figure.netUpdate(opts);
    renderStats(res);
    renderCategories(res);
  }

  function configureSlider(preserve) {
    scale = SCALES[method];
    if (!el.slider) return;
    var values = scale.values(lastStats || { maxShared: 1 });
    el.slider.min = 0;
    el.slider.max = values.length - 1;
    el.slider.step = 1;

    /* Land on a sensible default per method rather than snapping to 0. */
    var want = method === 'count' ? Math.min(1, values.length - 1)
             : method === 'jaccard' ? values.indexOf(0.4)
             : values.indexOf(0.05);
    if (!preserve || el.slider.value === '') {
      el.slider.value = want >= 0 ? want : Math.floor(values.length / 2);
    }
    if (el.sliderName) el.sliderName.textContent = scale.name;
    return values;
  }

  function readSlider() {
    var values = scale.values(lastStats || { maxShared: 1 });
    var v = values[Math.min(+el.slider.value, values.length - 1)];
    if (el.sliderLabel) el.sliderLabel.textContent = scale.format(v);
    return scale.apply(v);
  }

  function wire() {
    Array.prototype.forEach.call(el.methods, function (btn) {
      btn.addEventListener('click', function () {
        method = btn.dataset.wsMethod;
        Array.prototype.forEach.call(el.methods, function (b) {
          b.dataset.on = String(b === btn);
          b.setAttribute('aria-pressed', String(b === btn));
        });
        configureSlider(false);
        update(Object.assign({ method: method }, readSlider()));
      });
    });

    if (el.slider) {
      el.slider.addEventListener('input', function () {
        update(Object.assign({ method: method }, readSlider()));
      });
    }
  }

  function hasData() {
    try {
      var d = JSON.parse(holder.textContent || '{}');
      return !!(d && d.people && d.people.length);
    } catch (e) { return false; }
  }

  function boot() {
    if (el.empty) el.empty.hidden = true;
    figure.hidden = false;
    configureSlider(false);
    wire();
    /* First paint: netUpdate returns the same shape build() does, so the
       readouts populate without a second projection pass. */
    update(Object.assign({ method: method }, readSlider()));
  }

  if (hasData()) {
    boot();
    return;
  }

  /* No baked-in data. Either the JSON has not been committed yet, or the
     workshop is happening right now — poll /export and keep redrawing the
     network as votes arrive, until voting is frozen. */
  var Store = window.WorkshopStore;
  if (!Store || !Store.available()) {
    if (el.empty) el.empty.hidden = false;
    figure.hidden = true;
    return;
  }

  var LIVE_MS = 7000;
  var liveTimer = null;
  var started = false;

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
            : 'Waiting for the first votes…');
        }
        scheduleNext(payload && payload.state);
        return;
      }
      holder.textContent = JSON.stringify(payload);
      if (!started) {
        if (figure.netReload && figure.netReload()) {
          boot();
          started = true;
        } else {
          setEmpty('Could not render the network.');
        }
      } else if (figure.netData) {
        var res = figure.netData(payload);
        if (res) { renderStats(res); renderCategories(res); }
      } else if (figure.netReload && figure.netReload()) {
        update(Object.assign({ method: method }, readSlider()));
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
