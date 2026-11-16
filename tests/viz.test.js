/* Tests for the paper figures (assets/js/viz/), run under jsc.

   The figures draw on a canvas, which cannot be checked here. What can be
   checked is the part where a wrong answer would look perfectly plausible on
   screen: the formulas and models behind the pictures, and that the content
   file, the modules and the data files still agree with each other. */

var models = {};
var PaperViz = { register: function (key, init, extras) { models[key] = extras || {}; models[key]._init = init; }, models: models };

var KEYS = ['explosive', 'overlap', 'gamesel', 'pgg', 'hoi', 'chimps', 'cricket', 'nba', 'hazard', 'tur', 'abp', 'sep'];
KEYS.forEach(function (k) { load('assets/js/viz/' + k + '.js'); });

var fails = 0;
function ok(name, cond, extra) {
  if (!cond) { fails++; print('FAIL  ' + name + (extra ? '  ' + extra : '')); }
  else print('ok    ' + name);
}
function near(a, b, tol) { return Math.abs(a - b) <= tol; }
/* deterministic random numbers, so a statistical check cannot flake */
function rng(seed) { var s = seed >>> 0; return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

/* ---- every module registers, and matches the content file ---- */
KEYS.forEach(function (k) { ok(k + ' registers itself', typeof (models[k] || {})._init === 'function'); });
var pubs = readFile('content/publications.md'), used = [], m, re = /^viz:\s*(\S+)/gm;
while ((m = re.exec(pubs))) used.push(m[1]);
ok('every viz: key in publications.md has a module', used.every(function (k) { return KEYS.indexOf(k) >= 0; }), used.join(' '));
ok('every module is used by a paper', KEYS.every(function (k) { return used.indexOf(k) >= 0; }));
ok('no paper shares a figure with another', used.length === KEYS.length);

/* ---- explosive: the PRL's mean-field solution ---- */
var th = models.explosive.theory;
ok('explosive: tipping point is 1/3 for a = 5 (T = 1.5, S = -0.5)', near(th(5, 0.5).dc, 1 / 3, 1e-12));
ok('explosive: no cooperative state below the tipping point', th(5, 0.3).hi === null);
(function () {
  var d = 0.5, t = th(5, d), c = 6, b = 1, S = -0.5;
  var f = function (r) { return -r * r * c * d + r * (c * d - b - 2 * S) + S; };
  ok('explosive: both branches are roots of the payoff difference', near(f(t.lo), 0, 1e-12) && near(f(t.hi), 0, 1e-12));
  ok('explosive: 0 <= critical mass <= 1/2 <= cooperative state <= 1', t.lo >= 0 && t.lo <= 0.5 && t.hi >= 0.5 && t.hi <= 1);
  var pop = models.explosive.makeModel(600, rng(3)); pop.a = 5; pop.delta = 0.6; pop.seed(0.6); pop.step(600 * 80);
  ok('explosive: simulated players settle near the cooperative branch', near(pop.rho(), th(5, 0.6).hi, 0.08), pop.rho().toFixed(3) + ' vs ' + th(5, 0.6).hi.toFixed(3));
  pop = models.explosive.makeModel(600, rng(4)); pop.a = 5; pop.delta = 0.2; pop.seed(0.6); pop.step(600 * 120);
  ok('explosive: below the tipping point they all defect', pop.rho() === 0, String(pop.rho()));
})();

/* ---- pgg: thresholds quoted in the paper for 2- and 3-player games ---- */
(function () {
  var fixed = models.pgg.fixed, theta = 0.25, d2 = 0.5, d3 = 1.5;
  var r0 = 6 / (3 - theta), r1 = 6 / (3 * d2 * (1 - theta) + 2 * d3 * d3 * theta);
  var has = function (r, x) { return fixed(r, d2, d3, theta).stable.indexOf(x) >= 0; };
  ok('pgg: full defection loses stability at r = 6 / (3 - theta)', has(r0 - 1e-6, 0) && !has(r0 + 1e-6, 0));
  ok('pgg: full cooperation gains stability at r = 6 / (3 d2 (1 - theta) + 2 d3^2 theta)', !has(r1 - 1e-6, 1) && has(r1 + 1e-6, 1));
  var mixed = fixed(2.18, 0.2, 3.5, 0.1);
  ok('pgg: the default shows coexistence and full cooperation both stable',
     mixed.stable.length === 2 && mixed.stable.indexOf(1) >= 0 && mixed.stable.some(function (x) { return x > 0 && x < 1; }));
  var single = fixed(2.5, 0.5, 0.5, 0);      /* one order only: rho* = ((l/r)^(1/(l-1)) - 1) / (delta - 1) */
  ok('pgg: single-order interior point matches the closed form', near(single.stable[0], (2 / 2.5 - 1) / (0.5 - 1), 1e-12));
})();

/* ---- tur: the closed form against the cumulants it was derived from ---- */
(function () {
  var T = models.tur, worst = 0;
  [[6, 0.6, 1], [5, 1, 0.4], [2, 0.5, 0.9], [9, 0.2, 0.3]].forEach(function (p) {
    [true, false].forEach(function (fermi) {
      var n = function (t) { return 1 / (Math.exp(1 / t) + (fermi ? 1 : -1)); }, s = fermi ? -1 : 1;
      var nh = n(p[0]), nc = n(p[1]), tau = p[2], x = 1 / p[1] - 1 / p[0];
      var mean = tau * (nh - nc), v = tau * (nh * (1 + s * nc) + nc * (1 + s * nh)) + s * tau * tau * (nh - nc) * (nh - nc);
      var direct = x * mean * v / (mean * mean), k = T.terms(p[0], p[1]);
      worst = Math.max(worst, Math.abs(direct - (fermi ? T.qubit(k, tau) : T.osc(k, tau))));
    });
  });
  ok('tur: universal term minus/plus entropy production equals the cumulant ratio', worst < 1e-9, String(worst));
  ok('tur: oscillators never go below 2', T.osc(T.terms(6, 0.6), 1) >= 2 && T.osc(T.terms(1.1, 1), 0.01) >= 2);
  ok('tur: qubits do, at the default temperatures', T.qubit(T.terms(6, 0.6), 1) < 2);
})();

/* ---- hazard: the shipped backbone reproduces the paper's Table 2 ---- */
(function () {
  var d = JSON.parse(readFile('assets/data/viz/hazard.json')), idx = {};
  d.cities.forEach(function (c, i) { idx[c[0]] = i; });
  ok('hazard: 446 cities', d.cities.length === 446 && d.start.length === 447);
  var sp = models.hazard.dijkstra(d, idx.Mumbai);
  ok('hazard: Mumbai -> Thane 2.89, Pune 3.17, Delhi 3.70',
     near(sp.dist[idx.Thane], 2.89, 0.006) && near(sp.dist[idx.Pune], 3.17, 0.006) && near(sp.dist[idx.Delhi], 3.70, 0.006),
     [sp.dist[idx.Thane], sp.dist[idx.Pune], sp.dist[idx.Delhi]].join(' '));
  var reached = 0; for (var i = 0; i < 446; i++) if (isFinite(sp.dist[i])) reached++;
  ok('hazard: every city can be reached', reached === 446, String(reached));
  ok('hazard: the outline survived simplification', d.outline.length > 10);
})();

/* ---- the other data files are present and have the shape the modules read ---- */
(function () {
  var o = JSON.parse(readFile('assets/data/viz/overlap.json'));
  ok('overlap: an 18 x 11 x 11 grid of fractions', o.pairs.length === 18 && o.pairs[0].length === 11 && o.pairs[0][0].length === 11 &&
     o.alpha.length === 18 && o.groups[17][10][10] >= 0 && o.groups[17][10][10] <= 1);
  var c = JSON.parse(readFile('assets/data/viz/cricket.json'));
  ok('cricket: histograms sum to one', near(c.best_pos.reduce(function (a, b) { return a + b; }, 0), 1, 1e-3) &&
     near(c.gap2.reduce(function (a, b) { return a + b; }, 0), 1, 1e-3));
  ok('cricket: each career names its three best innings', c.players.every(function (p) {
    return p.top.length === 3 && p.runs[p.top[0]] === Math.max.apply(null, p.runs) && p.runs[p.top[0]] >= p.runs[p.top[1]] && p.runs[p.top[1]] >= p.runs[p.top[2]];
  }));
  var n = JSON.parse(readFile('assets/data/viz/nba.json'));
  ok('nba: a 20 x 47 grid of win shares at or above one half where defined', n.p.length === 20 && n.p[0].length === 47 &&
     n.p.every(function (row) { return row.every(function (x) { return x === null || (x >= 0.45 && x <= 1); }); }));
  ok('nba: each game ends on its final margin', n.games.every(function (g) {
    var s = g.label.match(/(\d+), \w+ (\d+)$/); return g.m[g.m.length - 1] === (+s[2]) - (+s[1]);
  }));
  var ch = JSON.parse(readFile('assets/data/viz/chimps.json'));
  ok('chimps: 35 sites, three classes of behaviour', ch.sites.length === 35 && Object.keys(ch.classes).length === 3);
})();

/* ---- the three simulated models keep their invariants ---- */
(function () {
  var s = models.sep.makeModel(100, rng(5)), i, n = 0;
  for (i = 0; i < 4000; i++) s.step(0.5);
  for (i = 0; i < 100; i++) n += s.s[i];
  ok('sep: resetting and hopping conserve the 50 particles', n === 50, String(n));
  ok('sep: resets happen at rate r1 + r2', near(s.resets / s.time, 0.06, 0.015), (s.resets / s.time).toFixed(4));

  var a = models.abp.makeModel(3000, rng(6)); a.protocol = 'I'; a.r = 3; a.DR = 0.4; a.reset();
  for (i = 0; i < 2400; i++) a.step(0.005);
  var mx = 0; for (i = 0; i < a.M; i++) mx += a.x[i]; mx /= a.M;
  ok('abp: protocol I has mean x = v0 / (r + D_R)', near(mx, 1 / 3.4, 0.03), mx.toFixed(3));
  a = models.abp.makeModel(3000, rng(7)); a.protocol = 'II'; a.r = 3; a.DR = 0.4; a.reset();
  for (i = 0; i < 2400; i++) a.step(0.005);
  mx = 0; for (i = 0; i < a.M; i++) mx += a.x[i]; mx /= a.M;
  ok('abp: protocol II has no preferred direction', near(mx, 0, 0.03), mx.toFixed(3));

  var g = models.gamesel.makeModel(600, rng(8)); g.pg = 0.1; g.seed(0.75); g.step(600 * 500);
  var hi = g.stats();
  g = models.gamesel.makeModel(600, rng(9)); g.pg = 0.1; g.seed(0.25); g.step(600 * 500);
  var lo = g.stats();
  ok('gamesel: a cooperative majority selects cooperative games, a minority does not', hi[0] > 0.9 && hi[1] > 0.9 && lo[0] < 0.1 && lo[1] < 0.1,
     hi.join('/') + ' and ' + lo.join('/'));

  var h = models.hoi.makeModel(150, rng(10)); h.lam = 0.9; h.lamD = 0; h.seed(0.4);
  for (i = 0; i < 1500; i++) h.step(0.04);
  var alone = h.count();
  h = models.hoi.makeModel(150, rng(11)); h.lam = 0.9; h.lamD = 4.5; h.seed(0.4);
  for (i = 0; i < 1500; i++) h.step(0.04);
  ok('hoi: links alone let it die out, group pressure sustains it', alone === 0 && h.count() > 30, alone + ' and ' + h.count());
})();

print('');
print(fails ? (fails + ' FAILURE(S)') : 'all tests passed');
