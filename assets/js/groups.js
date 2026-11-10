/* groups.js — ranked ballots  ->  K discussion groups, one project each.
 *
 * Every attendee ranks up to four projects. Given K (the number of groups) and
 * a size tolerance, this picks WHICH K projects run and puts every person in
 * exactly one of them, as well as the rankings allow.
 *
 * Four solutions come out of one call, one per "round":
 *
 *   round 1   aims to give everyone their 1st choice
 *   round 2   aims to give everyone their 2nd choice
 *   ...       and so on.
 *
 * Someone who ranked fewer projects than the round number aims for the last
 * project they ranked. So a person who ranked one project aims for it in every
 * round, and stays in that group throughout unless the size limits make that
 * impossible.
 *
 * Each round picks its own best K projects. (Sharing one set across the four
 * rounds was tried first: rounds 2-4 then outvoted round 1, and the "everyone
 * gets their favourite" solution stopped giving people their favourite.)
 *
 * The maths, exactly (no heuristics):
 *
 *   cost(person, project)  in round r is the project's position in that
 *       person's preference order re-centred on their target: target first,
 *       then the choice one step more favoured, then one step less, ... and
 *       that position p costs COST[p]. A project they did not rank at all costs
 *       UNRANKED. Convex on purpose: two people one step off beats one person
 *       three steps off.
 *   sizes  every group holds between lo = floor(N/K) - spread (at least 1) and
 *       hi = ceil(N/K) + spread people.
 *   per project set  each round is an assignment problem (people x seats),
 *       solved exactly by the Hungarian algorithm. Seats below lo carry a huge
 *       bonus, so every group is filled to its minimum first; seats above an
 *       even split carry a tiny growing penalty, so among equally good
 *       solutions the most even one wins.
 *   over project sets  every K-subset of projects is tried (at most 252 for
 *       10 projects), skipping any whose lower bound cannot beat the best so
 *       far.
 *
 * Deterministic: the same ballots give the same groups on every reload.
 *
 * No dependencies. Publishes window.WorkshopGroups.
 */

