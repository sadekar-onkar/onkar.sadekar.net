/* Test harness for projection.js, run under jsc.
   Shims the two browser globals the file touches. */
var window = {};
load('assets/js/projection.js');
var P = window.WorkshopProjection;

var fails = 0;
function ok(name, cond, extra) {
  if (!cond) { fails++; print('FAIL  ' + name + (extra ? '  ' + extra : '')); }
  else print('ok    ' + name);
}
function close(a, b, tol) { return Math.abs(a - b) < (tol || 1e-9); }

/* ---- 1. hypergeometric survival vs the exact values from Python ---- */
var lf = P._logFactorials(200);
var cases = JSON.parse(read('tests/hyper_ref.json'));
var worst = 0, worstCase = null;
cases.forEach(function (c) {
  var got = P._hyperSurvival(lf, c.N, c.K, c.n, c.x);
  var err = Math.abs(got - c.p);
  if (err > worst) { worst = err; worstCase = c; }
});
ok('hypergeometric matches exact Python over ' + cases.length + ' cases (max err ' +
   worst.toExponential(2) + ')', worst < 1e-12,
   worstCase ? JSON.stringify(worstCase) : '');

/* ---- 2. boundary behaviour ---- */
ok('P(X>=0) == 1', close(P._hyperSurvival(lf, 20, 5, 7, 0), 1));
ok('overlap forced by pigeonhole == 1',
   close(P._hyperSurvival(lf, 10, 8, 7, 5), 1));
ok('impossible overlap == 0', close(P._hyperSurvival(lf, 10, 3, 4, 5), 0));
ok('full overlap is small but positive', (function () {
  var p = P._hyperSurvival(lf, 30, 6, 6, 6);
  return p > 0 && p < 1e-4;
})());

/* ---- 3. Benjamini-Hochberg ---- */
// Benjamini & Hochberg (1995), Table 1 — the paper's own worked example.
// 15 hypotheses at alpha .05; the paper rejects exactly 4, cutoff .0095.
var bh95 = [.0001, .0004, .0019, .0095, .0201, .0278, .0298, .0344,
            .0459, .3240, .4262, .5719, .6528, .7590, 1.0];
var bh = P._bhCutoff(bh95, 15, .05);
ok('BH matches the 1995 paper: cutoff .0095', close(bh, 0.0095, 1e-12), 'got ' + bh);
ok('BH matches the 1995 paper: rejects 4',
   bh95.filter(function (p) { return p <= bh; }).length === 4);
ok('BH returns -1 when nothing survives',
   P._bhCutoff([0.9, 0.95], 100, 0.05) === -1);
ok('BH uses m, not the array length', (function () {
  // one p-value of .04 among 100 tests must NOT pass at alpha .05
  return P._bhCutoff([0.04], 100, 0.05) === -1;
})());

/* ---- 4. build() on a planted two-cluster dataset ---- */
function synth() {
  var people = [], cats = [], votes = [];
  for (var c = 0; c < 10; c++) cats.push({ id: 'c' + c, label: 'Cat ' + c });
  for (var p = 0; p < 20; p++) {
    people.push({ id: 'p' + p, name: 'Person ' + p, consent: p % 5 !== 0 });
    // two planted groups: 0-9 like categories 0-4, 10-19 like 5-9
    var base = p < 10 ? 0 : 5;
    for (var k = 0; k < 4; k++) votes.push(['p' + p, 'c' + (base + k)]);
  }
  return { people: people, categories: cats, votes: votes };
}
var d = synth();

var jac = P.build(d, { method: 'jaccard', threshold: 0.4 });
ok('jaccard: 20 nodes', jac.nodes.length === 20);
ok('jaccard: planted clusters recovered (2 communities)',
   jac.stats.communities === 2, 'got ' + jac.stats.communities);
ok('jaccard: no cross-cluster edge', jac.links.every(function (l) {
  return (l.a < 10) === (l.b < 10);
}));
ok('jaccard: both cliques complete (2 x C(10,2) = 90 edges)',
   jac.links.length === 90, 'got ' + jac.links.length);

var cnt = P.build(d, { method: 'count', threshold: 4 });
ok('count t=4 keeps only identical-set pairs', cnt.links.length === 90,
   'got ' + cnt.links.length);
var cnt5 = P.build(d, { method: 'count', threshold: 5 });
ok('count t=5 keeps nothing (max shared is 4)', cnt5.links.length === 0);
ok('stats.maxShared reports 4', cnt.stats.maxShared === 4);

var val = P.build(d, { method: 'validated', alpha: 0.05 });
ok('validated: finds the planted structure', val.links.length > 0,
   'edges=' + val.links.length + ' cutoff=' + val.stats.cutoff);
ok('validated: is a subset of the raw pairs', val.links.length <= 90);
ok('validated: no cross-cluster edge', val.links.every(function (l) {
  return (l.a < 10) === (l.b < 10);
}));

/* ---- 5. privacy + consent ---- */
ok('non-consenting people are anonymised, not dropped',
   jac.nodes.length === 20 &&
   jac.nodes.filter(function (n) { return n.anon; }).length === 4);
ok('anonymous labels are sequential', (function () {
  var labels = jac.nodes.filter(function (n) { return n.anon; })
                        .map(function (n) { return n.label; });
  return labels.join(',') === 'Anonymous 1,Anonymous 2,Anonymous 3,Anonymous 4';
})());
ok('no node leaks its category ids', jac.nodes.every(function (n) {
  return !('categories' in n) && !('votes' in n);
}));
ok('no link leaks which categories are shared', jac.links.every(function (l) {
  return typeof l.shared === 'number' && !('sharedIds' in l) && !('categories' in l);
}));

/* ---- 6. robustness ---- */
var empty = P.build({ people: [], categories: [], votes: [] }, {});
ok('empty input does not throw', empty.nodes.length === 0 && empty.links.length === 0);
var stale = P.build({
  people: [{ id: 'p1', name: 'A' }],
  categories: [{ id: 'c1', label: 'X' }],
  votes: [['p1', 'c1'], ['pZZ', 'c1'], ['p1', 'cZZ']]
}, {});
ok('stale ids are ignored rather than crashing', stale.nodes[0].interests === 1);
var dup = P.build({
  people: [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }],
  categories: [{ id: 'c1', label: 'X' }],
  votes: [['p1', 'c1'], ['p1', 'c1'], ['p2', 'c1']]
}, { method: 'count', threshold: 1 });
ok('duplicate votes counted once', dup.nodes[0].interests === 1 &&
   dup.links.length === 1 && dup.links[0].shared === 1);
ok('isolated nodes are counted', P.build({
  people: [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }],
  categories: [{ id: 'c1', label: 'X' }, { id: 'c2', label: 'Y' }],
  votes: [['p1', 'c1'], ['p2', 'c2']]
}, { method: 'count', threshold: 1 }).stats.isolated === 2);

/* ---- 7. determinism ---- */
var a1 = P.build(d, { method: 'jaccard', threshold: 0.4 });
var a2 = P.build(d, { method: 'jaccard', threshold: 0.4 });
ok('layout + communities are deterministic across builds',
   JSON.stringify(a1.nodes) === JSON.stringify(a2.nodes));

print('');
print(fails ? (fails + ' FAILURE(S)') : 'all tests passed');
