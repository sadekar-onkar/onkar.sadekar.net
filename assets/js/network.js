/* network.js — the hero visualisation.
   Four modes, one picked at random per visit; the shuffle button cycles them.

     simplicial : a hypergraph with filled 2- and 3-faces, cooperation
                  spreading across group interactions
     coauthors  : the real co-authorship network, derived from PAPERS
     papers     : one node per paper, clustered by research theme, clickable
     abstract   : a generative force-directed graph, different every load

   Plain canvas, no libraries. Colours are read from the CSS custom properties
   so every palette and light/dark switch is picked up automatically.
   Honours prefers-reduced-motion and pauses when scrolled out of view. */

(function () {
  'use strict';

  /* ---------------------------------------------------------------- data -- */
  /* Single source of truth for both graph modes. `a` lists co-authors only
     (Onkar is implicit). Keep in sync with publications.html. */

  var PAPERS = [
    { k: 'nhb25',    t: 'Higher-order interactions shape collective human behaviour',
      v: 'Nat. Hum. Behav.', y: 2025, th: 'collective',
      a: ['F. Battiston', 'V. Capraro', 'F. Karimi', 'S. Lehmann', 'A. B. Migliano', 'A. Sánchez', 'M. Perc'],
      u: 'https://doi.org/10.1038/s41562-025-02373-5' },
    { k: 'rsif25',   t: 'Drivers of cooperation in social dilemmas on higher-order networks',
      v: 'J. R. Soc. Interface', y: 2025, th: 'higher-order',
      a: ['A. Civilini', 'V. Latora', 'F. Battiston'],
      u: 'https://doi.org/10.1098/rsif.2025.0134' },
    { k: 'sci24',    t: 'Population connectivity shapes chimpanzee cumulative culture',
      v: 'Science', y: 2024, th: 'culture',
      a: ['C. Gunasekaram', 'F. Battiston', 'C. Padilla-Iglesias', 'A. B. Migliano'],
      u: 'https://doi.org/10.1126/science.adk3381' },
    { k: 'pre24',    t: 'Evolutionary game selection creates cooperative environments',
      v: 'Phys. Rev. E', y: 2024, th: 'higher-order',
      a: ['A. Civilini', 'J. Gómez-Gardeñes', 'V. Latora', 'F. Battiston'],
      u: 'https://doi.org/10.1103/PhysRevE.110.014306' },
    { k: 'rsos24',   t: 'Individual and team performance in cricket',
      v: 'R. Soc. Open Sci.', y: 2024, th: 'applied',
      a: ['S. Chowdhary', 'M. S. Santhanam', 'F. Battiston'],
      u: 'https://doi.org/10.1098/rsos.240809' },
    { k: 'prl24',    t: 'Explosive cooperation in social dilemmas on higher-order networks',
      v: 'Phys. Rev. Lett.', y: 2024, th: 'higher-order',
      a: ['A. Civilini', 'F. Battiston', 'J. Gómez-Gardeñes', 'V. Latora'],
      u: 'https://doi.org/10.1103/PhysRevLett.132.167401' },
    { k: 'cs21',     t: 'An infectious diseases hazard map for India',
      v: 'Curr. Sci.', y: 2021, th: 'applied',
      a: ['M. Budamagunta', 'G. J. Sreejith', 'S. Jain', 'M. S. Santhanam'],
      u: 'https://doi.org/10.18520/cs/v121/i9/1208-1215' },
    { k: 'pre21',    t: 'Thermodynamic uncertainty relation for energy transport',
      v: 'Phys. Rev. E', y: 2021, th: 'statphys',
      a: ['S. Saryal', 'B. K. Agarwalla'],
      u: 'https://doi.org/10.1103/PhysRevE.103.022141' },
    { k: 'pre20',    t: 'Active Brownian motion in two dimensions under stochastic resetting',
      v: 'Phys. Rev. E', y: 2020, th: 'statphys',
      a: ['V. Kumar', 'U. Basu'],
      u: 'https://doi.org/10.1103/PhysRevE.102.052129' },
    { k: 'jstat20',  t: 'Zero-current nonequilibrium state in symmetric exclusion process',
      v: 'J. Stat. Mech.', y: 2020, th: 'statphys',
      a: ['U. Basu'],
      u: 'https://doi.org/10.1088/1742-5468/ab9e5e' },
    { k: 'nba26',    t: 'From streaks to synergies: performance and scoring in the NBA',
      v: 'arXiv', y: 2026, th: 'applied',
      a: ['M. Bozhidarova', 'F. Battiston', 'D. Cirulli', 'B. Pereira'],
      u: 'https://arxiv.org/abs/2606.27957' },
    { k: 'pgg26',    t: 'Emergence of cooperation in nonlinear higher-order public goods games',
      v: 'arXiv', y: 2026, th: 'higher-order',
      a: ['J. Llabrés', 'F. Malizia', 'F. Battiston'],
      u: 'https://arxiv.org/abs/2604.07228' }
  ];

  var THEME_TONE = {
    'higher-order': 0,   // --a1
    'collective': 1,     // --a2
    'culture': 2,        // --a3
    'statphys': 3,       // --ink-2
    'applied': 4         // --a4
  };

  var THEME_LABEL = {
    'higher-order': 'Higher-order networks',
    'collective': 'Collective behaviour',
    'culture': 'Cultural evolution',
    'statphys': 'Statistical physics',
    'applied': 'Applied network science'
  };

  /* ------------------------------------------------------------- helpers -- */

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function readColours() {
    var s = getComputedStyle(document.documentElement);
    var get = function (n) { return s.getPropertyValue(n).trim(); };
    return {
      tones: [get('--a1'), get('--a2'), get('--a3'), get('--ink-2'), get('--a4')],
      ink: get('--ink'),
      ink2: get('--ink-2'),
      line: get('--line'),
      surface: get('--surface'),
      bg: get('--bg')
    };
  }

  /* Convert any CSS colour to rgba() with the given alpha, via canvas. */
  var _probe = document.createElement('canvas').getContext('2d');
  function alpha(colour, a) {
    _probe.fillStyle = '#000';
    _probe.fillStyle = colour;
    var c = _probe.fillStyle;
    if (c[0] === '#') {
      var n = parseInt(c.slice(1), 16);
      return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    }
    return c.replace(/^rgb\(/, 'rgba(').replace(/\)$/, ',' + a + ')');
  }

  /* --------------------------------------------------------- graph build -- */

  function buildSimplicial() {
    /* A triangulated patch — a genuine simplicial complex rather than a random
       hairball. Build a triangular lattice, read its triangles off the
       adjacency, then promote a subset of them to filled group interactions. */
    var widths = [4, 5, 6, 5, 4];
    var nodes = [], links = [], faces = [], rowsIdx = [], adj = {};

    widths.forEach(function (w, r) {
      var row = [];
      for (var i = 0; i < w; i++) {
        row.push(nodes.length);
        nodes.push({
          x: (i - (w - 1) / 2) * 0.34 + rnd(-0.04, 0.04),
          y: (r - (widths.length - 1) / 2) * 0.42 + rnd(-0.04, 0.04),
          vx: 0, vy: 0, r: 5.4, tone: 0, state: 0
        });
      }
      rowsIdx.push(row);
    });

    function link(a, b) {
      if (a === undefined || b === undefined) return;
      var key = Math.min(a, b) + '-' + Math.max(a, b);
      if (adj[key]) return;
      adj[key] = 1;
      links.push({ a: a, b: b, len: 74 });
    }

    // horizontal bonds
    rowsIdx.forEach(function (row) {
      for (var i = 0; i < row.length - 1; i++) link(row[i], row[i + 1]);
    });
    // bonds between neighbouring rows, respecting the expand/contract offset
    for (var r = 0; r < rowsIdx.length - 1; r++) {
      var a = rowsIdx[r], b = rowsIdx[r + 1];
      var growing = b.length > a.length;
      for (var i = 0; i < a.length; i++) {
        if (growing) { link(a[i], b[i]); link(a[i], b[i + 1]); }
        else { link(a[i], b[i - 1]); link(a[i], b[i]); }
      }
    }

    // every triangle in the lattice
    var isAdj = function (x, y) { return !!adj[Math.min(x, y) + '-' + Math.max(x, y)]; };
    var tris = [];
    for (var p = 0; p < nodes.length; p++) {
      for (var q = p + 1; q < nodes.length; q++) {
        if (!isAdj(p, q)) continue;
        for (var s = q + 1; s < nodes.length; s++) {
          if (isAdj(p, s) && isAdj(q, s)) tris.push([p, q, s]);
        }
      }
    }

    // promote roughly half of them to group interactions
    tris.sort(function () { return Math.random() - 0.5; });
    var take = Math.round(tris.length * 0.45);
    for (var t = 0; t < take; t++) faces.push({ n: tris[t], tone: t % 3 });

    // merge two adjacent triangles into one 4-body face for variety
    for (t = 0; t < faces.length - 1 && faces.length > 2; t++) {
      var shared = faces[t].n.filter(function (v) { return faces[t + 1].n.indexOf(v) !== -1; });
      if (shared.length === 2) {
        var union = faces[t].n.concat(faces[t + 1].n.filter(function (v) {
          return faces[t].n.indexOf(v) === -1;
        }));
        faces.splice(t, 2, { n: union, tone: faces[t].tone });
        break;
      }
    }

    nodes[Math.floor(rnd(0, nodes.length))].state = 1;
    return {
      nodes: nodes, links: links, faces: faces, dynamic: true,
      caption: '<b>Higher-order interactions.</b> Shaded faces are 3- and 4-body group interactions, not just pairs. Cooperation spreads through the groups.'
    };
  }

  function buildCoauthors() {
    var counts = {}, pairs = {};
    PAPERS.forEach(function (p) {
      p.a.forEach(function (name) {
        counts[name] = (counts[name] || 0) + 1;
        p.a.forEach(function (other) {
          if (other <= name) return;
          var key = name + '||' + other;
          pairs[key] = (pairs[key] || 0) + 1;
        });
      });
    });

    var names = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    var nodes = [{ x: 0, y: 0, vx: 0, vy: 0, r: 11, tone: 0, label: 'Onkar Sadekar',
                   sub: String(PAPERS.length) + ' papers', hub: true }];
    var index = {};
    names.forEach(function (name, i) {
      index[name] = nodes.length;
      var n = counts[name];
      nodes.push({
        x: Math.cos(i / names.length * 6.283) * rnd(0.5, 1),
        y: Math.sin(i / names.length * 6.283) * rnd(0.5, 1),
        vx: 0, vy: 0,
        r: 4.5 + Math.min(n, 8) * 0.95,
        tone: n >= 5 ? 0 : n >= 2 ? 1 : 3,
        label: name,
        sub: n + (n === 1 ? ' paper' : ' papers') + ' together'
      });
    });

    var links = [];
    names.forEach(function (name) {
      links.push({ a: 0, b: index[name], len: 74 + (8 - Math.min(counts[name], 8)) * 9,
                   w: 0.8 + Math.min(counts[name], 8) * 0.35 });
    });
    Object.keys(pairs).forEach(function (key) {
      var ab = key.split('||');
      links.push({ a: index[ab[0]], b: index[ab[1]], len: 92, w: 0.5 + pairs[key] * 0.3,
                   faint: true, k: 0.45 });
    });

    return {
      nodes: nodes, links: links, faces: [], labels: true,
      caption: '<b>Who I work with.</b> Every node is a co-author, sized by how many papers we share. Hover to see who.'
    };
  }

  function buildPapers() {
    var themes = {};
    PAPERS.forEach(function (p) { themes[p.th] = 1; });
    var order = Object.keys(themes);

    var nodes = PAPERS.map(function (p, i) {
      var ang = order.indexOf(p.th) / order.length * 6.283;
      return {
        x: Math.cos(ang) * 0.75 + rnd(-0.18, 0.18),
        y: Math.sin(ang) * 0.75 + rnd(-0.18, 0.18),
        vx: 0, vy: 0,
        r: 6 + (p.y - 2019) * 0.75,
        tone: THEME_TONE[p.th],
        label: p.t,
        sub: p.v + ' · ' + p.y,
        href: p.u,
        theme: p.th
      };
    });

    var links = [];
    for (var i = 0; i < PAPERS.length; i++) {
      for (var j = i + 1; j < PAPERS.length; j++) {
        var shared = PAPERS[i].a.filter(function (x) { return PAPERS[j].a.indexOf(x) !== -1; }).length;
        var same = PAPERS[i].th === PAPERS[j].th;
        if (!shared && !same) continue;
        links.push({ a: i, b: j, len: same ? 52 : 150, w: same ? 1.6 : 0.7,
                     faint: !same, k: same ? 1 : 0.3 });
      }
    }

    var TONE_VAR = ['--a1', '--a2', '--a3', '--ink-2', '--a4'];
    var legend = order.map(function (th) {
      return '<span style="white-space:nowrap"><span style="display:inline-block;width:8px;height:8px;' +
        'border-radius:50%;background:var(' + TONE_VAR[THEME_TONE[th]] +
        ');margin-right:0.3em;vertical-align:0.02em"></span>' + THEME_LABEL[th] + '</span>';
    }).join('&nbsp;&nbsp; ');

    return {
      nodes: nodes, links: links, faces: [], labels: true, clickable: true,
      caption: '<b>My papers as a network.</b> Nodes are papers, linked when they share authors or a topic &mdash; click one to read it.<br>' +
        '<span style="font-size:0.94em">' + legend + '</span>'
    };
  }

  function buildAbstract() {
    /* Communities are given an explicit home to settle around. Letting them
       emerge from the forces alone is unreliable in a wide, short canvas —
       they smear across it and the modular structure stops reading. */
    var groups = 4 + Math.floor(rnd(0, 2));
    var nodes = [], links = [];
    for (var g = 0; g < groups; g++) {
      var ang = (g / groups) * 6.283 + rnd(-0.25, 0.25);
      var per = 5 + Math.floor(rnd(0, 4));
      var hx = 0.5 + Math.cos(ang) * 0.34;
      var hy = 0.5 + Math.sin(ang) * 0.32;
      var base = nodes.length;
      for (var i = 0; i < per; i++) {
        // each node gets its own slot on a small ring around the community
        // centre, so the module holds its shape instead of being blown open
        var a2 = (i / per) * 6.283 + rnd(-0.3, 0.3);
        var nx = hx + Math.cos(a2) * rnd(0.035, 0.075);
        var ny = hy + Math.sin(a2) * rnd(0.07, 0.15);
        nodes.push({
          x: (nx - 0.5) * 2,
          y: (ny - 0.5) * 2,
          vx: 0, vy: 0, r: rnd(3.5, 7.5), tone: g % 5,
          hx: nx, hy: ny
        });
      }
      // dense inside the community, so it reads as a module
      for (i = 0; i < per; i++) {
        for (var j = i + 1; j < per; j++) {
          if (Math.random() < 0.46) links.push({ a: base + i, b: base + j, len: 46 });
        }
      }
      // a couple of long, weak bridges to an earlier community
      if (g > 0) {
        for (var b = 0; b < 2; b++) {
          links.push({
            a: base + Math.floor(rnd(0, per)),
            b: Math.floor(rnd(0, base)),
            len: 120, faint: true, k: 0.12
          });
        }
      }
    }
    return {
      nodes: nodes, links: links, faces: [], drift: true, rep: 0.15,
      caption: '<b>A network, freshly grown.</b> Modular structure, seeded at random — reload for a different one.'
    };
  }

  var MODES = {
    simplicial: buildSimplicial,
    coauthors: buildCoauthors,
    papers: buildPapers,
    abstract: buildAbstract
  };
  var MODE_KEYS = Object.keys(MODES);

  /* ------------------------------------------------------------- runtime -- */

  function init(figure) {
    var canvas = figure.querySelector('canvas');
    var captionEl = figure.querySelector('[data-net-caption]');
    var shuffleBtn = figure.querySelector('[data-net-shuffle]');
    var tip = figure.querySelector('[data-net-tip]');
    if (!canvas) return;

    var ctx = canvas.getContext('2d');
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var C = readColours();
    var W = 0, H = 0, dpr = 1;
    var G = null, modeIdx = 0, raf = null, visible = true, ticks = 0;
    var pointer = { x: null, y: null, down: false };
    var dragging = null, hovered = null;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      var rect = canvas.getBoundingClientRect();
      W = rect.width; H = rect.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function load(key) {
      G = MODES[key]();
      G.mode = key;
      // scatter into pixel space around the centre, following the canvas
      // aspect so a wide banner starts wide rather than as a small disc
      var sx = W * 0.40, sy = H * 0.40;
      G.nodes.forEach(function (n) {
        n.x = W / 2 + n.x * sx;
        n.y = H / 2 + n.y * sy;
      });
      if (G.nodes[0] && G.nodes[0].hub) { G.nodes[0].x = W / 2; G.nodes[0].y = H / 2; }
      /* Spread the layout to fill whatever canvas we were given. Target
         spacing is the side of the area each node gets; link lengths and
         repulsion are scaled to match so a wide canvas fills out instead of
         leaving the graph marooned in the middle. */
      var spacing = Math.min(Math.sqrt(W * H / G.nodes.length), H / 3.4);
      G.scale = Math.max(0.7, Math.min(2.0, spacing / 62));
      if (captionEl) captionEl.innerHTML = G.caption;
      figure.setAttribute('data-mode', key);
      ticks = 0;
      canvas.style.cursor = G.clickable ? 'pointer' : 'grab';
    }

    /* --- physics --- */
    function step() {
      var nodes = G.nodes, links = G.links, i, j, n, m, dx, dy, d, f;
      var S = G.scale || 1, S2 = S * S;

      // repulsion
      for (i = 0; i < nodes.length; i++) {
        n = nodes[i];
        for (j = i + 1; j < nodes.length; j++) {
          m = nodes[j];
          dx = m.x - n.x; dy = m.y - n.y;
          d = Math.sqrt(dx * dx + dy * dy) || 0.01;
          if (d > 260 * S) continue;
          f = (1400 + (n.r + m.r) * 60) * S2 * (G.rep === undefined ? 1 : G.rep) / (d * d);
          dx /= d; dy /= d;
          n.vx -= dx * f; n.vy -= dy * f;
          m.vx += dx * f; m.vy += dy * f;
        }
      }

      // springs
      for (i = 0; i < links.length; i++) {
        var l = links[i];
        n = nodes[l.a]; m = nodes[l.b];
        dx = m.x - n.x; dy = m.y - n.y;
        d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        // l.k softens a spring: long bridges should suggest a connection,
        // not actively shove two communities apart
        f = (d - (l.len || 80) * S) * 0.0055 * (l.k === undefined ? 1 : l.k);
        dx = dx / d * f; dy = dy / d * f;
        n.vx += dx; n.vy += dy;
        m.vx -= dx; m.vy -= dy;
      }

      // gentle pull to centre + pointer repulsion + integrate
      for (i = 0; i < nodes.length; i++) {
        n = nodes[i];
        if (n.hx !== undefined) {
          n.vx += (n.hx * W - n.x) * 0.011;
          n.vy += (n.hy * H - n.y) * 0.011;
        } else {
          n.vx += (W / 2 - n.x) * 0.0011;
          n.vy += (H / 2 - n.y) * 0.0020;
        }

        if (pointer.x !== null && n !== dragging) {
          dx = n.x - pointer.x; dy = n.y - pointer.y;
          d = Math.sqrt(dx * dx + dy * dy) || 0.01;
          if (d < 120) {
            f = (120 - d) * 0.028;
            n.vx += dx / d * f; n.vy += dy / d * f;
          }
        }

        if (G.drift && ticks % 150 === 0) {
          n.vx += rnd(-0.12, 0.12); n.vy += rnd(-0.12, 0.12);
        }

        if (n === dragging) { n.vx = 0; n.vy = 0; continue; }
        if (n.hub) { n.vx *= 0.5; n.vy *= 0.5; }

        n.vx *= 0.86; n.vy *= 0.86;
        n.x += n.vx; n.y += n.vy;

        var pad = n.r + 6;
        if (n.x < pad) { n.x = pad; n.vx *= -0.4; }
        if (n.x > W - pad) { n.x = W - pad; n.vx *= -0.4; }
        if (n.y < pad) { n.y = pad; n.vy *= -0.4; }
        if (n.y > H - pad) { n.y = H - pad; n.vy *= -0.4; }
      }

      // cooperation contagion over group interactions
      if (G.dynamic && ticks % 42 === 0) {
        var changed = [];
        G.faces.forEach(function (face) {
          var coop = face.n.filter(function (k) { return nodes[k].state; }).length;
          if (coop / face.n.length >= 0.5) {
            face.n.forEach(function (k) { if (!nodes[k].state) changed.push(k); });
          }
        });
        changed.forEach(function (k) { nodes[k].state = 1; });
        var all = nodes.every(function (x) { return x.state; });
        if (all || (changed.length === 0 && ticks % 210 === 0)) {
          nodes.forEach(function (x) { x.state = 0; });
          nodes[Math.floor(rnd(0, nodes.length))].state = 1;
        }
      }
    }

    /* --- drawing --- */
    function draw() {
      ctx.clearRect(0, 0, W, H);
      var nodes = G.nodes;

      // faces (group interactions)
      G.faces.forEach(function (face) {
        var pts = face.n.map(function (k) { return nodes[k]; });
        var cx = 0, cy = 0;
        pts.forEach(function (p) { cx += p.x; cy += p.y; });
        cx /= pts.length; cy /= pts.length;
        pts = pts.slice().sort(function (a, b) {
          return Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx);
        });
        var lit = pts.filter(function (p) { return p.state; }).length / pts.length;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.closePath();
        ctx.fillStyle = alpha(C.tones[face.tone], 0.07 + lit * 0.17);
        ctx.fill();
      });

      // edges
      G.links.forEach(function (l) {
        var n = nodes[l.a], m = nodes[l.b];
        var hot = hovered && (n === hovered || m === hovered);
        ctx.beginPath();
        ctx.moveTo(n.x, n.y);
        ctx.lineTo(m.x, m.y);
        ctx.strokeStyle = hot ? alpha(C.tones[hovered.tone], 0.8)
                              : alpha(C.ink2, l.faint ? 0.22 : 0.45);
        ctx.lineWidth = hot ? (l.w || 1) + 0.7 : (l.w || 1);
        ctx.stroke();
      });

      // nodes
      nodes.forEach(function (n) {
        var tone = C.tones[n.tone];
        var isHot = n === hovered;
        var filled = !G.dynamic || n.state;

        if (isHot) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r + 6, 0, 6.284);
          ctx.fillStyle = alpha(tone, 0.16);
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, 6.284);
        if (filled) {
          ctx.fillStyle = tone;
          ctx.fill();
        } else {
          ctx.fillStyle = C.surface;
          ctx.fill();
          ctx.strokeStyle = alpha(tone, 0.85);
          ctx.lineWidth = 1.8;
          ctx.stroke();
        }

        if (n.hub) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r + 3.5, 0, 6.284);
          ctx.strokeStyle = alpha(tone, 0.45);
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }
      });

      // hub label, always on
      if (G.labels) {
        var hub = nodes[0];
        if (hub && hub.hub) {
          ctx.font = '600 12px "Space Grotesk", system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = C.ink;
          ctx.fillText(hub.label, hub.x, hub.y + hub.r + 16);
        }
      }
    }

    function frame() {
      if (!visible) { raf = null; return; }
      ticks++;
      if (!reduced || ticks < 160) step();
      draw();
      raf = requestAnimationFrame(frame);
    }

    function start() {
      if (!raf) raf = requestAnimationFrame(frame);
    }

    /* --- interaction --- */
    function nodeAt(x, y) {
      var best = null, bestD = Infinity;
      G.nodes.forEach(function (n) {
        var d = Math.hypot(n.x - x, n.y - y);
        if (d < n.r + 9 && d < bestD) { best = n; bestD = d; }
      });
      return best;
    }

    function showTip(n) {
      if (!tip) return;
      if (!n || !n.label) { tip.setAttribute('data-show', 'false'); return; }
      tip.innerHTML = n.label + (n.sub ? '<span class="tip-sub">' + n.sub + '</span>' : '');
      tip.style.left = n.x + 'px';
      tip.style.top = n.y - n.r + 'px';
      tip.setAttribute('data-show', 'true');
    }

    function localPoint(e) {
      var r = canvas.getBoundingClientRect();
      var t = e.touches ? e.touches[0] : e;
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    }

    canvas.addEventListener('pointermove', function (e) {
      var p = localPoint(e);
      pointer.x = p.x; pointer.y = p.y;
      if (dragging) {
        dragging.x = p.x; dragging.y = p.y;
        return;
      }
      var n = nodeAt(p.x, p.y);
      if (n !== hovered) {
        hovered = n;
        showTip(n && n.label ? n : null);
        canvas.style.cursor = n ? (n.href ? 'pointer' : 'grab') : (G.clickable ? 'pointer' : 'default');
      } else if (n) {
        showTip(n.label ? n : null);
      }
      start();
    });

    canvas.addEventListener('pointerdown', function (e) {
      var p = localPoint(e);
      dragging = nodeAt(p.x, p.y);
      if (dragging) {
        canvas.setPointerCapture(e.pointerId);
        dragging.dragStart = { x: p.x, y: p.y };
      }
      start();
    });

    canvas.addEventListener('pointerup', function (e) {
      if (dragging && dragging.href && dragging.dragStart) {
        var p = localPoint(e);
        if (Math.hypot(p.x - dragging.dragStart.x, p.y - dragging.dragStart.y) < 5) {
          window.open(dragging.href, '_blank', 'noopener');
        }
      }
      dragging = null;
    });

    canvas.addEventListener('pointerleave', function () {
      pointer.x = pointer.y = null;
      hovered = null; dragging = null;
      showTip(null);
    });

    if (shuffleBtn) {
      shuffleBtn.addEventListener('click', function () {
        modeIdx = (modeIdx + 1) % MODE_KEYS.length;
        load(MODE_KEYS[modeIdx]);
        start();
      });
    }

    window.addEventListener('themechange', function () {
      C = readColours();
      draw();
    });

    var ro = new ResizeObserver(function () {
      var prevW = W, prevH = H;
      resize();
      if (G && prevW > 0) {
        var sx = W / prevW, sy = H / prevH;
        G.nodes.forEach(function (n) { n.x *= sx; n.y *= sy; });
      }
      if (G) draw();
    });
    ro.observe(canvas);

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) start();
      }, { threshold: 0.05 }).observe(canvas);
    }

    resize();
    // ?net=papers etc. forces a mode — handy for checking each one
    var forced = (location.search.match(/[?&]net=([a-z]+)/) || [])[1];
    modeIdx = MODE_KEYS.indexOf(forced);
    if (modeIdx < 0) modeIdx = Math.floor(Math.random() * MODE_KEYS.length);
    load(MODE_KEYS[modeIdx]);
    start();
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-network]').forEach(init);
  });
})();
