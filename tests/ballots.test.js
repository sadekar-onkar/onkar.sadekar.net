/* The admin screen's raw-ballot matrix: people down, projects across.
 *
 * wsadmin.js publishes nothing, so this drives it the way the admin does —
 * a fake DOM, a fake Store, a click on "Show the ballots" — and then reads
 * the table it built. What is being checked is the part that could silently
 * be wrong: which rank lands in which cell, that a non-voter still gets a
 * row, the column totals, and the CSV (quoting included).
 *
 * The Store returns synchronous thenables, so the whole flow runs inline and
 * the assertions do not depend on jsc draining a microtask queue.
 */

var fails = 0;
function ok(name, cond, extra) {
  if (!cond) { fails++; print('FAIL  ' + name + (extra ? '  ' + extra : '')); }
  else print('ok    ' + name);
}

/* ------------------------------------------------------------------ shim -- */

var setInterval = function () { return 1; };
var clearInterval = function () {};

var downloads = [];
var Blob = function (parts) { this.text = parts.join(''); downloads.push(this); };
var URL = { createObjectURL: function (b) { return 'blob:' + b.text.length; },
            revokeObjectURL: function () {} };

function El(tag) {
  this.tagName = tag;
  this.dataset = {};
  this.style = { setProperty: function () {} };
  this.children = [];
  this.hidden = false;
  this.className = '';
  this.title = '';
  this._text = '';
}
Object.defineProperty(El.prototype, 'textContent', {
  get: function () {
    if (this.children.length) {
      return this.children.map(function (c) { return c.textContent; }).join('');
    }
    return this._text;
  },
  /* Assigning textContent drops every child — the real DOM behaviour the
     render path relies on to clear the table between refreshes. */
  set: function (v) { this.children = []; this._text = v === undefined ? '' : String(v); }
});
El.prototype.appendChild = function (c) { this.children.push(c); return c; };
El.prototype.removeChild = function (c) {
  this.children = this.children.filter(function (x) { return x !== c; });
};
El.prototype.setAttribute = function (k, v) { this['attr_' + k] = v; };
El.prototype.addEventListener = function (t, fn) { (this._ev = this._ev || {})[t] = fn; };
El.prototype.click = function () { if (this._ev && this._ev.click) this._ev.click(); };
El.prototype.querySelector = function () { return null; };
El.prototype.querySelectorAll = function () { return []; };
/* Rows of a <table>: thead/tbody/tfoot flattened, as a test wants to read them. */
El.prototype.rows = function () {
  var out = [];
  this.children.forEach(function (sec) {
    sec.children.forEach(function (r) { out.push(r); });
  });
  return out;
};
function cells(row) { return row.children.map(function (c) { return c.textContent; }); }

/* The admin markup build.py emits, as a flat map of selector -> element. */
var root = new El('div');
root.dataset.admin = '';
var nodes = {};
[ '[data-ws-status]', '[data-adm-token-form]', '[data-adm-token-input]',
  '[data-adm-join-input]', '[data-adm-token-error]', '[data-adm-talk-form]',
  '[data-adm-talk-input]', '[data-adm-cat-form]', '[data-adm-cat-input]',
  '[data-adm-person-form]', '[data-adm-person-input]', '[data-adm-groups-form]',
  '[data-adm-groups-input]', '[data-adm-spread-input]', '[data-adm-counts]',
  '[data-adm-voters]', '[data-adm-freeze]', '[data-adm-state]',
  '[data-adm-export]', '[data-adm-export-out]', '[data-adm-export-wrap]',
  '[data-adm-ballots-toggle]', '[data-adm-ballots]', '[data-adm-ballots-table]',
  '[data-adm-ballots-legend]', '[data-adm-ballots-note]', '[data-adm-ballots-csv]'
].forEach(function (sel) { nodes[sel] = new El('div'); });
nodes['[data-adm-ballots]'].hidden = true;
root.querySelector = function (sel) { return nodes[sel] || null; };

var document = {
  documentElement: new El('html'),
  body: new El('body'),
  createElement: function (t) { return new El(t); },
  querySelector: function (sel) { return sel === '[data-admin]' ? root : null; },
  querySelectorAll: function () { return []; },
  addEventListener: function () {},
  activeElement: null,
  hidden: false
};

/* -------------------------------------------------------------- the data -- */

var CATS = [
  { id: 'c01', short: 'P1 · Plants', label: 'Plant-knowledge sharing' },
  { id: 'c02', short: 'P2 · Reputation', label: 'Reputation and gossip' },
  { id: 'c03', short: 'P3 · Health', label: 'Mental health, well-being' },
  { id: 'c04', short: 'P4 · Mobility', label: 'Lifetime mobility' }
];

/* Alice did not vote. Ida's name holds a comma, which the CSV must quote. */
var ROSTER = [
  { id: 'p01', name: 'Alice Arno' },
  { id: 'p02', name: 'Bo Chen' },
  { id: 'p03', name: 'Cem Dal' },
  { id: 'p04', name: 'Ida Ek, Jr' }
];

var VOTES = [
  ['p02', 'c01', 1], ['p02', 'c03', 2], ['p02', 'c04', 3],
  ['p03', 'c03', 1], ['p03', 'c01', 2],
  ['p04', 'c02', 1]
];

function P(value) {
  return { then: function (okFn) {
    var r = okFn ? okFn(value) : value;
    return (r && r.then) ? r : P(r);
  } };
}
function Rejected(err) {
  return { then: function (okFn, badFn) { return P(badFn ? badFn(err) : undefined); } };
}