(function () {
  'use strict';

  var COST = [0, 100, 300, 600];   // target, then one/two/three steps away
  var UNRANKED = 5000;             // in a project they never ranked
  var BIG = 1e7;                   // bonus that forces each group to its minimum
  var MAX_RANKS = 4;
  var ROUNDS = 4;

  /* --------------------------------------------------------------- inputs -- */

  /* data: { people:[{id,name,consent}], categories:[{id,label,short,description}],
             votes:[[personId, categoryId, rank], ...] }
     Votes without a rank (an older two-field export) are read in order. */
  function prepare(data) {
    var cats = (data.categories || []).slice();
    var cIndex = {};
    cats.forEach(function (c, k) { cIndex[c.id] = k; });

    var byPerson = {};
    (data.votes || []).forEach(function (v, k) {
      var c = cIndex[v[1]];
      if (c === undefined) return;                          // stale category id
      var rank = +v[2] || (k + 1);
      (byPerson[v[0]] = byPerson[v[0]] || []).push({ c: c, rank: rank });
    });

    var anon = 0;
    var people = [];
    (data.people || []).forEach(function (p) {
      var raw = byPerson[p.id];
      if (!raw || !raw.length) return;                      // never voted: no node
      raw.sort(function (a, b) { return a.rank - b.rank || a.c - b.c; });
      var prefs = [];
      raw.forEach(function (x) {
        if (prefs.indexOf(x.c) === -1 && prefs.length < MAX_RANKS) prefs.push(x.c);
      });
      var named = p.consent !== false;
      if (!named) anon++;
      people.push({
        id: p.id,
        label: named ? p.name : 'Anonymous ' + anon,
        anon: !named,
        prefs: prefs
      });
    });

    /* Popularity per project: first choices and total mentions. A count over
       everyone, safe to show anywhere. */
    var first = new Int32Array(cats.length), any = new Int32Array(cats.length);
    people.forEach(function (p) {
      p.prefs.forEach(function (c, k) { any[c]++; if (k === 0) first[c]++; });
    });

    return {
      people: people,
      cats: cats.map(function (c, k) {
        return {
          id: c.id,
          label: c.label || c.id,
          short: c.short || c.label || c.id,
          description: c.description || '',
          first: first[k],
          count: any[k]
        };
      }),
      cache: {}
    };
  }

  /* Re-centre a preference list on its target position t:
     [t, t-1, t+1, t-2, t+2, ...], skipping positions that do not exist. */
  function rotated(prefs, round) {
    var t = Math.min(round, prefs.length) - 1;
    var order = [prefs[t]];
    for (var d = 1; d < MAX_RANKS; d++) {
      if (t - d >= 0) order.push(prefs[t - d]);
      if (t + d < prefs.length) order.push(prefs[t + d]);
    }
    return order;
  }

  /* cost[round][person][project] */
  function costTables(model) {
    var P = model.cats.length;
    var tables = [];
    for (var r = 1; r <= ROUNDS; r++) {
      tables.push(model.people.map(function (p) {
        var row = new Float64Array(P);
        for (var c = 0; c < P; c++) row[c] = UNRANKED;
        rotated(p.prefs, r).forEach(function (c, pos) { row[c] = COST[pos]; });
        return row;
      }));
    }
    return tables;
  }

  /* ----------------------------------------------------------- hungarian -- */

  /* Minimum-cost assignment of n rows to distinct columns of an n x m matrix
     (n <= m). Classic O(n^2 m) potentials version. Returns col index per row. */
  function hungarian(a, n, m) {
    var INF = Infinity;
    var u = new Float64Array(n + 1), v = new Float64Array(m + 1);
    var p = new Int32Array(m + 1), way = new Int32Array(m + 1);
    var minv = new Float64Array(m + 1);
    var used = new Uint8Array(m + 1);
    for (var i = 1; i <= n; i++) {
      p[0] = i;
      var j0 = 0, j;
      for (j = 0; j <= m; j++) { minv[j] = INF; used[j] = 0; }
      do {
        used[j0] = 1;
        var i0 = p[j0], delta = INF, j1 = 0;
        var row = a[i0 - 1];
        for (j = 1; j <= m; j++) {
          if (used[j]) continue;
          var cur = row[j - 1] - u[i0] - v[j];
          if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
          if (minv[j] < delta) { delta = minv[j]; j1 = j; }
        }
        for (j = 0; j <= m; j++) {
          if (used[j]) { u[p[j]] += delta; v[j] -= delta; }
          else minv[j] -= delta;
        }
        j0 = j1;
      } while (p[j0] !== 0);
      do { var jw = way[j0]; p[j0] = p[jw]; j0 = jw; } while (j0);
    }
    var out = new Int32Array(n);
    for (var jj = 1; jj <= m; jj++) if (p[jj]) out[p[jj] - 1] = jj - 1;
    return out;
  }

  /* ------------------------------------------------------------ the solve -- */

  function combinations(P, K, fn) {
    var idx = [];
    for (var i = 0; i < K; i++) idx.push(i);
    while (true) {
      fn(idx);
      var k = K - 1;
      while (k >= 0 && idx[k] === P - K + k) k--;
      if (k < 0) return;
      idx[k]++;
      for (var j = k + 1; j < K; j++) idx[j] = idx[j - 1] + 1;
    }
  }

  /* Seat costs inside one group, increasing (convex) so that the cheapest way
     to seat s people in a group is always its first s seats. */
  function seatCosts(N, K, lo, hi) {
    var even = Math.floor(N / K);
    var out = [];
    for (var q = 0; q < hi; q++) {
      if (q < lo) out.push(-BIG + q * 1e-3);
      else if (q < even) out.push(-(even - q));
      else out.push(q - even + 1);
    }
    return out;
  }

  /* The cheapest the seats can possibly cost: every group as even as allowed. */
  function balancedSeatSum(N, K, seats) {
    var base = Math.floor(N / K), extra = N % K, s = 0;
    for (var g = 0; g < K; g++) {
      var size = base + (g < extra ? 1 : 0);
      for (var q = 0; q < size; q++) s += seats[q];
    }
    return s;
  }

  function solveRound(table, set, N, seats) {
    var K = set.length, hi = seats.length, m = K * hi;
    var a = new Array(N);
    for (var i = 0; i < N; i++) {
      var row = new Float64Array(m), base = table[i];
      for (var g = 0; g < K; g++) {
        var c = base[set[g]];
        for (var q = 0; q < hi; q++) row[g * hi + q] = c + seats[q];
      }
      a[i] = row;
    }
    var col = hungarian(a, N, m);
    var assign = new Int32Array(N), total = 0, pref = 0;
    for (i = 0; i < N; i++) {
      assign[i] = Math.floor(col[i] / hi);
      total += a[i][col[i]];
      pref += table[i][set[assign[i]]];
    }
    return { assign: assign, total: total, pref: pref };
  }

  /* The best K projects for one round, and who goes where. */
  function bestSet(table, N, P, K, seats, seatFloor) {
    var best = null, bestTotal = Infinity;
    combinations(P, K, function (set) {
      /* Lower bound: everyone in their cheapest project of this set, seats as
         even as possible. If even that cannot win, skip the exact solve. */
      var lb = seatFloor;
      for (var i = 0; i < N; i++) {
        var mn = Infinity, row = table[i];
        for (var g = 0; g < K; g++) if (row[set[g]] < mn) mn = row[set[g]];
        lb += mn;
      }
      if (lb >= bestTotal - 1e-6) return;
      var one = solveRound(table, set, N, seats);
      if (one.total < bestTotal - 1e-6) {
        bestTotal = one.total;
        best = { projects: set.slice(), assign: one.assign, pref: one.pref };
      }
    });
    return best;
  }

  /* opts: { groups: K, spread: s }  ->  four rounds, each with its own K
     projects and assignment. Cached on the model, so flipping between rounds
     costs nothing. */
  function solve(model, opts) {
    var N = model.people.length, P = model.cats.length;
    var K = Math.max(1, Math.round(+opts.groups || 1));
    var spread = Math.max(0, Math.round(+opts.spread || 0));
    var key = K + ':' + spread;
    if (model.cache[key]) return model.cache[key];

    var res;
    if (!N || !P) {
      res = { ok: false, reason: N ? 'There are no projects to vote on.' : 'No votes yet.' };
    } else if (K > P) {
      res = { ok: false, reason: 'There are only ' + P + ' projects, so at most ' + P + ' groups.' };
    } else if (K > N) {
      res = { ok: false, reason: 'Only ' + N + (N === 1 ? ' person has' : ' people have') +
              ' voted, which is not enough for ' + K + ' groups.' };
    } else {
      var lo = Math.max(1, Math.floor(N / K) - spread);
      var hi = Math.ceil(N / K) + spread;
      var seats = seatCosts(N, K, lo, hi);
      var seatFloor = balancedSeatSum(N, K, seats);
      var tables = model.tables || (model.tables = costTables(model));

      /* Each round is solved on its own, project set included: round r is
         the best K groups when everyone aims for their r-th choice. Sharing
         one set across rounds would let rounds 2-4 outvote round 1. */
      var rounds = [];
      for (var r = 0; r < ROUNDS; r++) rounds.push(bestSet(tables[r], N, P, K, seats, seatFloor));
      res = { ok: true, K: K, spread: spread, lo: lo, hi: hi, rounds: rounds };
    }
    model.cache[key] = res;
    return res;
  }

  /* -------------------------------------------------------------- reading -- */

  /* What the page shows for one round: the groups, who is in each, and how
     each person ranked the project they landed in (0 = did not rank it). */
  function view(model, opts) {
    var sol = solve(model, opts);
    var round = Math.min(Math.max(Math.round(+opts.round || 1), 1), ROUNDS);
    var out = {
      ok: sol.ok,
      reason: sol.reason || '',
      round: round,
      categories: model.cats,
      groups: [],
      stats: { people: model.people.length, projects: model.cats.length }
    };
    if (!sol.ok) return out;

    var R = sol.rounds[round - 1];
    var groups = R.projects.map(function (c) {
      return { project: model.cats[c], index: c, members: [] };
    });

    var onTarget = 0, unranked = 0, rankSum = 0, ranked = 0, moved = 0;
    model.people.forEach(function (p, i) {
      var g = R.assign[i];
      var c = R.projects[g];
      var rank = p.prefs.indexOf(c) + 1;                   // 0 if unranked
      var target = p.prefs[Math.min(round, p.prefs.length) - 1];
      if (c === target) onTarget++;
      if (!rank) unranked++; else { rankSum += rank; ranked++; }
      if (round > 1) {
        var prev = sol.rounds[round - 2];
        if (prev.projects[prev.assign[i]] !== c) moved++;
      }
      groups[g].members.push({
        id: p.id, label: p.label, anon: p.anon, rank: rank,
        target: p.prefs.indexOf(target) + 1, choices: p.prefs.length
      });
    });

    groups.forEach(function (g) {
      g.members.sort(function (a, b) {
        return (a.rank || 9) - (b.rank || 9) || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0);
      });
    });

    var sizes = groups.map(function (g) { return g.members.length; });
    out.groups = groups;
    out.stats = {
      people: model.people.length,
      projects: model.cats.length,
      groups: groups.length,
      minSize: Math.min.apply(null, sizes),
      maxSize: Math.max.apply(null, sizes),
      lo: sol.lo,
      hi: sol.hi,
      onTarget: onTarget,
      unranked: unranked,
      meanRank: ranked ? rankSum / ranked : 0,
      moved: moved
    };
    return out;
  }

  window.WorkshopGroups = {
    prepare: prepare,
    solve: solve,
    view: view,
    rotated: rotated,
    hungarian: hungarian,
    ROUNDS: ROUNDS,
    MAX_RANKS: MAX_RANKS,
    COST: COST,
    UNRANKED: UNRANKED
  };
})();
