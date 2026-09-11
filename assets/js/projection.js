/* projection.js — people x categories  ->  person-person network.
 *
 * The workshop collects a bipartite graph: who was interested in what. What
 * gets published is its one-mode projection onto people, so the picture answers
 * "who should talk to whom" instead of "what did each person like".
 *
 * Two ways to draw an edge, because the naive one is misleading:
 *
 *   count      shared categories >= t. Honest but hub-driven — someone who
 *              ticks everything links to everyone.
 *   jaccard    |A n B| / |A u B| >= t. Normalises the enthusiastic tickers
 *              away. The sensible default.
 *
 * Link width follows whichever of the two measures is active.
 *
 * Privacy: nothing here ever exposes WHICH categories a person or a pair
 * chose. Only counts leave this file. See the note in build.py's build_workshop.
 *
 * No dependencies. Loaded before network.js; publishes window.WorkshopProjection.
 */

(function () {
  'use strict';

  /* ------------------------------------------------------------------- layout -- */

  /* Deterministic PRNG. The community colours and the initial ring positions
     must not reshuffle on every reload — a reader who comes back to the page
     should see the same picture they were shown. */
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* Label propagation (Raghavan et al. 2007) on the thresholded projection.
     Communities are what make the map actionable — "here are your clusters" —
     and this is the cheapest algorithm that finds them without a resolution
     parameter to argue about. Deterministic given the same edges. */
  function communities(n, links) {
    var adj = [], i;
    for (i = 0; i < n; i++) adj.push([]);
    links.forEach(function (l) {
      adj[l.a].push({ to: l.b, w: l.w });
      adj[l.b].push({ to: l.a, w: l.w });
    });

    var label = new Int32Array(n);
    for (i = 0; i < n; i++) label[i] = i;

    var rand = mulberry32(0x5EED);
    var order = [];
    for (i = 0; i < n; i++) order.push(i);

    for (var pass = 0; pass < 40; pass++) {
      // shuffle so the sweep order does not bias which label wins
      for (i = order.length - 1; i > 0; i--) {
        var j = Math.floor(rand() * (i + 1));
        var t = order[i]; order[i] = order[j]; order[j] = t;
      }
      var moved = 0;
      for (var k = 0; k < order.length; k++) {
        var v = order[k];
        if (!adj[v].length) continue;
        var tally = {};
        adj[v].forEach(function (e) {
          tally[label[e.to]] = (tally[label[e.to]] || 0) + e.w;
        });
        var best = label[v], bestW = -1;
        for (var lab in tally) {
          if (tally[lab] > bestW) { bestW = tally[lab]; best = +lab; }
        }
        if (best !== label[v]) { label[v] = best; moved++; }
      }
      if (!moved) break;
    }

    /* Renumber by size, biggest community first, so colour 1 is always the
       largest group rather than whichever node happened to be index 0. */
    var size = {};
    for (i = 0; i < n; i++) size[label[i]] = (size[label[i]] || 0) + 1;
    var ranked = Object.keys(size).sort(function (a, b) { return size[b] - size[a]; });
    var rank = {};
    ranked.forEach(function (lab, idx) { rank[lab] = idx; });

    var out = new Int32Array(n);
    for (i = 0; i < n; i++) out[i] = rank[label[i]];
    return out;
  }

  /* --------------------------------------------------------------------- main -- */

  /* data: { people:[{id,name,consent}], categories:[{id,label,live}],
             votes:[[personId, categoryId], ...] }
     opts: { method, threshold } */
  function build(data, opts) {
    opts = opts || {};
    var method = opts.method || 'jaccard';
    var people = data.people || [];
    var cats = data.categories || [];
    var n = people.length, m = cats.length, i, j;

    var pIndex = {}, cIndex = {};
    people.forEach(function (p, k) { pIndex[p.id] = k; });
    cats.forEach(function (c, k) { cIndex[c.id] = k; });

    /* Incidence matrix, one Uint8Array row per person. */
    var B = [];
    for (i = 0; i < n; i++) B.push(new Uint8Array(m));
    var catCount = new Int32Array(m);
    (data.votes || []).forEach(function (v) {
      var a = pIndex[v[0]], b = cIndex[v[1]];
      if (a === undefined || b === undefined) return; // stale id, skip
      if (!B[a][b]) { B[a][b] = 1; catCount[b]++; }
    });

    var deg = new Int32Array(n);
    for (i = 0; i < n; i++) {
      for (j = 0; j < m; j++) deg[i] += B[i][j];
    }

    /* Score every pair once. */
    var pairs = [];
    var totalPairs = n * (n - 1) / 2;

    for (i = 0; i < n; i++) {
      for (j = i + 1; j < n; j++) {
        var shared = 0;
        for (var c = 0; c < m; c++) shared += B[i][c] & B[j][c];
        if (!shared) continue;
        var union = deg[i] + deg[j] - shared;
        pairs.push({ a: i, b: j, shared: shared, jaccard: union ? shared / union : 0 });
      }
    }

    /* Keep the edges this method believes in. Width follows the same measure
       the threshold is on, capped at 3px so one heavy link cannot swamp the
       picture. */
    var links = [];
    if (method === 'count') {
      var t = opts.threshold === undefined ? 2 : opts.threshold;
      pairs.forEach(function (pr) {
        if (pr.shared >= t) {
          links.push({ a: pr.a, b: pr.b, w: Math.min(0.6 + pr.shared * 0.35, 3),
                       shared: pr.shared });
        }
      });
    } else {
      var tj = opts.threshold === undefined ? 0.4 : opts.threshold;
      pairs.forEach(function (pr) {
        if (pr.jaccard >= tj) {
          links.push({ a: pr.a, b: pr.b, w: Math.min(0.6 + pr.jaccard * 3, 3),
                       shared: pr.shared, jaccard: pr.jaccard });
        }
      });
    }

    var comm = communities(n, links);

    /* Nodes. A person who withheld consent keeps their structural position but
       loses their name — dropping them instead would silently change the
       network everyone else is being shown. */
    var rand = mulberry32(0xC0FFEE);
    var anon = 0;
    var nodes = people.map(function (p, k) {
      var named = p.consent !== false;
      if (!named) anon++;
      var ang = (k / Math.max(n, 1)) * 6.283;
      return {
        id: p.id,
        kind: 'person',
        label: named ? p.name : 'Anonymous ' + anon,
        anon: !named,
        interests: deg[k],
        community: comm[k],
        tone: comm[k] % 5,
        r: 4 + Math.min(deg[k], 10) * 0.9,
        x: Math.cos(ang) * (0.6 + rand() * 0.5),
        y: Math.sin(ang) * (0.6 + rand() * 0.5),
        vx: 0, vy: 0
      };
    });

    /* Degree in the projection, for the tooltip. */
    var linkDeg = new Int32Array(n);
    links.forEach(function (l) { linkDeg[l.a]++; linkDeg[l.b]++; });
    nodes.forEach(function (nd, k) { nd.links = linkDeg[k]; });

    var nComm = 0;
    for (i = 0; i < n; i++) if (linkDeg[i]) nComm = Math.max(nComm, comm[i] + 1);

    return {
      nodes: nodes,
      links: links,
      stats: {
        people: n,
        categories: m,
        votes: (data.votes || []).length,
        edges: links.length,
        possible: totalPairs,
        density: totalPairs ? links.length / totalPairs : 0,
        isolated: nodes.filter(function (nd) { return !nd.links; }).length,
        communities: nComm,
        maxShared: pairs.reduce(function (a, pr) { return Math.max(a, pr.shared); }, 0)
      },
      categories: cats.map(function (c, k) {
        return { id: c.id, label: c.label, live: !!c.live, count: catCount[k] };
      })
    };
  }

  window.WorkshopProjection = { build: build };
})();
