/* Thermodynamic uncertainty relation for energy transport in a transient
   regime: a model study (Saryal, Sadekar, Agarwalla — PRE 103, 022141).

   Two identical systems, one hot and one cold, are joined for a time t and
   exchange energy quanta. With Q the heat that crosses and Sigma the entropy
   produced, the uncertainty relation says  <Sigma> Var(Q) / <Q>^2 >= 2.

   For resonant exchange coupling the swap probability is tau(t) = sin^2(Jt)
   and the two-time-measurement statistics of Q are closed-form:

       <Q>   = tau (n_h - n_c)
       Var Q = tau [n_h (1 -+ n_c) + n_c (1 -+ n_h)]  -+  tau^2 (n_h - n_c)^2

   (upper signs: qubits, n = 1/(e^{1/T} + 1); lower: oscillators,
   n = 1/(e^{1/T} - 1); units hbar omega = k_B = 1). With
   x = 1/T_c - 1/T_h this gives the form the paper reports,

       <Sigma> Var(Q) / <Q>^2  =  x coth(x/2)  -+  <Sigma>,

   a universal term that is never below 2, minus the entropy production for
   qubits and plus it for oscillators. The paper's third, hybrid model is not
   drawn here. */

(function () {
  'use strict';

  function terms(Th, Tc) {
    var x = 1 / Tc - 1 / Th;
    return { x: x, u: x < 1e-6 ? 2 : x / Math.tanh(x / 2),
             dF: 1 / (Math.exp(1 / Th) + 1) - 1 / (Math.exp(1 / Tc) + 1),
             dB: 1 / (Math.exp(1 / Th) - 1) - 1 / (Math.exp(1 / Tc) - 1) };
  }
  /* the product at swap probability tau */
  function qubit(k, tau) { return k.u - k.x * tau * k.dF; }
  function osc(k, tau) { return k.u + k.x * tau * k.dB; }

  PaperViz.register('tur', function (v) {
    var t = 0.3, geo = null, mapGeo = null;
    var ctl = v.controls();
    var redraw = function () { cv.redraw(); say(); };
    var Th = v.slider(ctl, { label: 'Hot temperature, T_h', min: 0.2, max: 10, step: 0.05, value: 6,
      onInput: function (x) { if (Tc.value > x - 0.05) Tc.set(Math.max(0.1, x - 0.05), true); redraw(); } });
    var Tc = v.slider(ctl, { label: 'Cold temperature, T_c', min: 0.1, max: 3, step: 0.05, value: 0.6,
      onInput: function (x) { if (Th.value < x + 0.05) Th.set(x + 0.05, true); redraw(); } });
    var btns = v.el('div', 'viz-actions'); ctl.appendChild(btns);

    var cv = v.canvas({
      height: function (w) { return w >= 620 ? 360 : 660; },
      label: 'Left: the uncertainty product against interaction time for two qubits and for two oscillators, with the ' +
             'bound of 2 marked. Right: the lowest value the qubit product reaches for each pair of temperatures.',
      draw: function (ctx, w, h, c) {
        var parts = v.split(w, h, 0.56), A = parts[0], B = parts[1], k = terms(Th.value, Tc.value), i;
        v.title(ctx, 'Precision × cost while the two are in contact', A.x, A.y);
        var R = v.inset(A, 50, 28, 14, 40);
        var lo = Math.min(1.8, qubit(k, 1) - 0.05), hi = Math.min(3.2, Math.max(2.4, osc(k, 1) + 0.08));
        var step = 0.2, ticks = [];
        for (var tk = Math.ceil(lo / step) * step; tk <= hi + 1e-9; tk += step) ticks.push(Math.round(tk * 10) / 10);
        var ax = v.axes(ctx, R, { xmin: 0, xmax: Math.PI, ymin: lo, ymax: hi, yticks: ticks,
          xticks: [0, Math.PI / 2, Math.PI], xfmt: function (q) { return q === 0 ? '0' : q < 2 ? 'π/2' : 'π'; },
          yfmt: function (q) { return q.toFixed(1); }, xlabel: 'time in contact, Jt', ylabel: '⟨Σ⟩ Var(Q) / ⟨Q⟩²', ypad: 30 });
        geo = { R: R };
        ctx.save(); ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();
        /* where the qubit curve is under the bound */
        ctx.beginPath(); ctx.moveTo(ax.X(0), ax.Y(2));
        for (i = 0; i <= 200; i++) { var tt = Math.PI * i / 200; ctx.lineTo(ax.X(tt), ax.Y(Math.min(2, qubit(k, Math.pow(Math.sin(tt), 2))))); }
        ctx.lineTo(ax.X(Math.PI), ax.Y(2)); ctx.closePath(); ctx.fillStyle = v.alpha(c.a1, 0.22); ctx.fill();
        /* the bound */
        ctx.beginPath(); ctx.moveTo(R.x, ax.Y(2)); ctx.lineTo(R.x + R.w, ax.Y(2)); ctx.strokeStyle = c.ink; ctx.lineWidth = 1.5; ctx.stroke();
        /* the universal term */
        ctx.beginPath(); ctx.setLineDash([4, 4]); ctx.moveTo(R.x, ax.Y(k.u)); ctx.lineTo(R.x + R.w, ax.Y(k.u)); ctx.strokeStyle = c.ink2; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
        [[osc, c.a2], [qubit, c.a1]].forEach(function (f) {
          ctx.beginPath();
          for (i = 0; i <= 200; i++) { var tt = Math.PI * i / 200, y = ax.Y(f[0](k, Math.pow(Math.sin(tt), 2))); if (i) ctx.lineTo(ax.X(tt), y); else ctx.moveTo(ax.X(tt), y); }
          ctx.strokeStyle = f[1]; ctx.lineWidth = 2.5; ctx.stroke();
        });
        ctx.restore();
        v.label(ctx, 'the bound: 2', R.x + 6, ax.Y(2) + 10, { size: 10.5, mono: true });
        var tau = Math.pow(Math.sin(t), 2);
        v.label(ctx, osc(k, 1) > hi ? 'two oscillators (off the top)' : 'two oscillators', ax.X(Math.PI / 2), Math.max(R.y + 10, ax.Y(Math.min(hi, osc(k, 1))) - 11), { align: 'center', weight: 600 });
        v.label(ctx, 'two qubits', ax.X(Math.PI / 2), Math.min(R.y + R.h - 9, ax.Y(qubit(k, 1)) + 13), { align: 'center', weight: 600 });
        /* time cursor */
        var cx = ax.X(t);
        ctx.beginPath(); ctx.moveTo(cx + 0.5, R.y); ctx.lineTo(cx + 0.5, R.y + R.h); ctx.strokeStyle = v.alpha(c.ink, 0.3); ctx.lineWidth = 1; ctx.stroke();
        [[osc, c.a2], [qubit, c.a1]].forEach(function (f) {
          var y = ax.Y(Math.min(hi, f[0](k, tau)));
          ctx.beginPath(); ctx.arc(cx, y, 5, 0, 6.2832); ctx.fillStyle = f[1]; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = c.surface; ctx.stroke();
        });

        /* ---- map of the deepest dip ---- */
        v.title(ctx, 'How far two qubits can dip below 2', B.x, B.y);
        var M = v.inset(B, 40, 28, 12, 76), n = 48, cw = M.w / n, ch = M.h / n;
        var TC = function (q) { return 0.1 + 2.9 * q; }, TH = function (q) { return 0.1 + 9.9 * q; };
        for (i = 0; i < n; i++) for (var j = 0; j < n; j++) {
          var tc = TC((i + 0.5) / n), th2 = TH((j + 0.5) / n);
          if (th2 <= tc) continue;
          var val = qubit(terms(th2, tc), 1);
          ctx.fillStyle = val < 2 ? v.mix(c.surface, c.a1, Math.min(1, (2 - val) / 0.12) * 0.9 + 0.1)
                                  : v.mix(c.surface, c.ink2, Math.min(1, (val - 2) / 0.6) * 0.3 + 0.04);
          ctx.fillRect(M.x + i * cw, M.y + M.h - (j + 1) * ch, cw + 0.5, ch + 0.5);
        }
        mapGeo = { M: M };
        var bx = v.axes(ctx, M, { xmin: 0.1, xmax: 3, ymin: 0.1, ymax: 10, xticks: [1, 2, 3], yticks: [2, 4, 6, 8, 10], grid: false,
          xlabel: 'cold temperature, T_c', ylabel: 'hot temperature, T_h', ypad: 26 });
        var px = bx.X(Tc.value), py = bx.Y(Th.value);
        ctx.beginPath(); ctx.arc(px, py, 6, 0, 6.2832); ctx.fillStyle = c.ink; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = c.surface; ctx.stroke();
        var sx = M.x, sy = M.y + M.h + 46;
        for (i = 0; i < 70; i++) { ctx.fillStyle = v.mix(c.surface, c.a1, (1 - i / 69) * 0.9 + 0.1); ctx.fillRect(sx + i, sy, 1.5, 9); }
        ctx.font = '500 10px ' + v.MONO; ctx.fillStyle = c.ink2; ctx.textBaseline = 'top';
        ctx.textAlign = 'left'; ctx.fillText('1.88', sx, sy + 13); ctx.textAlign = 'right'; ctx.fillText('2', sx + 70, sy + 13);
        ctx.fillStyle = v.mix(c.surface, c.ink2, 0.2); ctx.fillRect(sx + 96, sy, 14, 9);
        ctx.fillStyle = c.ink2; ctx.textAlign = 'left'; ctx.fillText('bound holds', sx + 116, sy - 1);
        ctx.font = '500 10.5px ' + v.SANS; ctx.fillText('click to set the temperatures', sx + 96, sy + 13);
      }
    });

    var out = v.readout();
    function say() {
      var k = terms(Th.value, Tc.value), tau = Math.pow(Math.sin(t), 2), q = qubit(k, tau), o = osc(k, tau), low = qubit(k, 1);
      out.textContent = 'At Jt = ' + t.toFixed(2) + ': qubits ' + q.toFixed(3) + ', oscillators ' + o.toFixed(3) + '. ' +
        (low < 2 ? 'At these temperatures the qubit pair goes below the bound, down to ' + low.toFixed(3) + ' at Jt = π/2 (' +
          ((2 - low) / 2 * 100).toFixed(1) + '% under).'
          : 'At these temperatures both stay above the bound for the whole contact; the qubit pair bottoms out at ' + low.toFixed(3) + '.');
    }
    var loop = v.loop(function (dt) { t += dt * 0.5; if (t > Math.PI) t -= Math.PI; cv.redraw(); say(); });
    v.playButton(btns, loop);

    var drag = false;
    cv.pointer(function (x, y, type) {
      var inA = geo && x >= geo.R.x && x <= geo.R.x + geo.R.w && y >= geo.R.y && y <= geo.R.y + geo.R.h;
      var m = mapGeo && mapGeo.M, inB = m && x >= m.x && x <= m.x + m.w && y >= m.y && y <= m.y + m.h;
      cv.el.style.cursor = inA ? 'ew-resize' : inB ? 'crosshair' : '';
      if (type === 'down') drag = inA ? 'A' : inB ? 'B' : false;
      if (type === 'up' || type === 'leave') drag = false;
      if (drag === 'A') { loop.pause(); t = Math.max(0.01, Math.min(Math.PI - 0.01, (x - geo.R.x) / geo.R.w * Math.PI)); redraw(); }
      if (drag === 'B') {
        var tc = 0.1 + 2.9 * Math.max(0, Math.min(1, (x - m.x) / m.w)), th = 0.1 + 9.9 * Math.max(0, Math.min(1, 1 - (y - m.y) / m.h));
        if (th < tc + 0.05) th = tc + 0.05;
        Tc.set(Math.round(tc * 20) / 20, true); Th.set(Math.round(th * 20) / 20, true); redraw();
      }
    });
    say();
  }, { terms: terms, qubit: qubit, osc: osc });
})();
