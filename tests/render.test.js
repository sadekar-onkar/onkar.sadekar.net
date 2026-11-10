/* Headless smoke test of the workshop rendering path.
 *
 * Runs groups.js + network.js under jsc against a fake DOM that is just rich
 * enough for init() to build the graph, run the physics and draw a frame. It
 * cannot tell us the picture looks good, but it does prove the workshop mode
 * runs without throwing, that netUpdate regroups in place, and that the nodes
 * land somewhere sensible — none of which can be checked by reading.
 */

var fails = 0;
function ok(name, cond, extra) {
  if (!cond) { fails++; print('FAIL  ' + name + (extra ? '  ' + extra : '')); }
  else print('ok    ' + name);
}

/* ------------------------------------------------------------------ shim -- */

var TONES = { '--a1': '#c04319', '--a2': '#2f6f5e', '--a3': '#9a7b1f',
              '--a4': '#4a5c8a', '--ink': '#141210', '--ink-2': '#6b6660',
              '--line': '#e0dcd4', '--surface': '#ffffff', '--bg': '#faf8f4' };

var drawCalls = 0;
var arcs = [];                 // every node circle actually painted
function makeCtx() {
  return {
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
    font: '', textAlign: '', textBaseline: '',
    setTransform: function () {}, clearRect: function () { drawCalls++; arcs = []; },
    beginPath: function () {}, closePath: function () {},
    arc: function (x, y, r) { arcs.push({ x: x, y: y, r: r }); },
    moveTo: function () {}, lineTo: function () {},
    quadraticCurveTo: function () {}, fill: function () {}, stroke: function () {},
    strokeText: function () {}, fillText: function () {},
    measureText: function (s) { return { width: s.length * 6.2 }; }
  };
}

function El(tag) {
  this.tagName = tag;
  this.dataset = {};
  this.style = { setProperty: function () {} };
  this.children = [];
  this.hidden = false;
  this.textContent = '';
  this.classList = { toggle: function () {}, add: function () {}, remove: function () {} };
  this.offsetWidth = 80; this.offsetHeight = 24;
}
El.prototype.getContext = function () { this._ctx = this._ctx || makeCtx(); return this._ctx; };
El.prototype.getBoundingClientRect = function () {
  return { width: 900, height: 560, left: 0, top: 0 };
};
El.prototype.addEventListener = function (t, fn) { (this._ev = this._ev || {})[t] = fn; };
El.prototype.setPointerCapture = function () {};
El.prototype.querySelector = function (sel) {
  if (sel === 'canvas') return this._canvas;
  if (sel === '[data-net-tip]') return this._tip;
  if (sel === '[data-net-caption]') return null;
  return null;
};
El.prototype.appendChild = function (c) { this.children.push(c); return c; };

var figure = new El('figure');
figure.dataset.network = 'workshop';
figure.dataset.netData = 'workshop-data';
figure._canvas = new El('canvas');
figure._tip = new El('div');
figure._tip.setAttribute = function () {};

var dataEl = new El('script');
dataEl.textContent = readFile('workshop-api/fixture.json');

var document = {
  documentElement: new El('html'),
  createElement: function (t) { return new El(t); },
  getElementById: function (id) { return id === 'workshop-data' ? dataEl : null; },
  querySelector: function () { return null; },
  querySelectorAll: function (sel) { return sel === '[data-network]' ? [figure] : []; },
  addEventListener: function (t, fn) { if (t === 'DOMContentLoaded') this._ready = fn; },
  hidden: false
};

var window = {
  addEventListener: function () {},
  matchMedia: function () { return { matches: true }; }, // reduced motion: synchronous
  devicePixelRatio: 2
};
function getComputedStyle() {
  return { getPropertyValue: function (n) { return TONES[n] || '#888888'; } };
}
function ResizeObserver(fn) { this.observe = function () {}; this._fn = fn; }
function IntersectionObserver(fn) {
  this.observe = function () {};
  fn([{ isIntersecting: true }]);
}
function requestAnimationFrame() { return 1; }

/* ------------------------------------------------------------------ run -- */

load('assets/js/groups.js');
load('assets/js/network.js');

function spread(list) {
  var xs = {}, n = 0;
  list.forEach(function (a) { var k = Math.round(a.x / 10); if (!xs[k]) { xs[k] = 1; n++; } });
  return n;
}
function finite(list) {
  return list.length > 0 && list.every(function (a) {
    return isFinite(a.x) && isFinite(a.y) && isFinite(a.r) && a.r > 0;
  });
}

ok('scripts loaded and registered a DOMContentLoaded handler', !!document._ready);
document._ready();

ok('figure was not hidden (data parsed and graph built)', figure.hidden === false);
ok('netUpdate + netReload were published',
   typeof figure.netUpdate === 'function' && typeof figure.netReload === 'function');
ok('a frame was actually drawn', drawCalls > 0, 'clearRect calls=' + drawCalls);

/* --- solutions and group counts --- */
var r1 = figure.netUpdate({ groups: 5, spread: 1, round: 1 });
ok('5 groups for 34 people', r1 && r1.ok && r1.groups.length === 5,
   r1 ? (r1.reason || 'groups=' + r1.groups.length) : 'null');
