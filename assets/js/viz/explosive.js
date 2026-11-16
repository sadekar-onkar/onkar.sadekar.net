/* Explosive cooperation in social dilemmas on higher-order networks
   (Civilini, Sadekar, Battiston, Gómez-Gardeñes, Latora — PRL 132, 167401).

   Left: the paper's mean-field bifurcation diagram, exact.
       pi_C - pi_D = -rho^2 c delta + rho (c delta - b - 2S) + S,
       a = 2(G - W),  b = T - S - 1,  c = a + b
   Right: a well-mixed population playing that game, agent by agent: each of a
   player's k = 20 games is a three-player game with probability delta and a
   two-player game otherwise, and strategies are copied with the Fermi rule
   (w = 1/k). T = 1.5 and S = -0.5 as in the paper. */

(function () {
  'use strict';

  var T = 1.5, S = -0.5, K = 20, W3 = 0;   // W3: defector's payoff against one C and one D

  function theory(a, delta) {
    var b = T - S - 1, c = a + b;
    var dc = (b + Math.sqrt(-4 * S * (b + S))) / c;
    var disc = Math.pow(c * delta - b, 2) + 4 * S * (b + S);
    if (delta < dc || disc < 0) return { dc: dc, lo: null, hi: null };
    var r = Math.sqrt(disc), m = c * delta - b - 2 * S;
    return { dc: dc, lo: (m - r) / (2 * c * delta), hi: (m + r) / (2 * c * delta) };
  }

  function makeModel(N, rand) {
    rand = rand || Math.random;
    var s = new Uint8Array(N), m = { s: s, N: N, a: 5, delta: 0.2, nC: 0 };
    m.seed = function (rho) {
      var n = Math.round(rho * N), i;
      for (i = 0; i < N; i++) s[i] = i < n ? 1 : 0;
      for (i = N - 1; i > 0; i--) {              // shuffle so the picture is not striped
        var j = Math.floor(rand() * (i + 1)), t = s[i]; s[i] = s[j]; s[j] = t;
      }
      m.nC = n;
    };
    function other(i) { var j = Math.floor(rand() * (N - 1)); return j >= i ? j + 1 : j; }
    function payoff(i) {
      var G = W3 + m.a / 2, p = 0, me = s[i];
      for (var g = 0; g < K; g++) {
        if (rand() < m.delta) {
          var n = s[other(i)] + s[other(i)];     // cooperators among the other two
          p += me ? (n === 2 ? 1 : n === 1 ? G : S) : (n === 2 ? T : n === 1 ? W3 : 0);
        } else {
          var o = s[other(i)];
          p += me ? (o ? 1 : S) : (o ? T : 0);
        }
      }
      return p;
    }
    m.step = function (n) {
      for (var q = 0; q < n; q++) {
        var f = Math.floor(rand() * N), mo = other(f);
        if (s[f] === s[mo]) continue;
        if (rand() < 1 / (1 + Math.exp(-(payoff(mo) - payoff(f)) / K))) {
          m.nC += s[mo] - s[f];
          s[f] = s[mo];
        }
      }
    };
    m.rho = function () { return m.nC / N; };
    return m;
  }

  PaperViz.register('explosive', function (v) {
    var COLS = 30, N = COLS * COLS;
    var model = makeModel(N), trace = [];
    var ctl = v.controls();

    function reseed() { model.seed(rho0.value); trace = []; cv.redraw(); say(); loop.kick(); }

    var delta = v.slider(ctl, { label: 'Three-player games, δ', min: 0, max: 1, step: 0.01, value: 0.5,
      onInput: function (x) { model.delta = x; cv.redraw(); say(); } });
    var rho0 = v.slider(ctl, { label: 'Cooperators at the start', min: 0.02, max: 0.98, step: 0.01, value: 0.6,
      fmt: function (x) { return Math.round(x * 100) + '%'; }, onInput: reseed });
    var aS = v.slider(ctl, { label: 'Group payoff edge, a', min: 2, max: 8, step: 0.1, value: 5,
      fmt: function (x) { return x.toFixed(1); }, onInput: function (x) { model.a = x; cv.redraw(); say(); } });
    var btns = v.el('div', 'viz-actions'); ctl.appendChild(btns);

    var hit = null;   // the plot rectangle and scales, for clicks

    var cv = v.canvas({
      height: function (w) { return w >= 620 ? 350 : 640; },
      label: 'Left: fraction of cooperators at equilibrium against the share of three-player games. ' +
             'Right: a population of 900 players, each drawn as a dot.',
      draw: function (ctx, w, h, c) {
        var parts = v.split(w, h, 0.56), L = v.inset(parts[0], 44, 26, 12, 40), R = parts[1];
        var th = theory(model.a, model.delta), rho = model.rho(), i;

        /* ---- bifurcation diagram ---- */
        v.title(ctx, 'Where the population ends up', parts[0].x, parts[0].y);
        var ax = v.axes(ctx, L, { xmin: 0, xmax: 1, ymin: 0, ymax: 1,
          xticks: [0, 0.25, 0.5, 0.75, 1], yticks: [0, 0.5, 1],
          xfmt: function (t) { return t.toFixed(2).replace(/0$/, '').replace(/\.$/, ''); },
          yfmt: function (t) { return Math.round(t * 100) + '%'; },
          xlabel: 'share of three-player games, δ', ylabel: 'cooperators', ypad: 36 });
        hit = { r: L, ax: ax };

        var dc = th.dc, steps = 120, d, t2;
        if (dc < 1) {
          /* basin of the cooperative state: everything above the unstable branch */
          ctx.beginPath(); ctx.moveTo(ax.X(dc), ax.Y(theory(model.a, dc + 1e-9).hi || 0.5));
          for (i = 0; i <= steps; i++) { d = dc + (1 - dc) * i / steps; t2 = theory(model.a, d + 1e-9); ctx.lineTo(ax.X(d), ax.Y(t2.hi)); }
          for (i = steps; i >= 0; i--) { d = dc + (1 - dc) * i / steps; t2 = theory(model.a, d + 1e-9); ctx.lineTo(ax.X(d), ax.Y(t2.lo)); }
          ctx.closePath(); ctx.fillStyle = v.alpha(c.a2, 0.13); ctx.fill();
          /* unstable branch: the critical mass */
          ctx.beginPath(); ctx.setLineDash([5, 4]);
          for (i = 0; i <= steps; i++) { d = dc + (1 - dc) * i / steps; t2 = theory(model.a, d + 1e-9); if (i) ctx.lineTo(ax.X(d), ax.Y(t2.lo)); else ctx.moveTo(ax.X(d), ax.Y(t2.lo)); }
          ctx.strokeStyle = c.ink2; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
          /* stable cooperative branch */
          ctx.beginPath();
          for (i = 0; i <= steps; i++) { d = dc + (1 - dc) * i / steps; t2 = theory(model.a, d + 1e-9); if (i) ctx.lineTo(ax.X(d), ax.Y(t2.hi)); else ctx.moveTo(ax.X(d), ax.Y(t2.hi)); }
          ctx.strokeStyle = c.a2; ctx.lineWidth = 2.5; ctx.stroke();
          /* the jump */
          ctx.beginPath(); ctx.setLineDash([2, 3]); ctx.moveTo(ax.X(dc), ax.Y(0)); ctx.lineTo(ax.X(dc), ax.Y(0.5));
          ctx.strokeStyle = c.a2; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
          v.label(ctx, 'tipping point δc = ' + dc.toFixed(2), ax.X(dc) + (dc > 0.6 ? -6 : 6), ax.Y(0.07),
            { align: dc > 0.6 ? 'right' : 'left', colour: c.ink2, size: 10.5, mono: true });
          var mid = Math.min(0.97, dc + (1 - dc) * 0.55);
          v.label(ctx, 'cooperation holds', ax.X(mid), ax.Y(theory(model.a, mid).hi) - 11, { align: 'center', colour: c.ink });
          v.label(ctx, 'critical mass needed', ax.X(mid), ax.Y(theory(model.a, mid).lo) - 12, { align: 'center', colour: c.ink2, halo: 'rgba(0,0,0,0)' });
        }
        /* full defection is always stable */
        ctx.beginPath(); ctx.moveTo(ax.X(0), ax.Y(0) - 1); ctx.lineTo(ax.X(1), ax.Y(0) - 1);
        ctx.strokeStyle = c.a1; ctx.lineWidth = 2.5; ctx.stroke();
        v.label(ctx, 'everyone defects', ax.X(0.02), ax.Y(0) - 12, { colour: c.ink });

        /* where we are now */
        var px = ax.X(model.delta), py = ax.Y(rho);
        ctx.beginPath(); ctx.moveTo(px + 0.5, L.y); ctx.lineTo(px + 0.5, L.y + L.h);
        ctx.strokeStyle = v.alpha(c.ink, 0.25); ctx.lineWidth = 1; ctx.stroke();
        ctx.beginPath(); ctx.arc(px, py, 6.5, 0, 6.2832);
        ctx.fillStyle = c.ink; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = c.surface; ctx.stroke();

        /* ---- the population ---- */
        v.title(ctx, '900 players, right now', R.x, R.y);
        var th2 = 46, gy = R.y + 24, gs = Math.min(R.w, R.h - 24 - th2 - 14), cell = gs / COLS, gx = R.x;
        var rad = Math.max(1.6, cell * 0.36);
        for (var pass = 0; pass < 2; pass++) {
          ctx.fillStyle = pass ? c.a2 : c.a1; ctx.beginPath();
          for (i = 0; i < N; i++) {
            if (model.s[i] !== pass) continue;
            var x = gx + (i % COLS + 0.5) * cell, y = gy + (Math.floor(i / COLS) + 0.5) * cell;
            ctx.moveTo(x + rad, y); ctx.arc(x, y, rad, 0, 6.2832);
          }
          ctx.fill();
        }
        /* legend */
        var lx = gx + gs + 14, compact = lx + 96 > R.x + R.w;
        if (compact) { lx = gx; }
        var ly = compact ? gy + gs + 10 : gy + 8;
        ctx.font = '500 11.5px ' + v.SANS; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        [['cooperate', c.a2, rho], ['defect', c.a1, 1 - rho]].forEach(function (e, k) {
          var ex = compact ? lx + k * 128 : lx, ey = compact ? ly : ly + k * 22;
          ctx.fillStyle = e[1]; ctx.beginPath(); ctx.arc(ex + 5, ey, 5, 0, 6.2832); ctx.fill();
          ctx.fillStyle = c.ink; ctx.fillText(e[0] + ' ' + Math.round(e[2] * 100) + '%', ex + 16, ey);
        });
        /* trace of rho over time */
        var tr = { x: gx, y: R.y + R.h - th2 + (compact ? 12 : 0), w: gs, h: th2 - 14 };
        if (compact) tr.h -= 10;
        ctx.strokeStyle = c.line; ctx.lineWidth = 1; ctx.strokeRect(tr.x + 0.5, tr.y + 0.5, tr.w, tr.h);
        if (trace.length > 1) {
          ctx.beginPath();
          for (i = 0; i < trace.length; i++) {
            var tx = tr.x + i / 240 * tr.w, ty = tr.y + tr.h - trace[i] * tr.h;
            if (i) ctx.lineTo(tx, ty); else ctx.moveTo(tx, ty);
          }
          ctx.strokeStyle = c.a2; ctx.lineWidth = 2; ctx.stroke();
        }
        ctx.font = '500 10px ' + v.MONO; ctx.fillStyle = c.ink2; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        ctx.fillText('cooperators over time', tr.x, tr.y - 3);
      }
    });

    var out = v.readout();
    function say() {
      var th = theory(model.a, model.delta), rho = model.rho();
      var txt = th.lo == null
        ? 'δ = ' + model.delta.toFixed(2) + ' is below the tipping point (' + th.dc.toFixed(2) + '): defection is the only stable outcome, exactly as in the pairwise game.'
        : 'δ = ' + model.delta.toFixed(2) + ' is past the tipping point (' + th.dc.toFixed(2) + '): cooperation is stable at ' +
          Math.round(th.hi * 100) + '%, provided at least ' + Math.round(th.lo * 100) + '% cooperate to begin with.';
      out.textContent = txt + ' Now: ' + Math.round(rho * 100) + '% cooperate.' +
        (model.nC === 0 || model.nC === model.N ? ' Nobody is left to copy from, so nothing can change: press Restart, or click in the diagram.' : '');
    }

    var acc = 0, since = 0;
    var loop = v.loop(function (dt) {
      acc += dt * N * 9;                         // about nine sweeps of the population a second
      var n = Math.floor(acc); acc -= n;
      model.step(n);
      since += dt;
      if (since > 0.05) { since = 0; trace.push(model.rho()); if (trace.length > 240) trace.shift(); say(); }
      cv.redraw();
    });
    v.playButton(btns, loop);
    v.button(btns, 'Restart', reseed);

    /* click or drag in the diagram to put the population there */
    var dragging = false;
    cv.pointer(function (x, y, type) {
      if (!hit) return;
      var r = hit.r, inside = x >= r.x - 6 && x <= r.x + r.w + 6 && y >= r.y - 6 && y <= r.y + r.h + 6;
      if (type === 'down' && inside) dragging = true;
      if (type === 'up' || type === 'leave') dragging = false;
      cv.el.style.cursor = inside ? 'crosshair' : '';
      if (!dragging) return;
      var d = Math.max(0, Math.min(1, (x - r.x) / r.w)), p = Math.max(0.02, Math.min(0.98, 1 - (y - r.y) / r.h));
      delta.set(Math.round(d * 100) / 100, true); model.delta = delta.value;
      rho0.set(Math.round(p * 100) / 100, true);
      reseed();
    });

    model.delta = delta.value; model.a = aS.value;
    reseed();
  }, { theory: theory, makeModel: makeModel });
})();
