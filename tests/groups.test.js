/* Tests for groups.js, run under jsc. */
var window = {};
load('assets/js/groups.js');
var G = window.WorkshopGroups;

var fails = 0;
function ok(name, cond, extra) {
  if (!cond) { fails++; print('FAIL  ' + name + (extra ? '  ' + extra : '')); }
  else print('ok    ' + name);
}

function cats(n) {
  var out = [];
  for (var i = 0; i < n; i++) out.push({ id: 'c' + i, label: 'Project ' + i, short: 'P' + i });
  return out;
}
/* ballots: array of arrays of category indices, favourite first */
function dataset(ballots, nCats) {
  var people = [], votes = [];
  ballots.forEach(function (b, i) {
    people.push({ id: 'p' + i, name: 'Person ' + i, consent: true });
    b.forEach(function (c, r) { votes.push(['p' + i, 'c' + c, r + 1]); });
  });
  return { people: people, categories: cats(nCats), votes: votes };
}
function groupOf(view, id) {
  for (var g = 0; g < view.groups.length; g++) {
    if (view.groups[g].members.some(function (m) { return m.id === id; })) return view.groups[g];
  }
  return null;
}

/* ---- 1. the Hungarian solver against brute force ---- */
function perms(n, m) {
  var out = [];
  (function rec(prefix, used) {
    if (prefix.length === n) { out.push(prefix.slice()); return; }
    for (var j = 0; j < m; j++) if (!used[j]) {
      used[j] = 1; prefix.push(j); rec(prefix, used); prefix.pop(); used[j] = 0;
    }
  })([], {});
  return out;
}
var seed = 7;
function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
var hungOk = true;
for (var trial = 0; trial < 40; trial++) {
  var n = 1 + Math.floor(rnd() * 5), m = n + Math.floor(rnd() * 3);
  var a = [];
  for (var i = 0; i < n; i++) {
    var row = new Float64Array(m);
    for (var j = 0; j < m; j++) row[j] = Math.floor(rnd() * 50) - 10;
    a.push(row);
  }
  var col = G.hungarian(a, n, m), got = 0, seen = {};
  for (i = 0; i < n; i++) { got += a[i][col[i]]; if (seen[col[i]]) hungOk = false; seen[col[i]] = 1; }
  var bestB = Infinity;
  perms(n, m).forEach(function (p) {
    var s = 0; for (var k = 0; k < n; k++) s += a[k][p[k]]; if (s < bestB) bestB = s;
  });
  if (Math.abs(got - bestB) > 1e-9) { hungOk = false; print('  trial ' + trial + ': ' + got + ' vs ' + bestB); }
}
ok('hungarian matches brute force on 40 random rectangular matrices', hungOk);

/* ---- 2. rotation of preferences ---- */
ok('round 1 order is the ballot order',
   G.rotated([5, 6, 7, 8], 1).join() === '5,6,7,8');
ok('round 2 targets the 2nd choice, then the 1st, then the 3rd',
   G.rotated([5, 6, 7, 8], 2).join() === '6,5,7,8');
ok('round 4 targets the 4th choice and walks back up',
   G.rotated([5, 6, 7, 8], 4).join() === '8,7,6,5');
ok('a single-choice ballot targets that choice in every round',
   [1, 2, 3, 4].every(function (r) { return G.rotated([3], r).join() === '3'; }));
ok('a two-choice ballot targets its last choice in rounds 3 and 4',
   G.rotated([3, 4], 3).join() === '4,3' && G.rotated([3, 4], 4).join() === '4,3');

/* ---- 3. planted: four clean camps of 5, K = 4 ---- */
var planted = [];
for (var p = 0; p < 20; p++) {
  var camp = Math.floor(p / 5);
  // camp k ranks k, then k+4, k+8 (wrapping in 10)
  planted.push([camp, (camp + 4) % 10, (camp + 8) % 10]);
}
var M = G.prepare(dataset(planted, 10));
var v1 = G.view(M, { groups: 4, spread: 1, round: 1 });
ok('planted: solves', v1.ok, v1.reason);
ok('planted: picks exactly K distinct projects',
   v1.groups.length === 4 &&
   v1.groups.map(function (g) { return g.index; }).sort().join() === '0,1,2,3',
   v1.groups.map(function (g) { return g.index; }).join());
ok('planted round 1: everybody in their first choice', v1.stats.onTarget === 20 &&
   v1.groups.every(function (g) { return g.members.every(function (m) { return m.rank === 1; }); }));