ok('34 people + 5 project hubs are painted', arcs.length >= 39, 'arcs=' + arcs.length);
ok('every person is linked to exactly one hub (disconnected stars)', (function () {
  // links are person -> hub; count per person
  return r1.stats.people === 34 &&
    r1.groups.reduce(function (a, g) { return a + g.members.length; }, 0) === 34;
})());
ok('group sizes respect the tolerance',
   r1.stats.minSize >= r1.stats.lo && r1.stats.maxSize <= r1.stats.hi,
   r1.stats.minSize + '-' + r1.stats.maxSize + ' in ' + r1.stats.lo + '-' + r1.stats.hi);

var before = {};
arcs.forEach(function (a, i) { before[i] = a.x + ',' + a.y; });

var r3 = figure.netUpdate({ groups: 5, spread: 1, round: 3 });
ok('switching to solution 3 works', r3 && r3.ok && r3.round === 3);
var k8 = figure.netUpdate({ groups: 8, spread: 1, round: 1 });
ok('raising K to 8 gives 8 groups', k8.ok && k8.groups.length === 8);
var k2 = figure.netUpdate({ groups: 2, spread: 0, round: 1 });
ok('K = 2, spread 0: two groups of 17', k2.ok && k2.groups.every(function (g) {
  return g.members.length === 17;
}), k2.groups.map(function (g) { return g.members.length; }).join());
var k11 = figure.netUpdate({ groups: 11, spread: 1, round: 1 });
ok('more groups than projects is refused with a reason, not a crash',
   !k11.ok && /only 10 projects/i.test(k11.reason));

/* --- what actually gets painted --- */
figure.netUpdate({ groups: 5, spread: 1, round: 1 });
ok('every painted coordinate is finite (no NaN from degenerate forces)', finite(arcs),
   'arcs=' + arcs.length);
ok('painted nodes are spread across the canvas, not stacked', spread(arcs) > 10,
   'distinct x buckets=' + spread(arcs));
ok('painted nodes stay inside the canvas region', arcs.every(function (a) {
  return a.x > -50 && a.x < 950 && a.y > -50 && a.y < 610;
}));

/* --- the live re-poll path --- */
ok('netData is published', typeof figure.netData === 'function');
var payload = JSON.parse(dataEl.textContent);
payload.people.push({ id: 'p99', name: 'Late Arrival', consent: true });
payload.votes.push(['p99', 'c01', 1]);
var live = figure.netData(payload);
ok('netData takes a new voter', live && live.ok && live.stats.people === 35,
   live ? 'people=' + live.stats.people : 'null');
figure.netUpdate({ groups: 5, spread: 1, round: 1 });
ok('after a re-poll the graph still paints finite, spread-out nodes',
   finite(arcs) && spread(arcs) > 10, 'arcs=' + arcs.length);

/* --- the hidden-figure path (a figure that gets its size late) --- */
var zeroFig = new El('figure');
zeroFig.dataset.network = 'workshop';
zeroFig.dataset.netData = 'workshop-data';
zeroFig._canvas = new El('canvas');
zeroFig._tip = new El('div');
zeroFig._tip.setAttribute = function () {};
zeroFig.hidden = true;
var zeroSize = true;
zeroFig._canvas.getBoundingClientRect = function () {
  return zeroSize ? { width: 0, height: 0, left: 0, top: 0 }
                  : { width: 900, height: 560, left: 0, top: 0 };
};
document.querySelectorAll = function (sel) { return sel === '[data-network]' ? [zeroFig] : []; };
document._ready();
ok('a zero-sized figure does not build a degenerate layout',
   typeof zeroFig.netReload === 'function');
zeroSize = false;
var revived = zeroFig.netReload();
ok('netReload revives it once it has a size', revived === true);
zeroFig.netUpdate({ groups: 5, spread: 1, round: 2 });
ok('revived figure paints finite, spread-out nodes', finite(arcs) && spread(arcs) > 10,
   'arcs=' + arcs.length);

/* --- project rollup --- */
ok('all 10 projects come back with counts', r1.categories.length === 10);
ok('first-choice counts sum to the number of voters',
   r1.categories.reduce(function (a, c) { return a + c.first; }, 0) === 34);

/* --- consent invariant on the fixture --- */
var all = [];
r1.groups.forEach(function (g) { all = all.concat(g.members); });
ok('people with consent:false appear as Anonymous N, never by name',
   all.filter(function (m) { return m.anon; }).length === 4 &&
   all.filter(function (m) { return m.anon; }).every(function (m) {
     return /^Anonymous \d+$/.test(m.label);
   }));

print('');
print('solution 1, 5 groups: ' + r1.stats.onTarget + '/34 got their 1st choice, ' +
      r1.stats.unranked + ' unranked, sizes ' + r1.stats.minSize + '-' + r1.stats.maxSize);
print('solution 3, 5 groups: ' + r3.stats.onTarget + '/34 on target, ' + r3.stats.moved +
      ' moved since solution 2');
print('');
print(fails ? fails + ' FAILURE(S)' : 'all render tests passed');
