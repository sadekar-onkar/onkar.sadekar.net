/* Emergence of cooperation in nonlinear higher-order public goods games
   (Llabrés, Sadekar, Malizia, Battiston — arXiv:2604.07228).

   The paper's mean-field replicator equation for a mix of two- and
   three-player public goods games, solved exactly:

       d rho / dt = rho (1 - rho) F(rho)
       F = (1 - theta) [ r/2 (1 + (delta2 - 1) rho)   - 1 ]
         +      theta  [ r/3 (1 + (delta3 - 1) rho)^2 - 1 ]

   delta < 1 discounts each extra cooperator, delta > 1 rewards it. F is a
   quadratic in rho, so the fixed points and their stability are closed-form.
   The right-hand panel draws the same dynamics as a ball rolling downhill on
   V(rho) = -integral of rho (1 - rho) F. */

(function () {
  'use strict';

  function coeffs(r, d2, d3, th) {
    var a = d2 - 1, b = d3 - 1;
    return { A: th * r * b * b / 3, B: (1 - th) * r * a / 2 + 2 * th * r * b / 3, C: r * ((1 - th) / 2 + th / 3) - 1 };
  }
  function F(k, x) { return k.A * x * x + k.B * x + k.C; }
  /* stable and unstable fixed points in [0, 1] */
  function fixed(r, d2, d3, th) {
    var k = coeffs(r, d2, d3, th), roots = [], out = { stable: [], unstable: [] };
    if (Math.abs(k.A) < 1e-12) { if (Math.abs(k.B) > 1e-12) roots = [-k.C / k.B]; }
    else {
      var D = k.B * k.B - 4 * k.A * k.C;
      if (D >= 0) { var s = Math.sqrt(D); roots = [(-k.B - s) / (2 * k.A), (-k.B + s) / (2 * k.A)]; }
    }
    (F(k, 0) < 0 ? out.stable : out.unstable).push(0);
    (F(k, 1) > 0 ? out.stable : out.unstable).push(1);
    roots.forEach(function (x) {
      if (x > 1e-9 && x < 1 - 1e-9) ((2 * k.A * x + k.B) < 0 ? out.stable : out.unstable).push(x);
    });
    return out;
  }
  function V(k, x) {
    return -(k.C * x * x / 2 + (k.B - k.C) * x * x * x / 3 + (k.A - k.B) * Math.pow(x, 4) / 4 - k.A * Math.pow(x, 5) / 5);
  }
  function regime(fx) {
    var has = function (x) { return fx.stable.indexOf(x) >= 0; };
    var mid = fx.stable.filter(function (x) { return x > 0 && x < 1; }).length > 0;
    var names = [];
    if (has(0)) names.push('everyone defects');
    if (mid) names.push('cooperators and defectors coexist');
    if (has(1)) names.push('everyone cooperates');
    return names;
  }

  PaperViz.register('pgg', function (v) {
    var rho = 0.5, hit = null, hitL = null;
    var ctl = v.controls();
    var redraw = function () { cv.redraw(); say(); loop.kick(); };
    var rS = v.slider(ctl, { label: 'Benefit-to-cost ratio, r', min: 1, max: 4, step: 0.01, value: 2.18, onInput: redraw });
    var d2 = v.slider(ctl, { label: 'Returns in pairs, δ₂', min: 0.1, max: 2, step: 0.05, value: 0.2, onInput: redraw });
    var d3 = v.slider(ctl, { label: 'Returns in threes, δ₃', min: 0.1, max: 4, step: 0.05, value: 3.5, onInput: redraw });
    var th = v.slider(ctl, { label: 'Share of three-player games, θ', min: 0, max: 1, step: 0.01, value: 0.1, onInput: redraw });
    var pre = v.segmented(ctl, { label: 'Start from', value: 'mixed', wide: true, options: [
      { value: 'disc', label: 'diminishing returns' }, { value: 'syn', label: 'synergy' }, { value: 'mixed', label: 'one of each' }],
      onChange: function (p) {
        var s = { disc: [2.6, 0.5, 0.5, 0.5, 0.2], syn: [2.2, 1.5, 1.5, 0.5, 0.45], mixed: [2.18, 0.2, 3.5, 0.1, 0.2] }[p];
        rS.set(s[0], true); d2.set(s[1], true); d3.set(s[2], true); th.set(s[3], true); rho = s[4]; redraw();
      } });

    var cv = v.canvas({
      height: function (w) { return w >= 620 ? 350 : 640; },
      label: 'Left: stationary fraction of cooperators against the benefit-to-cost ratio. ' +
             'Right: the same dynamics as a ball on a landscape.',
      draw: function (ctx, w, h, c) {
        var parts = v.split(w, h, 0.52), L = v.inset(parts[0], 44, 26, 12, 40), i, x;
        v.title(ctx, 'Where the population can settle', parts[0].x, parts[0].y);
        var ax = v.axes(ctx, L, { xmin: 1, xmax: 4, ymin: 0, ymax: 1, xticks: [1, 2, 3, 4], yticks: [0, 0.5, 1],
          yfmt: function (t) { return Math.round(t * 100) + '%'; },
          xlabel: 'benefit-to-cost ratio, r', ylabel: 'cooperators', ypad: 36 });
        hitL = { r: L };
        /* Fixed points against r. Four kinds of branch (the two edges and
           the interior, each stable or unstable); every one is drawn as a set
           of runs, a run ending wherever the branch stops existing. */
        var kinds = { s0: [], s1: [], sm: [], u0: [], u1: [], um: [] }, NS = 600;
        var put = function (name, r, p) {
          var runs = kinds[name], last = runs[runs.length - 1];
          if (last && last.at === x - 1) { last.pts.push([r, p]); last.at = x; } else runs.push({ at: x, pts: [[r, p]] });
        };
        for (x = 0; x <= NS; x++) {
          var r = 1 + 3 * x / NS, fx = fixed(r, d2.value, d3.value, th.value);
          fx.stable.forEach(function (p) { put(p === 0 ? 's0' : p === 1 ? 's1' : 'sm', r, p); });
          fx.unstable.forEach(function (p) { put(p === 0 ? 'u0' : p === 1 ? 'u1' : 'um', r, p); });
        }
        var stroke = function (name, colour, width, dash, dy) {
          ctx.strokeStyle = colour; ctx.lineWidth = width; ctx.setLineDash(dash || []); ctx.lineCap = 'butt';
          kinds[name].forEach(function (run) {
            ctx.beginPath();
            run.pts.forEach(function (q, n) { if (n) ctx.lineTo(ax.X(q[0]), ax.Y(q[1]) + dy); else ctx.moveTo(ax.X(q[0]), ax.Y(q[1]) + dy); });
            if (run.pts.length === 1) ctx.lineTo(ax.X(run.pts[0][0]) + 1, ax.Y(run.pts[0][1]) + dy);
            ctx.stroke();
          });
          ctx.setLineDash([]);
        };
        stroke('u0', c.ink2, 1.2, [2, 4], -1); stroke('u1', c.ink2, 1.2, [2, 4], 1); stroke('um', c.ink2, 1.5, [4, 4], 0);
        stroke('s0', c.a1, 3, null, -1.5); stroke('s1', c.a2, 3, null, 1.5); stroke('sm', c.a2, 3, null, 0);
        var px = ax.X(rS.value);
        ctx.beginPath(); ctx.moveTo(px + 0.5, L.y); ctx.lineTo(px + 0.5, L.y + L.h); ctx.strokeStyle = v.alpha(c.ink, 0.25); ctx.lineWidth = 1; ctx.stroke();
        ctx.beginPath(); ctx.arc(px, ax.Y(rho), 6.5, 0, 6.2832); ctx.fillStyle = c.ink; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = c.surface; ctx.stroke();
        /* key */
        var kx = L.x + L.w - 132, ky = parts[0].y + 13;
        ctx.font = '500 10.5px ' + v.SANS; ctx.textBaseline = 'bottom'; ctx.textAlign = 'left';
        ctx.fillStyle = c.a2; ctx.fillRect(kx, ky - 8, 16, 3); ctx.fillStyle = c.ink; ctx.fillText('stable', kx + 21, ky); kx += 66;
        ctx.fillStyle = c.ink2; for (i = 0; i < 4; i++) ctx.fillRect(kx + i * 5, ky - 7.5, 2, 1.5);
        ctx.fillStyle = c.ink; ctx.fillText('unstable', kx + 24, ky);

        /* ---- landscape ---- */
        var Rr = parts[1], Q = v.inset(Rr, 14, 34, 14, 40);
        v.title(ctx, 'The same thing as a landscape', Rr.x, Rr.y);
        var k = coeffs(rS.value, d2.value, d3.value, th.value), n = 160, vs = [], lo = Infinity, hi = -Infinity;
        for (i = 0; i <= n; i++) { var val = V(k, i / n); vs.push(val); lo = Math.min(lo, val); hi = Math.max(hi, val); }
        var span = Math.max(hi - lo, 1e-6);
        var PX = function (p) { return Q.x + p * Q.w; }, PY = function (val) { return Q.y + 12 + (1 - (val - lo) / span) * (Q.h - 24); };
        hit = { r: Q };
        ctx.beginPath(); ctx.moveTo(PX(0), Q.y + Q.h);
        for (i = 0; i <= n; i++) ctx.lineTo(PX(i / n), PY(vs[i]));
        ctx.lineTo(PX(1), Q.y + Q.h); ctx.closePath(); ctx.fillStyle = v.alpha(c.a2, 0.1); ctx.fill();
        ctx.beginPath(); for (i = 0; i <= n; i++) { if (i) ctx.lineTo(PX(i / n), PY(vs[i])); else ctx.moveTo(PX(0), PY(vs[0])); }
        ctx.strokeStyle = c.a2; ctx.lineWidth = 2; ctx.stroke();
        /* resting places */
        fixed(rS.value, d2.value, d3.value, th.value).stable.forEach(function (p) {
          ctx.beginPath(); ctx.arc(PX(p), PY(V(k, p)), 4, 0, 6.2832); ctx.fillStyle = c.surface; ctx.fill();
          ctx.strokeStyle = p === 0 ? c.a1 : c.a2; ctx.lineWidth = 2; ctx.stroke();
        });
        ctx.beginPath(); ctx.arc(PX(rho), PY(V(k, rho)) - 8, 7, 0, 6.2832); ctx.fillStyle = c.ink; ctx.fill();
        ctx.strokeStyle = c.line; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(Q.x, Q.y + Q.h + 0.5); ctx.lineTo(Q.x + Q.w, Q.y + Q.h + 0.5); ctx.stroke();
        ctx.font = '500 10.5px ' + v.MONO; ctx.fillStyle = c.ink2; ctx.textBaseline = 'top';
        ctx.textAlign = 'left'; ctx.fillText('0% cooperate', Q.x, Q.y + Q.h + 7);
        ctx.textAlign = 'right'; ctx.fillText('100%', Q.x + Q.w, Q.y + Q.h + 7);
        ctx.font = '500 11px ' + v.SANS; ctx.textAlign = 'center';
        ctx.fillText('click to drop the population somewhere else', Q.x + Q.w / 2, Q.y + Q.h + 22);
      }
    });

    var out = v.readout();
    function say() {
      var names = regime(fixed(rS.value, d2.value, d3.value, th.value));
      out.textContent = (names.length > 1 ? 'Two outcomes are stable here, and the starting point decides between them: '
        : 'One stable outcome here: ') + names.join(', or ') + '. Now at ' + Math.round(rho * 100) + '% cooperators.';
    }

    var loop = v.loop(function (dt) {
      var k = coeffs(rS.value, d2.value, d3.value, th.value);
      var before = rho;
      for (var i = 0; i < 4; i++) rho += dt / 4 * 6 * rho * (1 - rho) * F(k, rho);
      rho = Math.max(0.004, Math.min(0.996, rho));
      cv.redraw(); say();
      if (Math.abs(rho - before) < 1e-6) loop.sleep();     /* at rest until something is moved */
    });

    var dragging = false;
    cv.pointer(function (x, y, type) {
      var inQ = hit && x >= hit.r.x && x <= hit.r.x + hit.r.w && y >= hit.r.y - 10 && y <= hit.r.y + hit.r.h + 10;
      var inL = hitL && x >= hitL.r.x && x <= hitL.r.x + hitL.r.w && y >= hitL.r.y - 6 && y <= hitL.r.y + hitL.r.h + 6;
      cv.el.style.cursor = inQ || inL ? 'crosshair' : '';
      if (type === 'down') dragging = inQ ? 'Q' : inL ? 'L' : false;
      if (type === 'up' || type === 'leave') dragging = false;
      if (dragging === 'Q') rho = Math.max(0.01, Math.min(0.99, (x - hit.r.x) / hit.r.w));
      if (dragging === 'L') {
        rS.set(Math.max(1, Math.min(4, 1 + 3 * (x - hitL.r.x) / hitL.r.w)), true);
        rho = Math.max(0.01, Math.min(0.99, 1 - (y - hitL.r.y) / hitL.r.h));
      }
      if (dragging) redraw();
    });
    rho = 0.2; say();
  }, { fixed: fixed, coeffs: coeffs });
})();