ok('planted: groups are disjoint and cover everyone', (function () {
  var seen = {}, n = 0;
  v1.groups.forEach(function (g) { g.members.forEach(function (m) { if (seen[m.id]) n = -999; seen[m.id] = 1; n++; }); });
  return n === 20;
})());
ok('planted: sizes within bounds', v1.stats.minSize >= v1.stats.lo && v1.stats.maxSize <= v1.stats.hi);

/* ---- 4. balance: everyone wants project 0 ---- */
var herd = [];
for (p = 0; p < 12; p++) herd.push([0, 1 + (p % 3), 4 + (p % 2)]);
var H = G.prepare(dataset(herd, 6));
var hv = G.view(H, { groups: 3, spread: 0, round: 1 });
ok('herd: spread 0 forces exactly even groups of 4',
   hv.ok && hv.groups.every(function (g) { return g.members.length === 4; }),
   hv.groups.map(function (g) { return g.members.length; }).join());
var hv2 = G.view(H, { groups: 3, spread: 2, round: 1 });
ok('herd: spread 2 lets the popular group grow to its cap (4+2)',
   hv2.ok && hv2.stats.maxSize === 6, 'max=' + hv2.stats.maxSize);
ok('herd: no group ever falls below its minimum', hv2.stats.minSize >= hv2.stats.lo);

/* ---- 5. rounds: target r-th choice where feasible ---- */
var four = [];
for (p = 0; p < 16; p++) {
  // each person ranks all of 0..3 in a rotated order, so every round is
  // perfectly satisfiable with 4 groups of 4
  var s0 = p % 4;
  four.push([s0, (s0 + 1) % 4, (s0 + 2) % 4, (s0 + 3) % 4]);
}
var F = G.prepare(dataset(four, 6));
[1, 2, 3, 4].forEach(function (r) {
  var fv = G.view(F, { groups: 4, spread: 0, round: r });
  ok('round ' + r + ': everyone gets their choice no. ' + r,
     fv.ok && fv.stats.onTarget === 16 &&
     fv.groups.every(function (g) { return g.members.every(function (m) { return m.rank === r; }); }),
     'onTarget=' + fv.stats.onTarget);
});

/* ---- 6. single-choice voters stay put ---- */
var mixed = [[2], [2], [5], [0, 1, 2, 3], [1, 0, 3, 2], [3, 2, 1, 0], [0, 3], [1, 2, 0], [5, 0], [3, 1, 2, 5]];
var X = G.prepare(dataset(mixed, 6));
var homes = {};
var stay = true;
[1, 2, 3, 4].forEach(function (r) {
  var xv = G.view(X, { groups: 4, spread: 1, round: r });
  ['p0', 'p1', 'p2'].forEach(function (id) {
    var g = groupOf(xv, id).index;
    if (homes[id] === undefined) homes[id] = g;
    if (homes[id] !== g) stay = false;
  });
});
ok('people who ranked one project stay in it in all four rounds', stay, JSON.stringify(homes));
ok('...and that project is the one they ranked', homes.p0 === 2 && homes.p1 === 2 && homes.p2 === 5);

/* ---- 7. optimality against brute force on a tiny instance ---- */
function brute(ballots, P, K, spread) {
  var model = G.prepare(dataset(ballots, P));
  var N = model.people.length;
  var lo = Math.max(1, Math.floor(N / K) - spread), hi = Math.ceil(N / K) + spread;
  function costOf(i, c, r) {
    var pos = G.rotated(model.people[i].prefs, r).indexOf(c);
    return pos < 0 ? G.UNRANKED : G.COST[pos];
  }
  // each round: best over all K-subsets, independently
  var total = 0;
  for (var r = 1; r <= 4; r++) {
    var bestR = Infinity;
    (function sub(start, set) {
      if (set.length === K) {
        (function assign(i, sizes, acc) {
          if (acc >= bestR) return;
          if (i === N) {
            if (sizes.every(function (s) { return s >= lo; })) bestR = acc;
            return;
          }
          for (var g = 0; g < K; g++) {
            if (sizes[g] >= hi) continue;
            sizes[g]++;
            assign(i + 1, sizes, acc + costOf(i, set[g], r));
            sizes[g]--;
          }
        })(0, set.map(function () { return 0; }), 0);
        return;
      }
      for (var c = start; c < P; c++) { set.push(c); sub(c + 1, set); set.pop(); }
    })(0, []);
    total += bestR;
  }
  var best = total;
  return best;
}
function ours(ballots, P, K, spread) {
  var model = G.prepare(dataset(ballots, P));
  var sol = G.solve(model, { groups: K, spread: spread });
  var total = 0;
  for (var r = 1; r <= 4; r++) {
    var R = sol.rounds[r - 1];
    model.people.forEach(function (p, i) {
      var pos = G.rotated(p.prefs, r).indexOf(R.projects[R.assign[i]]);
      total += pos < 0 ? G.UNRANKED : G.COST[pos];
    });
  }
  return total;
}
var optOk = true;
seed = 11;
for (trial = 0; trial < 25; trial++) {
  var P = 4 + Math.floor(rnd() * 2), K = 2 + Math.floor(rnd() * 2);
  var N = 5 + Math.floor(rnd() * 3), spread = Math.floor(rnd() * 2);
  var ballots = [];
  for (i = 0; i < N; i++) {
    var len = 1 + Math.floor(rnd() * 4), b = [];
    while (b.length < len) { var c = Math.floor(rnd() * P); if (b.indexOf(c) < 0) b.push(c); }
    ballots.push(b);
  }
  var x = ours(ballots, P, K, spread), y = brute(ballots, P, K, spread);
  if (x !== y) { optOk = false; print('  trial ' + trial + ': ours ' + x + ' brute ' + y); }
}
ok('optimal against exhaustive search on 25 random small instances', optOk);

