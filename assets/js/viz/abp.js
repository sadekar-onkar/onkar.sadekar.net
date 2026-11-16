/* Active Brownian motion in two dimensions under stochastic resetting
   (Kumar, Sadekar, Basu — PRE 102, 052129).

   The model itself, simulated. A particle moves at constant speed v0 = 1 along
   its orientation theta, and theta diffuses with rotational diffusion constant
   D_R. At rate r it is reset, under one of the paper's three protocols:

       I    position -> origin and orientation -> 0
       II   position -> origin only
       III  orientation -> 0 only

   I and II reach a stationary state; III never does. The panels on the right
   are the marginal distributions of x and y that the paper computes, gathered
   from the simulated cloud. */

(function () {
  'use strict';

  function gauss(rand) {       // Box-Muller
    var u = 0; while (u === 0) u = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307 * rand());
  }

  function makeModel(M, rand) {
    rand = rand || Math.random;
    var x = new Float32Array(M), y = new Float32Array(M), th = new Float32Array(M);
    var m = { M: M, x: x, y: y, th: th, r: 2, DR: 0.5, protocol: 'I', time: 0 };
    m.reset = function () { for (var i = 0; i < M; i++) { x[i] = y[i] = 0; th[i] = m.protocol === 'II' ? rand() * 6.2832 : 0; } m.time = 0; };
    m.step = function (dt) {
      var pr = 1 - Math.exp(-m.r * dt), sd = Math.sqrt(2 * m.DR * dt), p = m.protocol;
      for (var i = 0; i < M; i++) {
        if (rand() < pr) {
          if (p !== 'III') { x[i] = 0; y[i] = 0; }
          if (p !== 'II') th[i] = 0;
          continue;
        }
        th[i] += sd * gauss(rand);
        x[i] += Math.cos(th[i]) * dt; y[i] += Math.sin(th[i]) * dt;
      }
      m.time += dt;
    };
    return m;
  }

  PaperViz.register('abp', function (v) {
    var M = 1500, model = makeModel(M), NB = 41;
    var hx = new Float32Array(NB), hy = new Float32Array(NB), view = 2, trail = [];
    var ctl = v.controls();

    function clear() { hx.fill(0); hy.fill(0); trail = []; }
    function restart() { model.reset(); clear(); view = scale(); loop.kick(); }
    /* how far a particle typically gets between resets */
    function scale() {
      if (model.protocol === 'III') return 2;
      return 3.3 * Math.min(1 / model.r, 1.6 * Math.sqrt(1 / (2 * model.DR * model.r)));
    }

    var proto = v.segmented(ctl, { label: 'A reset sends back', value: 'I', wide: true, options: [
      { value: 'I', label: 'position and direction' }, { value: 'II', label: 'position only' }, { value: 'III', label: 'direction only' }],
      onChange: function (p) { model.protocol = p; restart(); } });
    var rS = v.slider(ctl, { label: 'Resetting rate, r', min: 0.1, max: 6, step: 0.1, value: 3,
      fmt: function (x) { return x.toFixed(1); }, onInput: function (x) { model.r = x; clear(); } });
    var dS = v.slider(ctl, { label: 'Rotational diffusion, D_R', min: 0.1, max: 6, step: 0.1, value: 0.4,
      fmt: function (x) { return x.toFixed(1); }, onInput: function (x) { model.DR = x; clear(); } });
    var btns = v.el('div', 'viz-actions'); ctl.appendChild(btns);
    model.r = rS.value; model.DR = dS.value;

    function marginal(ctx, c, R, hist, name, colour) {
      var mx = 0, i;
      for (i = 0; i < NB; i++) mx = Math.max(mx, hist[i]);
      v.title(ctx, 'Distribution of ' + name, R.x, R.y);
      var Q = v.inset(R, 8, 22, 8, 22), bw = Q.w / NB;
      if (mx > 0) {
        ctx.fillStyle = colour;
        for (i = 0; i < NB; i++) { var bh = hist[i] / mx * Q.h; ctx.fillRect(Q.x + i * bw, Q.y + Q.h - bh, Math.max(1, bw - 1), bh); }
      }
      ctx.strokeStyle = c.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(Q.x, Q.y + Q.h + 0.5); ctx.lineTo(Q.x + Q.w, Q.y + Q.h + 0.5); ctx.stroke();
      ctx.beginPath(); ctx.setLineDash([2, 3]); ctx.moveTo(Q.x + Q.w / 2, Q.y); ctx.lineTo(Q.x + Q.w / 2, Q.y + Q.h); ctx.strokeStyle = c.ink2; ctx.stroke(); ctx.setLineDash([]);
      ctx.font = '500 10px ' + v.MONO; ctx.fillStyle = c.ink2; ctx.textBaseline = 'top';
      ctx.textAlign = 'left'; ctx.fillText('−' + view.toFixed(view < 3 ? 1 : 0), Q.x, Q.y + Q.h + 5);
      ctx.textAlign = 'center'; ctx.fillText('0', Q.x + Q.w / 2, Q.y + Q.h + 5);
      ctx.textAlign = 'right'; ctx.fillText('+' + view.toFixed(view < 3 ? 1 : 0), Q.x + Q.w, Q.y + Q.h + 5);
    }

    var cv = v.canvas({
      height: function (w) { return w >= 620 ? 400 : Math.min(w, 420) + 330; },
      label: 'A cloud of 1500 self-propelled particles around the point they are reset to, and the distributions of ' +
             'their x and y coordinates.',
      draw: function (ctx, w, h, c) {
        var wide = w >= 620, side = wide ? Math.min(h - 28, w * 0.52) : Math.min(w, 420) - 2;
        var A = { x: wide ? 0 : (w - side) / 2, y: 26, w: side, h: side }, i;
        v.title(ctx, M + ' particles · one of them traced', 0, 0);
        ctx.fillStyle = v.alpha(c.ink2, 0.06); ctx.fillRect(A.x, A.y, A.w, A.h);
        ctx.strokeStyle = c.line; ctx.lineWidth = 1; ctx.strokeRect(A.x + 0.5, A.y + 0.5, A.w, A.h);
        var cx = A.x + A.w / 2, cy = A.y + A.h / 2, sc = A.w / 2 / view;
        ctx.save(); ctx.beginPath(); ctx.rect(A.x, A.y, A.w, A.h); ctx.clip();
        /* axes through the reset point */
        ctx.beginPath(); ctx.moveTo(A.x, cy + 0.5); ctx.lineTo(A.x + A.w, cy + 0.5); ctx.moveTo(cx + 0.5, A.y); ctx.lineTo(cx + 0.5, A.y + A.h);
        ctx.strokeStyle = v.alpha(c.ink2, 0.3); ctx.stroke();
        ctx.fillStyle = v.alpha(c.a2, 0.55);
        var rad = wide ? 1.7 : 1.5;
        ctx.beginPath();
        for (i = 1; i < M; i++) { var px = cx + model.x[i] * sc, py = cy - model.y[i] * sc; ctx.moveTo(px + rad, py); ctx.arc(px, py, rad, 0, 6.2832); }
        ctx.fill();
        /* the traced particle: its path since the last reset, then itself with a heading */
        if (trail.length > 1) {
          ctx.beginPath();
          trail.forEach(function (p, k) { var tx = cx + p[0] * sc, ty = cy - p[1] * sc; if (k && !p[2]) ctx.lineTo(tx, ty); else ctx.moveTo(tx, ty); });
          ctx.strokeStyle = c.a1; ctx.lineWidth = 1.6; ctx.stroke();
        }
        var tx = cx + model.x[0] * sc, ty = cy - model.y[0] * sc;
        ctx.beginPath(); ctx.arc(tx, ty, 5, 0, 6.2832); ctx.fillStyle = c.a1; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = c.surface; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + 13 * Math.cos(model.th[0]), ty - 13 * Math.sin(model.th[0])); ctx.strokeStyle = c.a1; ctx.lineWidth = 2; ctx.stroke();
        ctx.restore();
        v.label(ctx, 'x →', A.x + A.w - 8, cy - 9, { align: 'right', colour: c.ink2, size: 10.5, halo: 'rgba(0,0,0,0)' });

        var B = wide ? { x: A.w + 30, y: 0, w: w - A.w - 30, h: h } : { x: 0, y: A.y + A.h + 20, w: w, h: h - A.y - A.h - 20 };
        var half = (B.h - 16) / 2;
        marginal(ctx, c, { x: B.x, y: B.y, w: B.w, h: half }, hx, 'x, along the reset direction', c.a2);
        marginal(ctx, c, { x: B.x, y: B.y + half + 16, w: B.w, h: half }, hy, 'y, across it', c.a3);
      }
    });

    var out = v.readout();
    var since = 0;
    var loop = v.loop(function (dt) {
      var sub = 3, h = dt * 0.9 / sub, i, k;
      for (k = 0; k < sub; k++) {
        var bx = model.x[0], by = model.y[0];
        model.step(h);
        var jumped = Math.abs(model.x[0] - bx) + Math.abs(model.y[0] - by) > 5 * h;
        trail.push([model.x[0], model.y[0], jumped]);
      }
      if (trail.length > 420) trail.splice(0, trail.length - 420);
      /* follow the cloud: fixed once stationary, growing with it under protocol III */
      var want = scale();
      if (model.protocol === 'III') {
        var s2 = 0; for (i = 0; i < M; i++) s2 += model.x[i] * model.x[i] + model.y[i] * model.y[i];
        want = Math.max(2, 2.3 * Math.sqrt(s2 / M));
      }
      if (Math.abs(want - view) > 0.002 * view) { view += (want - view) * Math.min(1, dt * 3); if (model.protocol !== 'III') { hx.fill(0); hy.fill(0); } }
      /* running histograms, forgetting slowly */
      var decay = model.protocol === 'III' ? 0 : Math.exp(-dt / 6);
      for (i = 0; i < NB; i++) { hx[i] *= decay; hy[i] *= decay; }
      for (i = 0; i < M; i++) {
        var a = Math.floor((model.x[i] / view + 1) / 2 * NB), b = Math.floor((model.y[i] / view + 1) / 2 * NB);
        if (a >= 0 && a < NB) hx[a]++;
        if (b >= 0 && b < NB) hy[b]++;
      }
      since += dt;
      if (since > 0.25) {
        since = 0;
        var mxv = 0; for (i = 0; i < M; i++) mxv += model.x[i]; mxv /= M;
        var ratio = model.r / model.DR;
        out.textContent = model.protocol === 'III'
          ? 'Direction-only resetting has no stationary state: the cloud keeps spreading (now out to about ' + view.toFixed(1) + ') and drifts along x, mean x = ' + mxv.toFixed(2) + '.'
          : 'r / D_R = ' + ratio.toFixed(1) + '. ' + (model.protocol === 'I'
            ? (ratio > 2 ? 'Resets come before a particle can turn, so the cloud is a jet along +x: mean x = ' + mxv.toFixed(2) + '.'
                         : 'Particles turn many times between resets, so the direction is forgotten: mean x = ' + mxv.toFixed(2) + '.')
            : (ratio > 2 ? 'Particles fly straight out in whatever direction they had, so the cloud is round with a sharp peak at the centre.'
                         : 'Particles turn many times between resets and the cloud is a round, cusped blob.'));
      }
      cv.redraw();
    });
    v.playButton(btns, loop);
    v.button(btns, 'Restart', restart);
    restart();
  }, { makeModel: makeModel });
})();