var exportCalls = 0;
var window = {
  WorkshopStore: {
    available: function () { return true; },
    hasAdmin: function () { return true; },
    joinCode: function () { return 'TEST26'; },
    setAdmin: function () {},
    bootstrap: function () {
      return P({ state: 'open', currentTalk: '', categories: CATS,
                 attendees: ROSTER, rosterSize: ROSTER.length,
                 counts: [{ category_id: 'c01', n: 2, first: 1 }],
                 voterCount: 3, groups: 2, spread: 1 });
    },
    exportData: function () {
      exportCalls++;
      return P({ workshop: 'Test', people: ROSTER.slice(1).map(function (p) {
                   return { id: p.id, name: p.name, consent: true };
                 }),
                 categories: CATS, votes: VOTES });
    },
    setState: function () { return P({}); },
    addCategory: function () { return P({}); },
    addAttendee: function () { return P({}); }
  },
  confirm: function () { return true; },
  addEventListener: function () {}
};

load('assets/js/wsadmin.js');

/* --------------------------------------------------------------- the run -- */

var toggle = nodes['[data-adm-ballots-toggle]'];
var table = nodes['[data-adm-ballots-table]'];

ok('the table is empty until it is asked for', !table.children.length &&
   exportCalls === 0);

toggle.click();

ok('opening it reveals the panel and reads /export',
   nodes['[data-adm-ballots]'].hidden === false && exportCalls === 1);
ok('the toggle says how to close it again',
   toggle.textContent === 'Hide the ballots' &&
   toggle['attr_aria-expanded'] === 'true', toggle.textContent);

var rows = table.rows();
ok('header, one row per person on the roster, two totals rows',
   rows.length === 1 + ROSTER.length + 2, 'got ' + rows.length);

var head = cells(rows[0]);
ok('one column per project, headed by its code',
   head.join('|') === 'Attendee|P1|P2|P3|P4|#', head.join('|'));

var body = {};
rows.slice(1, 1 + ROSTER.length).forEach(function (r) { body[cells(r)[0]] = cells(r); });

ok("a voter's ranks land in the right columns",
   body['Bo Chen'].join('|') === 'Bo Chen|1|·|2|3|3', (body['Bo Chen'] || []).join('|'));
ok('a project nobody on the row ranked is a dot',
   body['Cem Dal'].join('|') === 'Cem Dal|2|·|1|·|2', (body['Cem Dal'] || []).join('|'));
ok('someone who has not voted still gets a row, flagged empty',
   body['Alice Arno'].join('|') === 'Alice Arno|·|·|·|·|' &&
   rows[1 + ROSTER.length - 1].dataset.empty === 'true',
   (body['Alice Arno'] || []).join('|'));
ok('people who have voted sort above those who have not',
   cells(rows[ROSTER.length])[0] === 'Alice Arno', cells(rows[ROSTER.length])[0]);

var first = cells(rows[rows.length - 2]), any = cells(rows[rows.length - 1]);
ok('the 1st-choice row counts first choices per project',
   first.join('|') === '1st|1|1|1|·|', first.join('|'));
ok('the any-rank row counts every mention',
   any.join('|') === 'any|2|1|2|1|', any.join('|'));
ok('first choices sum to the number of people who voted',
   first.slice(1, 5).reduce(function (a, v) { return a + (+v || 0); }, 0) === 3);

var legend = nodes['[data-adm-ballots-legend]'];
ok('every column is spelled out in the legend',
   legend.children.length === CATS.length &&
   legend.children[0].textContent === 'P1 Plant-knowledge sharing',
   legend.children.length ? legend.children[0].textContent : 'none');

ok('the note says how many have ranked',
   /^3 of 4 ranked/.test(nodes['[data-adm-ballots-note]'].textContent),
   nodes['[data-adm-ballots-note]'].textContent);

/* ------------------------------------------------------------------ csv -- */

nodes['[data-adm-ballots-csv]'].click();
ok('the CSV button re-reads the ballots and hands over a file',
   exportCalls === 2 && downloads.length === 1);

var lines = (downloads[0] ? downloads[0].text : '').split('\r\n');
ok('a header row and one row per person, newline-terminated',
   lines.length === 2 + ROSTER.length && lines[lines.length - 1] === '',
   'got ' + lines.length);
ok('the CSV header carries the full short names',
   lines[0] === 'Attendee,P1 · Plants,P2 · Reputation,P3 · Health,' +
                'P4 · Mobility,ranked', lines[0]);
ok('ranks become numbers, unranked becomes an empty cell',
   lines.indexOf('Bo Chen,1,,2,3,3') !== -1, lines[1]);
ok('a name with a comma in it is quoted',
   lines.indexOf('"Ida Ek, Jr",,1,,,1') !== -1, lines[3]);
ok('a non-voter is an empty line of cells',
   lines.indexOf('Alice Arno,,,,,0') !== -1, lines[4]);

/* -------------------------------------------------------------- closing -- */

toggle.click();
ok('closing it hides the panel and stops the poll',
   nodes['[data-adm-ballots]'].hidden === true &&
   toggle.textContent === 'Show the ballots');

var before = exportCalls;
window.WorkshopStore.exportData = function () { return Rejected(new Error('offline')); };
nodes['[data-adm-ballots-csv]'].click();
ok('a failed read reports itself instead of throwing',
   exportCalls === before &&
   /offline/.test(nodes['[data-ws-status]'].textContent),
   nodes['[data-ws-status]'].textContent);

print('');
print(fails ? 'FAILURE: ' + fails + ' ballot test(s) failed' : 'all ballot tests passed');