/* ---- 8. robustness ---- */
var E = G.view(G.prepare({ people: [], categories: cats(3), votes: [] }), { groups: 2, round: 1 });
ok('no votes: not ok, with a reason, no throw', !E.ok && /No votes/.test(E.reason));
var tooMany = G.view(G.prepare(dataset([[0], [1]], 3)), { groups: 3, round: 1 });
ok('more groups than voters: says so', !tooMany.ok && /not enough/.test(tooMany.reason));
var tooManyP = G.view(G.prepare(dataset([[0], [1], [2], [0]], 3)), { groups: 4, round: 1 });
ok('more groups than projects: says so', !tooManyP.ok && /only 3 projects/i.test(tooManyP.reason));
var stale = G.prepare({
  people: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
  categories: cats(2),
  votes: [['a', 'c0', 1], ['a', 'cZZ', 2], ['zz', 'c0', 1], ['a', 'c0', 3], ['b', 'c1', 1]]
});
ok('stale ids and duplicates are ignored', stale.people.length === 2 &&
   stale.people[0].prefs.join() === '0');
var legacy = G.prepare({ people: [{ id: 'a', name: 'A' }], categories: cats(3),
                         votes: [['a', 'c2'], ['a', 'c0']] });
ok('rankless votes are read in order', legacy.people[0].prefs.join() === '2,0');
var five = G.prepare(dataset([[0, 1, 2, 3, 4]], 6));
ok('a ballot is capped at four ranks', five.people[0].prefs.length === 4);
var anonM = G.prepare({ people: [{ id: 'a', name: 'Secret', consent: false }],
                        categories: cats(1), votes: [['a', 'c0', 1]] });
ok('consent:false is shown as Anonymous, never by name',
   anonM.people[0].label === 'Anonymous 1' && anonM.people[0].anon);

/* ---- 9. determinism + speed at workshop scale ---- */
seed = 3;
var big = [];
for (i = 0; i < 60; i++) {
  var bl = [], L = 1 + Math.floor(rnd() * 4);
  while (bl.length < L) {
    var cc = Math.floor(Math.pow(rnd(), 1.6) * 10);   // skewed popularity
    if (bl.indexOf(cc) < 0) bl.push(cc);
  }
  big.push(bl);
}
var t0 = Date.now();
var B1 = G.view(G.prepare(dataset(big, 10)), { groups: 5, spread: 1, round: 1 });
var ms = Date.now() - t0;
var B2 = G.view(G.prepare(dataset(big, 10)), { groups: 5, spread: 1, round: 1 });
ok('deterministic across fresh builds', JSON.stringify(B1.groups) === JSON.stringify(B2.groups));
ok('60 people, 10 projects, 5 groups solves in under 3 s', ms < 3000, ms + ' ms');
var t1 = Date.now();
G.view(G.prepare(dataset(big, 10)), { groups: 10, spread: 1, round: 1 });
G.view(G.prepare(dataset(big, 10)), { groups: 3, spread: 3, round: 1 });
ok('worst-case K values also stay quick', Date.now() - t1 < 4000, (Date.now() - t1) + ' ms');
print('  60 people, K=5: ' + ms + ' ms; on target ' + B1.stats.onTarget + '/60, unranked ' +
      B1.stats.unranked + ', sizes ' + B1.stats.minSize + '-' + B1.stats.maxSize);

print('');
print(fails ? (fails + ' FAILURE(S)') : 'all tests passed');
