/* particles.js — the drifting particle-network background.

   Same idea as vincentgarreau.com/particles.js: points drift across the
   viewport and draw a line to every neighbour within a threshold distance,
   so the "network" is a proximity graph that re-forms continuously. The
   cursor pulls extra links toward whatever is near it.

   Written from scratch rather than vendoring the original library because:
     - the site ships no third-party runtime code, and the original is ~25 KB
     - its colours are baked into a JSON config, whereas this reads the CSS
       custom properties, so it follows all four palettes and light/dark for
       free (and re-reads them on `themechange`)
     - it never stopped animating; this pauses when the tab is hidden and
       honours prefers-reduced-motion

   Config comes from data- attributes on the host element, which build.py
   fills in from `particles:` in content/site.md. Nothing here needs editing
   to retune it. */

(function () {
  'use strict';

  var host = document.querySelector('[data-particles]');
  if (!host) return;
  var canvas = host.querySelector('canvas');
  if (!canvas || !canvas.getContext) return;

  var ctx = canvas.getContext('2d');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var cfg = {
    count: parseFloat(host.dataset.count) || 0,          // 0 = derive from area
    linkDist: parseFloat(host.dataset.linkDistance) || 132,
    speed: parseFloat(host.dataset.speed) || 0.32,
    grab: host.dataset.grab !== 'off'
  };

  var W = 0, H = 0, dpr = 1, parts = [], raf = null;
  var pointer = { x: null, y: null };
  var C = readColours();

  function rnd(a, b) { return a + Math.random() * (b - a); }

  function readColours() {
    var s = getComputedStyle(document.documentElement);
    var get = function (n) { return s.getPropertyValue(n).trim(); };
    return {
      tones: [get('--a1'), get('--a2'), get('--a3'), get('--a4'), get('--ink-2')],
      line: get('--ink-2')
    };
  }

  /* CSS colour -> rgba() at a given alpha, resolved through the 2d context. */
  var probe = document.createElement('canvas').getContext('2d');
  function alpha(colour, a) {
    probe.fillStyle = '#000';
    probe.fillStyle = colour;
    var c = probe.fillStyle;
    if (c[0] === '#') {
      var n = parseInt(c.slice(1), 16);
      return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    }
    return c.replace(/^rgb\(/, 'rgba(').replace(/\)$/, ',' + a + ')');
  }

  // Scale the population to the viewport so a laptop and a 4K monitor get a
  // comparable density rather than a comparable count.
  function density() {
    return Math.round(Math.min(120, Math.max(22, (W * H) / 12000)));
  }

  function build() {
    var n = cfg.count || density();
    parts = [];
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.283;
      var s = cfg.speed * rnd(0.45, 1.5);
      parts.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        r: rnd(1.1, 2.9),
        tone: Math.floor(rnd(0, 5))
      });
    }
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var r = host.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function step() {
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      p.x += p.vx;
      p.y += p.vy;
      // wrap rather than bounce: bouncing makes particles pile up along the
      // edges, wrapping keeps the field evenly mixed
      if (p.x < -10) p.x = W + 10; else if (p.x > W + 10) p.x = -10;
      if (p.y < -10) p.y = H + 10; else if (p.y > H + 10) p.y = -10;
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    var max = cfg.linkDist, max2 = max * max;

    // proximity links, faded by distance
    for (var i = 0; i < parts.length; i++) {
      var a = parts[i];
      for (var j = i + 1; j < parts.length; j++) {
        var b = parts[j];
        var dx = a.x - b.x, dy = a.y - b.y;
        var d2 = dx * dx + dy * dy;
        if (d2 > max2) continue;
        var t = 1 - Math.sqrt(d2) / max;
        ctx.strokeStyle = alpha(C.line, t * 0.42);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    // cursor "grab": link the pointer to whatever is close to it
    if (cfg.grab && pointer.x !== null) {
      var gmax = max * 1.35;
      for (i = 0; i < parts.length; i++) {
        var p = parts[i];
        var gx = p.x - pointer.x, gy = p.y - pointer.y;
        var gd = Math.sqrt(gx * gx + gy * gy);
        if (gd > gmax) continue;
        ctx.strokeStyle = alpha(C.tones[0], (1 - gd / gmax) * 0.5);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pointer.x, pointer.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
    }

    for (i = 0; i < parts.length; i++) {
      var q = parts[i];
      ctx.fillStyle = alpha(C.tones[q.tone], 0.8);
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.r, 0, 6.284);
      ctx.fill();
    }
  }

  function frame() {
    step();
    draw();
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (raf || reduced) return;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    if (raf) { cancelAnimationFrame(raf); raf = null; }
  }

  // The pointer layer is pointer-events:none, so track on window. Coordinates
  // are viewport-relative and the host is position:fixed, so they line up.
  if (cfg.grab) {
    window.addEventListener('pointermove', function (e) {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
    }, { passive: true });
    window.addEventListener('pointerleave', function () {
      pointer.x = pointer.y = null;
    });
  }

  window.addEventListener('themechange', function () { C = readColours(); if (reduced) draw(); });

  // don't animate an invisible tab
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop(); else start();
  });

  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { resize(); build(); if (reduced) draw(); }, 150);
  }, { passive: true });

  resize();
  build();
  if (reduced) draw(); else start();
})();
