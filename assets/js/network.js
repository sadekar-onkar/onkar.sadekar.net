/* network.js — the network figures.

   Three things live here:

     papers      publications.html — a bipartite graph of papers and the
                 concepts they use. An edge means "this paper uses this
                 concept", so the link is labelled rather than inferred.
     collab      collaborators.html — co-authors around a hub. Clicking a
                 person filters the list below to the papers you share.
     ambient     index.html — a quiet graph drifting behind the hero. Purely
                 decorative, no labels, no interaction.

   IMPORTANT: the papers and collaborator graphs are built by reading the
   page's own HTML. publications.html and collaborators.html are the single
   source of truth — there is no data array here to keep in sync. Add a paper
   to the page and the graph picks it up.

   Plain canvas, no libraries. Colours come from the CSS custom properties, so
   every palette and light/dark switch is followed automatically. The layout
   settles and then stops: a static graph is what makes hovering and clicking
   feel solid, and it keeps the page off the CPU. There is deliberately no
   cursor-repulsion force — nodes that flee the pointer cannot be clicked. */

(function () {
  'use strict';

  var CONCEPT_LABEL = {
    'higher-order': 'Higher-order networks',
    'evolutionary-games': 'Evolutionary game theory',
    'public-goods': 'Public goods games',
    'cooperation': 'Cooperation',
    'collective-behaviour': 'Collective behaviour',
    'cultural-evolution': 'Cultural evolution',
    'empirical-data': 'Empirical data',
    'sports': 'Sports analytics',
    'epidemics': 'Epidemic spreading',
    'stochastic-resetting': 'Stochastic resetting',
    'nonequilibrium': 'Nonequilibrium physics',
    'review': 'Review & synthesis'
  };

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

  /* --------------------------------------------------- papers x concepts -- */

  function buildPapers() {
    var pubs = [].slice.call(document.querySelectorAll('.pub[data-concepts]'));
    if (!pubs.length) return null;

    var nodes = [], links = [], conceptIndex = {}, order = [];

    // concept nodes first, so they keep stable tones
    pubs.forEach(function (el) {
      (el.dataset.concepts || '').split(/\s+/).forEach(function (c) {
        if (c && !(c in conceptIndex)) { conceptIndex[c] = -1; order.push(c); }
      });
    });
    order.forEach(function (c, i) {
      conceptIndex[c] = nodes.length;
      nodes.push({
        x: Math.cos(i / order.length * 6.283) * 0.55,
        y: Math.sin(i / order.length * 6.283) * 0.55,
        vx: 0, vy: 0, r: 0, tone: i % 5,
        kind: 'concept', key: c,
        label: CONCEPT_LABEL[c] || c, degree: 0
      });
    });

    pubs.forEach(function (el, i) {
      var a = el.querySelector('.pub-title a');
      var venue = el.querySelector('.pub-venue');
      var cs = (el.dataset.concepts || '').split(/\s+/).filter(Boolean);
      var idx = nodes.length;
      nodes.push({
        x: Math.cos(i / pubs.length * 6.283) * 1.0 + rnd(-0.1, 0.1),
        y: Math.sin(i / pubs.length * 6.283) * 1.0 + rnd(-0.1, 0.1),
        vx: 0, vy: 0, r: 5.5,
        kind: 'paper',
        label: truncate((a ? a.textContent : '').trim(), 64),
        sub: venue ? venue.textContent.trim() : '',
        href: a ? a.getAttribute('href') : null,
        el: el,
        tone: cs.length ? nodes[conceptIndex[cs[0]]].tone : 3
      });
      cs.forEach(function (c) {
        var ci = conceptIndex[c];
        nodes[ci].degree++;
        links.push({ a: ci, b: idx, len: 64, w: 1.1, concept: c });
      });
    });

    // concept nodes are sized by how many papers hang off them
    nodes.forEach(function (n) {
      if (n.kind === 'concept') {
        n.r = 6 + Math.min(n.degree, 8) * 1.5;
        n.sub = n.degree + (n.degree === 1 ? ' paper' : ' papers');
      }
    });

    return {
      nodes: nodes, links: links,
      labelConcepts: true,
      caption: '<b>Papers and the ideas they share.</b> Large nodes are concepts, small ones are papers; ' +
               'an edge means the paper uses that concept. Hover to follow one, click a paper to read it.'
    };
  }

  /* -------------------------------------------------------- collaborators -- */

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
      var count = el.querySelectorAll('.collab-papers li').length;
      var papers = [].slice.call(el.querySelectorAll('.collab-papers li')).map(function (li) {
        return (li.textContent || '').trim();
      });
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
      links.push({ a: 0, b: idx, len: 72 + (8 - Math.min(count, 8)) * 8,
                   w: 0.8 + Math.min(count, 8) * 0.32 });
      papers.forEach(function (t) { (byPaper[t] = byPaper[t] || []).push(idx); });
    });

    // two people are linked when they appear on the same paper
    Object.keys(byPaper).forEach(function (t) {
      var group = byPaper[t];
      for (var i = 0; i < group.length; i++) {
        for (var j = i + 1; j < group.length; j++) {
          links.push({ a: group[i], b: group[j], len: 88, w: 0.6, faint: true, k: 0.4 });
        }
      }
    });

    return {
      nodes: nodes, links: links, labelHub: true, selectable: true,
      caption: '<b>Who I work with.</b> Each node is a co-author, sized by how many papers we share. ' +
               'Click one to see those papers.'
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

  var MODES = { papers: buildPapers, collab: buildCollab, ambient: buildAmbient };

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
    var dragging = null, hovered = null, selected = null;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      var rect = canvas.getBoundingClientRect();
      W = rect.width; H = rect.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function load() {
      G = MODES[mode] ? MODES[mode]() : null;
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
          if (n.kind === 'concept' && m.kind === 'concept') f *= 3.2;
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
      if (focus) {
        near = {};
        G.links.forEach(function (l) {
          if (nodes[l.a] === focus) near[l.b] = 1;
          if (nodes[l.b] === focus) near[l.a] = 1;
        });
      }

      G.links.forEach(function (l) {
        var n = nodes[l.a], m = nodes[l.b];
        var hot = focus && (n === focus || m === focus);
        var dim = focus && !hot;
        ctx.beginPath();
        ctx.moveTo(n.x, n.y);
        ctx.lineTo(m.x, m.y);
        ctx.strokeStyle = hot ? alpha(C.tones[focus.tone], 0.85)
          : alpha(C.ink2, dim ? 0.08 : (l.faint ? 0.2 : (G.ambient ? 0.28 : 0.4)));
        ctx.lineWidth = hot ? (l.w || 1) + 0.8 : (l.w || 1);
        ctx.stroke();
      });

      nodes.forEach(function (n, i) {
        var tone = C.tones[n.tone];
        var hot = focus && (n === focus || (near && near[i]));
        var dim = focus && !hot;

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
      if (G.labelConcepts || G.labelHub) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.font = '600 11.5px "Space Grotesk", system-ui, sans-serif';

        var candidates = nodes.filter(function (n) {
          return n.kind === 'concept' || n.kind === 'hub';
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

    function showTip(n) {
      if (!tip) return;
      if (!n || !n.label) { tip.setAttribute('data-show', 'false'); return; }
      tip.innerHTML = n.label + (n.sub ? '<span class="tip-sub">' + n.sub + '</span>' : '');
      tip.style.left = n.x + 'px';
      tip.style.top = (n.y - n.r) + 'px';
      tip.setAttribute('data-show', 'true');
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

    if (!G || !G.ambient) {
      canvas.addEventListener('pointermove', function (e) {
        var p = localPoint(e);
        if (dragging) { dragging.x = p.x; dragging.y = p.y; start(); return; }
        var n = nodeAt(p.x, p.y);
        if (n !== hovered) {
          hovered = n;
          showTip(n);
          canvas.style.cursor = n ? (n.href || G.selectable ? 'pointer' : 'grab') : 'default';
          repaint();
        } else if (n) {
          showTip(n);
        }
      });

      canvas.addEventListener('pointerdown', function (e) {
        var p = localPoint(e);
        dragging = nodeAt(p.x, p.y);
        if (dragging) {
          canvas.setPointerCapture(e.pointerId);
          dragging.dragStart = p;
          start();
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
        }
        start();
      });

      canvas.addEventListener('pointerleave', function () {
        hovered = null; dragging = null;
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
      }
    });
    ro.observe(canvas);

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) start();
      }, { threshold: 0.02 }).observe(canvas);
    }

    resize();
    if (!load()) return;
    start();
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-network]').forEach(init);
  });
})();
