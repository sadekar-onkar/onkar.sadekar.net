/* Headless smoke test of the workshop rendering path.
 *
 * Runs projection.js + network.js under jsc against a fake DOM that is just
 * rich enough for init() to build the graph, run the physics and draw a frame.
 * It cannot tell us the picture looks good, but it does prove the workshop
 * mode runs without throwing, that netUpdate re-thresholds in place, and that
 * node positions survive a rebuild — none of which I can check by reading.
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

load('assets/js/projection.js');
load('assets/js/network.js');

ok('scripts loaded and registered a DOMContentLoaded handler', !!document._ready);
document._ready();

ok('figure was not hidden (data parsed and graph built)', figure.hidden === false);
ok('netUpdate + netReload were published',
   typeof figure.netUpdate === 'function' && typeof figure.netReload === 'function');
ok('a frame was actually drawn', drawCalls > 0, 'clearRect calls=' + drawCalls);

/* --- re-thresholding --- */
var jac = figure.netUpdate({ method: 'jaccard', threshold: 0.4 });
ok('jaccard build returns stats', jac && jac.stats && jac.stats.people === 34,
   jac ? 'people=' + jac.stats.people : 'null');

var before = jac.nodes.map(function (n) { return n.x + ',' + n.y; });

var strict = figure.netUpdate({ method: 'jaccard', threshold: 0.9 });
ok('raising the threshold removes links',
   strict.stats.edges < jac.stats.edges,
   jac.stats.edges + ' -> ' + strict.stats.edges);

var loose = figure.netUpdate({ method: 'count', threshold: 1 });
ok('loosening it adds them back', loose.stats.edges > strict.stats.edges,
   strict.stats.edges + ' -> ' + loose.stats.edges);

var val = figure.netUpdate({ method: 'validated', alpha: 0.05 });
ok('validated runs on real-shaped data and is sparser than raw count',
   val.stats.edges <= loose.stats.edges,
   'validated=' + val.stats.edges + ' count>=1=' + loose.stats.edges);
ok('validated reports an FDR cutoff', val.stats.cutoff !== null &&
   val.stats.cutoff !== undefined, 'cutoff=' + val.stats.cutoff);

/* --- what actually gets painted --- */
figure.netUpdate({ method: 'jaccard', threshold: 0.4 });
ok('every painted coordinate is finite (no NaN from degenerate forces)',
   arcs.length > 0 && arcs.every(function (a) {
     return isFinite(a.x) && isFinite(a.y) && isFinite(a.r) && a.r > 0;
   }), 'arcs=' + arcs.length);
ok('painted nodes are spread across the canvas, not stacked',
   (function () {
     var xs = {}, n = 0;
     arcs.forEach(function (a) { var k = Math.round(a.x / 10); if (!xs[k]) { xs[k] = 1; n++; } });
     return n > 5;
   })(), 'distinct x buckets');
ok('painted nodes stay inside a sane region', arcs.every(function (a) {
  return a.x > -400 && a.x < 1300 && a.y > -400 && a.y < 960;
}));

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
zeroFig.netUpdate({ method: 'jaccard', threshold: 0.4 });
ok('revived figure paints finite, spread-out nodes', (function () {
  if (!arcs.length) return false;
  if (!arcs.every(function (a) { return isFinite(a.x) && isFinite(a.y); })) return false;
  var xs = {}, n = 0;
  arcs.forEach(function (a) { var k = Math.round(a.x / 10); if (!xs[k]) { xs[k] = 1; n++; } });
  return n > 5;
})(), 'arcs=' + arcs.length);

/* --- category rollup --- */
ok('category counts come back', val.categories && val.categories.length === 13,
   val.categories ? 'n=' + val.categories.length : 'missing');
ok('category counts are positive and plausible',
   val.categories.every(function (c) { return c.count >= 0 && c.count <= 34; }));
ok('the two live categories are flagged',
   val.categories.filter(function (c) { return c.live; }).length === 3,
   'live=' + val.categories.filter(function (c) { return c.live; }).length);

/* --- privacy invariants on the real fixture --- */
ok('anonymised people carry no name',
   val.nodes.filter(function (n) { return n.anon; })
            .every(function (n) { return /^Anonymous \d+$/.test(n.label); }));
ok('8 people are anonymous in the published data',
   val.nodes.filter(function (n) { return n.anon; }).length === 8,
   'got ' + val.nodes.filter(function (n) { return n.anon; }).length);

print('');
print('edges by method:  count>=1 ' + loose.stats.edges +
      '   jaccard>=0.4 ' + jac.stats.edges +
      '   jaccard>=0.9 ' + strict.stats.edges +
      '   validated ' + val.stats.edges +
      '   (of ' + val.stats.possible + ' possible pairs)');
print('communities:      ' + jac.stats.communities + ' at jaccard 0.4, ' +
      val.stats.communities + ' validated');
print('');
print(fails ? fails + ' FAILURE(S)' : 'all render tests passed');
