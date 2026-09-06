/* network.js — the network figures.

   Three modes live here:

     collab      collaborators.html — co-authors around a hub. Clicking a
                 person filters the list below to the papers you share.
     workshop    workshop.html — the person-person projection of the workshop
                 votes. Reads a JSON blob (see projection.js) rather than the
                 DOM, because its thresholding is interactive.
     ambient     a quiet graph drifting behind a hero. Purely decorative, no
                 labels, no interaction. Currently unused: the home page uses
                 particles.js instead.

   The collaborator graph is built by reading the page's own HTML, which
   build.py generates from content/publications.md. There is no data array
   here to keep in sync.

   The publications page uses a static bipartite SVG emitted by build.py
   instead — no physics, no JavaScript at all.

   Plain canvas, no libraries. Colours come from the CSS custom properties, so
   every palette and light/dark switch is followed automatically. The layout
   settles and then stops: a static graph is what makes hovering and clicking
   feel solid, and it keeps the page off the CPU. There is deliberately no
   cursor-repulsion force — nodes that flee the pointer cannot be clicked. */

(function () {
  'use strict';

  /* ------------------------------------------------------------- helpers -- */

  function rnd(a, b) { return a + Math.random() * (b - a); }

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

  /* Any CSS colour -> rgba() at the given alpha, resolved via canvas. */
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

  function truncate(s, n) {
    return s.length > n ? s.slice(0, n - 1).replace(/[\s,;:]+$/, '') + '…' : s;
  }

  /* -------------------------------------------------------- collaborators -- */

  /* Every link here carries a `.paper` ({title, href}) — there is no longer
     an "aggregate" edge. A person with N shared papers gets N parallel
     hub-person edges, one per paper; two co-authors on the same paper get
     one person-person edge for it. draw()/edgeControl() fan parallel edges
     out with a small perpendicular offset so each stays individually visible
     and hoverable. All .collab elements are read regardless of whether the
     "everyone, in full" list hides them (see the data-count='1' CSS rule) —
     the graph always has every collaborator, only the plain-text list omits
     one-paper people. */
  function buildCollab() {
    var people = [].slice.call(document.querySelectorAll('.collab[data-person]'));
    if (!people.length) return null;

    var me = document.querySelector('[data-hub-name]');
    var hubName = me ? me.getAttribute('data-hub-name') : 'Onkar Sadekar';

    var nodes = [{
      x: 0, y: 0, vx: 0, vy: 0, r: 12, tone: 0, hub: true,
      kind: 'hub', label: hubName
    }];
    var links = [], byPaper = {};

    people.forEach(function (el, i) {
      var papers = [].slice.call(el.querySelectorAll('.collab-papers li')).map(function (li) {
        return { title: (li.textContent || '').trim(), href: li.dataset.href || null };
      });
      var count = papers.length;
      var idx = nodes.length;
      nodes.push({
        x: Math.cos(i / people.length * 6.283) * rnd(0.7, 1),
        y: Math.sin(i / people.length * 6.283) * rnd(0.7, 1),
        vx: 0, vy: 0,
        r: 4.5 + Math.min(count, 8) * 1.05,
        tone: count >= 5 ? 0 : count >= 2 ? 1 : 3,
        kind: 'person',
        label: el.dataset.person,
        sub: count + (count === 1 ? ' paper' : ' papers') + ' together',
        el: el,
        href: el.dataset.url || null
      });
      var len = 72 + (8 - Math.min(count, 8)) * 8;
      papers.forEach(function (p, k) {
        // k divides the spring constant across the fan, so N parallel edges
        // pull the person about as hard as one edge used to — otherwise a
        // prolific co-author would get yanked in N times as fast.
        links.push({ a: 0, b: idx, len: len, w: 1.05, k: 1 / count,
                     paper: p, fan: k, fanCount: count });
        (byPaper[p.title] = byPaper[p.title] || []).push({ idx: idx, paper: p });
      });
    });

    // Two people are linked once per paper they actually share. Group first
    // by the (a, b) pair across ALL papers — not per paper — so fanCount is
    // "how many papers do these two specific people share", not "how many
    // co-authors were on this one paper".
    var pairs = {};
    Object.keys(byPaper).forEach(function (title) {
      var group = byPaper[title];
      for (var i = 0; i < group.length; i++) {
        for (var j = i + 1; j < group.length; j++) {
          var a = Math.min(group[i].idx, group[j].idx), b = Math.max(group[i].idx, group[j].idx);
          var key = a + '-' + b;
          (pairs[key] = pairs[key] || { a: a, b: b, papers: [] }).papers.push(group[i].paper);
        }
      }
    });
    Object.keys(pairs).forEach(function (key) {
      var pair = pairs[key], n = pair.papers.length;
      pair.papers.forEach(function (p, k) {
        links.push({ a: pair.a, b: pair.b, len: 88, w: 0.6, faint: true,
                     k: 0.4 / n, paper: p, fan: k, fanCount: n });
      });
    });

    return {
      nodes: nodes, links: links, labelHub: true, selectable: true,
      caption: '<b>Who I work with.</b> Every edge is a shared paper — hover or click one to see ' +
               'which. Click a person to list everything you share.'
    };
  }

  /* -------------------------------------------------------------- ambient -- */

  function buildAmbient() {
    var groups = 4, nodes = [], links = [];
    for (var g = 0; g < groups; g++) {
      var ang = (g / groups) * 6.283 + rnd(-0.3, 0.3);
      var per = 4 + Math.floor(rnd(0, 3));
      var hx = 0.5 + Math.cos(ang) * 0.33;
      var hy = 0.5 + Math.sin(ang) * 0.3;
      var base = nodes.length;
      for (var i = 0; i < per; i++) {
        var a2 = (i / per) * 6.283 + rnd(-0.3, 0.3);
        var nx = hx + Math.cos(a2) * rnd(0.04, 0.09);
        var ny = hy + Math.sin(a2) * rnd(0.08, 0.16);
        nodes.push({ x: (nx - 0.5) * 2, y: (ny - 0.5) * 2, vx: 0, vy: 0,
                     r: rnd(2.5, 5), tone: g % 5, hx: nx, hy: ny });
      }
      for (i = 0; i < per; i++) {
        for (var j = i + 1; j < per; j++) {
          if (Math.random() < 0.5) links.push({ a: base + i, b: base + j, len: 40 });
        }
      }
      if (g > 0) {
        links.push({ a: base + Math.floor(rnd(0, per)), b: Math.floor(rnd(0, base)),
                     len: 130, faint: true, k: 0.12 });
      }
    }
    return { nodes: nodes, links: links, ambient: true, rep: 0.18 };
  }

  /* ------------------------------------------------------------- workshop -- */

  /* The workshop projection: people linked by shared interests. Unlike collab,
     the data is not in the DOM as markup — it is a JSON blob emitted by
     build.py (or fetched live from the API right after a freeze), because the
     thresholding is interactive and needs the raw incidence data, not a
     rendered picture of one particular threshold.

     projection.js does all the maths. This only turns its output into nodes
     and links. Nothing here ever learns WHICH categories a pair shares — the
     tooltip gets a count, by design. */
  function buildWorkshop(figure) {
    var P = window.WorkshopProjection;
    if (!P) return null;

    var holder = document.getElementById(figure.dataset.netData || 'workshop-data');
    if (!holder) return null;

    var data;
    try { data = JSON.parse(holder.textContent || '{}'); } catch (e) { return null; }
    if (!data || !data.people || !data.people.length) return null;

    var opts = { method: 'jaccard', threshold: 0.4, alpha: 0.05 };
    var first = P.build(data, opts);

    var G = {
      nodes: first.nodes,
      links: [],
      selectable: true,
      labelKinds: ['person'],
      data: data,
      stats: first.stats,
      categories: first.categories
    };

    /* Re-thresholding must not relayout. The node objects are kept and only
       their links, community and colour are replaced, so dragging the slider
       morphs the picture the reader is already looking at instead of throwing
       it away and starting a new simulation from a fresh random ring. */
    G.rebuild = function (next) {
      if (next) {
        if (next.method) opts.method = next.method;
        if (next.threshold !== undefined) opts.threshold = next.threshold;
        if (next.alpha !== undefined) opts.alpha = next.alpha;
      }
      var res = P.build(data, opts);
      res.nodes.forEach(function (n, i) {
        var live = G.nodes[i];
        live.community = n.community;
        live.tone = n.tone;
        live.links = n.links;
      });
      G.links = res.links.map(function (l) {
        var a = G.nodes[l.a].label, b = G.nodes[l.b].label;
        return {
          a: l.a, b: l.b,
          w: l.w,
          len: 96,
          k: 0.55,
          shared: l.shared,
          tip: {
            label: a + '  &  ' + b,
            sub: l.shared + (l.shared === 1 ? ' shared category' : ' shared categories')
          }
        };
      });
      G.stats = res.stats;
      G.categories = res.categories;
      return res;
    };

    G.rebuild(opts);
    return G;
  }

  var MODES = { collab: buildCollab, ambient: buildAmbient, workshop: buildWorkshop };

  /* ------------------------------------------------------------- runtime -- */

  function init(figure) {
    var canvas = figure.querySelector('canvas');
    if (!canvas) return;

    var mode = figure.dataset.network || 'ambient';
    var captionEl = figure.querySelector('[data-net-caption]');
    var tip = figure.querySelector('[data-net-tip]');
    var panel = document.querySelector('[data-collab-panel]');

    var ctx = canvas.getContext('2d');
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var C = readColours();
    var W = 0, H = 0, dpr = 1;
    var G = null, raf = null, visible = true, ticks = 0;
    var dragging = null, hovered = null, selected = null, hoverEdge = null, downPoint = null;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      var rect = canvas.getBoundingClientRect();
      W = rect.width; H = rect.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function load() {
      /* A zero-sized canvas means the figure is hidden or not laid out yet.
         Building here would divide the layout by nothing and stack every node
         on one point, so wait to be called again from the ResizeObserver. */
      if (!W || !H) return false;
      G = MODES[mode] ? MODES[mode](figure) : null;
      if (!G) { figure.hidden = true; return false; }
      var sx = W * 0.40, sy = H * 0.40;
      G.nodes.forEach(function (n) { n.x = W / 2 + n.x * sx; n.y = H / 2 + n.y * sy; });
      if (G.nodes[0] && G.nodes[0].hub) { G.nodes[0].x = W / 2; G.nodes[0].y = H / 2; }
      var spacing = Math.min(Math.sqrt(W * H / G.nodes.length), H / 3.2);
      G.scale = Math.max(0.7, Math.min(2.0, spacing / 62));
      if (captionEl && G.caption) captionEl.innerHTML = G.caption;
      ticks = 0;
      return true;
    }

    /* --- physics --- */
    function step() {
      var nodes = G.nodes, links = G.links, i, j, n, m, dx, dy, d, f;
      var S = G.scale || 1, S2 = S * S;
      var rep = G.rep === undefined ? 1 : G.rep;

      for (i = 0; i < nodes.length; i++) {
        n = nodes[i];
        for (j = i + 1; j < nodes.length; j++) {
          m = nodes[j];
          dx = m.x - n.x; dy = m.y - n.y;
          d = Math.sqrt(dx * dx + dy * dy) || 0.01;
          if (d > 260 * S) continue;
          f = (1400 + (n.r + m.r) * 60) * S2 * rep / (d * d);
          // labelled hubs push each other harder so their captions have room
            dx /= d; dy /= d;
          n.vx -= dx * f; n.vy -= dy * f;
          m.vx += dx * f; m.vy += dy * f;
        }
      }

      for (i = 0; i < links.length; i++) {
        var l = links[i];
        n = nodes[l.a]; m = nodes[l.b];
        dx = m.x - n.x; dy = m.y - n.y;
        d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        f = (d - (l.len || 80) * S) * 0.0055 * (l.k === undefined ? 1 : l.k);
        dx = dx / d * f; dy = dy / d * f;
        n.vx += dx; n.vy += dy;
        m.vx -= dx; m.vy -= dy;
      }

      var energy = 0;
      for (i = 0; i < nodes.length; i++) {
        n = nodes[i];
        if (n.hx !== undefined) {
          n.vx += (n.hx * W - n.x) * 0.011;
          n.vy += (n.hy * H - n.y) * 0.011;
        } else {
          n.vx += (W / 2 - n.x) * 0.0011;
          n.vy += (H / 2 - n.y) * 0.0020;
        }

        if (n === dragging) { n.vx = 0; n.vy = 0; continue; }
        if (n.hub) { n.vx *= 0.5; n.vy *= 0.5; }

        n.vx *= 0.86; n.vy *= 0.86;
        n.x += n.vx; n.y += n.vy;
        energy += n.vx * n.vx + n.vy * n.vy;

        var pad = n.r + 6;
        if (n.x < pad) { n.x = pad; n.vx *= -0.4; }
        if (n.x > W - pad) { n.x = W - pad; n.vx *= -0.4; }
        if (n.y < pad) { n.y = pad; n.vy *= -0.4; }
        if (n.y > H - pad) { n.y = H - pad; n.vy *= -0.4; }
      }
      return energy;
    }

    /* --- drawing --- */
    function isActive(n) {
      return n === hovered || n === selected;
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      var nodes = G.nodes;
      var focus = hovered || selected;
      var near = null;
      if (focus || hoverEdge) {
        near = {};
        if (focus) {
          G.links.forEach(function (l) {
            if (nodes[l.a] === focus) near[l.b] = 1;
            if (nodes[l.b] === focus) near[l.a] = 1;
          });
        }
        if (hoverEdge) { near[hoverEdge.a] = 1; near[hoverEdge.b] = 1; }
      }

      G.links.forEach(function (l) {
        var n = nodes[l.a], m = nodes[l.b];
        var isEdgeHot = l === hoverEdge;
        var hot = isEdgeHot || (focus && (n === focus || m === focus));
        var dim = (focus || hoverEdge) && !hot;
        var ctrl = edgeControl(n, m, l);
        ctx.beginPath();
        ctx.moveTo(n.x, n.y);
        ctx.quadraticCurveTo(ctrl.cx, ctrl.cy, m.x, m.y);
        ctx.strokeStyle = hot
          ? alpha(C.tones[focus ? focus.tone : n.tone], 0.9)
          : alpha(C.ink2, dim ? 0.08 : (l.faint ? 0.2 : (G.ambient ? 0.28 : 0.4)));
        ctx.lineWidth = hot ? (l.w || 1) + 1.1 : (l.w || 1);
        ctx.stroke();
      });

      nodes.forEach(function (n, i) {
        var tone = C.tones[n.tone];
        var hot = (focus && n === focus) || (near && near[i]);
        var dim = (focus || hoverEdge) && !hot;

        if (isActive(n)) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r + 7, 0, 6.284);
          ctx.fillStyle = alpha(tone, 0.18);
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, 6.284);
        if (n.kind === 'paper') {
          // papers are hollow so the concept hubs read as the larger structure
          ctx.fillStyle = C.surface;
          ctx.fill();
          ctx.strokeStyle = alpha(tone, dim ? 0.25 : 0.9);
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          ctx.fillStyle = dim ? alpha(tone, 0.28) : (G.ambient ? alpha(tone, 0.75) : tone);
          ctx.fill();
        }

        if (n.hub) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r + 4, 0, 6.284);
          ctx.strokeStyle = alpha(tone, 0.45);
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }
      });

      /* Standing labels for the hubs. Labels are placed biggest-first and any
         that would collide with one already placed is dropped, so the picture
         never turns into overlapping text. The focused node always wins. */
      if (G.labelKinds || G.labelConcepts || G.labelHub) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.font = '600 11.5px "Space Grotesk", system-ui, sans-serif';

        var kinds = G.labelKinds || ['concept', 'hub'];
        var candidates = nodes.filter(function (n) {
          return kinds.indexOf(n.kind) !== -1;
        }).sort(function (a, b) {
          if (a === focus) return -1;
          if (b === focus) return 1;
          return b.r - a.r;
        });

        var boxes = [];
        candidates.forEach(function (n) {
          var w = ctx.measureText(n.label).width;
          var x = Math.min(Math.max(n.x, w / 2 + 6), W - w / 2 - 6);
          var y = n.y + n.r + 15;
          if (y > H - 4) y = n.y - n.r - 7;
          var box = { x0: x - w / 2 - 4, x1: x + w / 2 + 4, y0: y - 11, y1: y + 4 };
          var clash = boxes.some(function (b) {
            return !(box.x1 < b.x0 || box.x0 > b.x1 || box.y1 < b.y0 || box.y0 > b.y1);
          });
          if (clash && n !== focus) return;
          boxes.push(box);

          var dim = focus && n !== focus && !(near && near[nodes.indexOf(n)]);
          // halo in the panel colour keeps text legible where edges cross it
          ctx.lineWidth = 3.5;
          ctx.strokeStyle = C.surface;
          ctx.strokeText(n.label, x, y);
          ctx.fillStyle = dim ? alpha(C.ink2, 0.45) : C.ink;
          ctx.fillText(n.label, x, y);
        });
      }
    }

    function frame() {
      if (!visible) { raf = null; return; }
      ticks++;
      var energy = step();
      draw();
      if (!dragging && ticks > 90 && energy < 0.05) { raf = null; return; }
      raf = requestAnimationFrame(frame);
    }

    function start() {
      if (reduced) {
        for (var i = 0; i < 400; i++) step();
        draw();
        return;
      }
      if (!raf) raf = requestAnimationFrame(frame);
    }

    function repaint() { if (!raf) draw(); }

    /* --- interaction --- */
    function nodeAt(x, y) {
      var best = null, bestD = Infinity;
      G.nodes.forEach(function (n) {
        var d = Math.hypot(n.x - x, n.y - y);
        if (d < n.r + 10 && d < bestD) { best = n; bestD = d; }
      });
      return best;
    }

    /* Parallel edges between the same two nodes (a person sharing several
       papers with the hub, or two co-authors sharing several papers) fan out
       around a perpendicular offset so each one stays visible and separately
       hoverable, instead of drawing on top of each other. A single edge
       (fanCount 1) gets offset 0, which collapses the curve back to a
       straight line — quadraticCurveTo with its control point on the line
       IS a straight line, so this needs no special case. */
    function edgeControl(n, m, l) {
      var fan = l.fan || 0, fanCount = l.fanCount || 1;
      var mx = (n.x + m.x) / 2, my = (n.y + m.y) / 2;
      if (fanCount <= 1) return { cx: mx, cy: my };
      var dx = m.x - n.x, dy = m.y - n.y;
      var len = Math.hypot(dx, dy) || 1;
      var nx = -dy / len, ny = dx / len;
      var step = 7 * (G.scale || 1);
      var offset = (fan - (fanCount - 1) / 2) * step;
      return { cx: mx + nx * offset, cy: my + ny * offset };
    }

    function edgeAt(x, y) {
      var best = null, bestD = Infinity;
      G.links.forEach(function (l) {
        if (!l.paper && !l.tip) return; // only edges with something to say
        var n = G.nodes[l.a], m = G.nodes[l.b];
        var ctrl = edgeControl(n, m, l);
        for (var t = 0; t <= 1.0001; t += 0.1) {
          var mt = 1 - t;
          var px = mt * mt * n.x + 2 * mt * t * ctrl.cx + t * t * m.x;
          var py = mt * mt * n.y + 2 * mt * t * ctrl.cy + t * t * m.y;
          var d = Math.hypot(px - x, py - y);
          if (d < bestD) { bestD = d; best = l; }
        }
      });
      return bestD < 7 ? best : null;
    }

    function showTip(n) {
      if (!tip) return;
      if (!n || !n.label) { tip.setAttribute('data-show', 'false'); return; }
      /* Built as text nodes, not innerHTML. Collaborator names come from
         publications.md and are safe, but workshop labels round-trip through a
         database and an admin form before they land here, and a tooltip is no
         place to be executing whatever came back. */
      tip.textContent = n.label;
      if (n.sub) {
        var subEl = document.createElement('span');
        subEl.className = 'tip-sub';
        subEl.textContent = n.sub;
        tip.appendChild(subEl);
      }
      tip.setAttribute('data-show', 'true');
      // Measure, then clamp so the tip never gets clipped by the figure's
      // rounded-corner overflow:hidden when a node sits near an edge of the
      // canvas — this is what "hover doesn't work near the edge" turned out
      // to be: the highlight was firing fine, only the tooltip was invisible.
      var tw = tip.offsetWidth, th = tip.offsetHeight, pad = 6;
      var x = Math.min(Math.max(n.x, tw / 2 + pad), W - tw / 2 - pad);
      var above = (n.y - (n.r || 0) - th - 10) >= pad;
      tip.classList.toggle('tip-below', !above);
      var y = above ? (n.y - (n.r || 0)) : Math.min(n.y + (n.r || 0) + 4, H - th - pad);
      tip.style.left = x + 'px';
      tip.style.top = y + 'px';
    }

    function localPoint(e) {
      var r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    function selectPerson(n) {
      selected = n;
      if (!panel) return;
      if (!n) { panel.innerHTML = ''; panel.hidden = true; return; }
      var link = n.href
        ? ' <a class="pub-link" href="' + n.href + '">profile &#8599;</a>'
        : '';
      panel.innerHTML =
        '<div class="collab-panel-head"><h3>' + n.label + '</h3>' + link +
        '<button class="netfig-btn" type="button" data-collab-clear>clear</button></div>' +
        (n.el ? n.el.querySelector('.collab-papers').outerHTML : '');
      panel.hidden = false;
      var clear = panel.querySelector('[data-collab-clear]');
      if (clear) {
        clear.addEventListener('click', function () { selectPerson(null); repaint(); });
      }
    }

    function tipForEdge(edge) {
      var ctrl = edgeControl(G.nodes[edge.a], G.nodes[edge.b], edge);
      var info = edge.tip || { label: edge.paper.title,
                               sub: edge.paper.href ? 'Click to open' : '' };
      return { x: ctrl.cx, y: ctrl.cy, r: 0, label: info.label, sub: info.sub };
    }

    if (!G || !G.ambient) {
      canvas.addEventListener('pointermove', function (e) {
        var p = localPoint(e);
        if (dragging) { dragging.x = p.x; dragging.y = p.y; start(); return; }
        var n = nodeAt(p.x, p.y);
        var edge = n ? null : edgeAt(p.x, p.y);
        if (n !== hovered || edge !== hoverEdge) {
          hovered = n;
          hoverEdge = edge;
          if (n) showTip(n);
          else if (edge) showTip(tipForEdge(edge));
          else showTip(null);
          canvas.style.cursor = n ? (n.href || G.selectable ? 'pointer' : 'grab')
            : edge ? (edge.paper && edge.paper.href ? 'pointer' : 'default') : 'default';
          repaint();
        } else if (n) {
          showTip(n);
        } else if (edge) {
          showTip(tipForEdge(edge));
        }
      });

      canvas.addEventListener('pointerdown', function (e) {
        var p = localPoint(e);
        dragging = nodeAt(p.x, p.y);
        if (dragging) {
          canvas.setPointerCapture(e.pointerId);
          dragging.dragStart = p;
          // Touch has no hover, so pointermove never shows a tip before the
          // tap fires — show it the instant the finger lands instead.
          if (e.pointerType === 'touch') { showTip(dragging); repaint(); }
          start();
        } else {
          downPoint = p;
          if (e.pointerType === 'touch') {
            var edge = edgeAt(p.x, p.y);
            if (edge) { showTip(tipForEdge(edge)); repaint(); }
          }
        }
      });

      canvas.addEventListener('pointerup', function (e) {
        var n = dragging;
        dragging = null;
        if (n && n.dragStart) {
          var p = localPoint(e);
          var moved = Math.hypot(p.x - n.dragStart.x, p.y - n.dragStart.y);
          if (moved < 5) {
            // a click, not a drag
            if (G.selectable && n.kind === 'person') { selectPerson(n); repaint(); }
            else if (n.href) { window.open(n.href, '_blank', 'noopener'); }
          }
        } else if (downPoint) {
          var p2 = localPoint(e);
          var moved2 = Math.hypot(p2.x - downPoint.x, p2.y - downPoint.y);
          if (moved2 < 5) {
            var edge = edgeAt(p2.x, p2.y);
            if (edge && edge.paper && edge.paper.href) window.open(edge.paper.href, '_blank', 'noopener');
          }
          downPoint = null;
        }
        start();
      });

      canvas.addEventListener('pointerleave', function () {
        hovered = null; dragging = null; hoverEdge = null; downPoint = null;
        showTip(null);
        repaint();
      });
    }

    window.addEventListener('themechange', function () { C = readColours(); repaint(); });

    var ro = new ResizeObserver(function () {
      var prevW = W, prevH = H;
      resize();
      if (G && prevW > 0) {
        var sx = W / prevW, sy = H / prevH;
        G.nodes.forEach(function (n) { n.x *= sx; n.y *= sy; });
        start();
      } else if (!G && W > 0 && !figure.hidden) {
        /* The canvas has just been given a size for the first time — a figure
           that was display:none or hidden when the script ran. Build now. */
        if (load()) start();
      }
    });
    ro.observe(canvas);

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) start();
      }, { threshold: 0.02 }).observe(canvas);
    }

    /* Both hooks are published BEFORE the first load, because the workshop
       figure legitimately starts empty: on the day, the page is deployed with
       a placeholder and the real data arrives from the API a moment later.
       A figure that failed to load must still be revivable. */

    /* Re-read the data source and rebuild from scratch.
       Order matters: a hidden figure measures 0x0, and load() lays the nodes
       out relative to the canvas size — so unhide first, measure second, and
       only then build, or every node lands on the same point. */
    figure.netReload = function () {
      hovered = selected = hoverEdge = dragging = null;
      showTip(null);
      figure.hidden = false;
      resize();
      if (!load()) { figure.hidden = true; return false; }
      start();
      return true;
    };

    /* Re-threshold in place: same nodes, same positions, new edges. Resetting
       `ticks` lets the simulation resume so the layout can relax into the new
       edge set — and then stop again, as it should. */
    figure.netUpdate = function (opts) {
      if (!G || !G.rebuild) return null;
      var res = G.rebuild(opts);
      hovered = selected = hoverEdge = null;
      showTip(null);
      ticks = 0;
      start();
      return res;
    };

    resize();
    if (!load()) return;
    start();
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-network]').forEach(init);
  });
})();
