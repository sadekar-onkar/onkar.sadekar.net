/* Zero-current nonequilibrium state in symmetric exclusion process with
   dichotomous stochastic resetting (Sadekar, Basu — J. Stat. Mech. 073209).

   The model itself, simulated. Fifty particles on a ring of a hundred sites
   hop left or right at rate 1 if the neighbouring site is empty. At rate r1
   the whole system is put back with every particle in the left half; at rate
   r2, with every particle in the right half. The picture is a space-time
   diagram: each row is the lattice at one instant, newest at the bottom.

   The paper works with the exact dynamics in the continuum; this is a small
   Monte Carlo version of the same process for looking at, with the diffusive
   current counted across the bond in the middle of the lattice. */

(function () {
  'use strict';

  function makeModel(L, rand) {
    rand = rand || Math.random;
    var s = new Uint8Array(L), m = { L: L, s: s, r1: 0.03, r2: 0.03, time: 0, current: 0, resets: 0, last: 0 };
    m.set = function (side) { for (var i = 0; i < L; i++) s[i] = (i < L / 2) === (side === 1) ? 1 : 0; };
    m.set(1);
    /* advance by dt: L * dt bond updates, each an exchange across one bond */
    m.step = function (dt) {
      var n = Math.round(L * dt), mid = L / 2 - 1;
      m.last = 0;
      for (var q = 0; q < n; q++) {
        var u = rand() * L;
        if (u < m.r1) { m.set(1); m.resets++; m.last = 1; continue; }
        if (u < m.r1 + m.r2) { m.set(2); m.resets++; m.last = 2; continue; }
        var i = Math.floor(rand() * L), j = i + 1 === L ? 0 : i + 1;
        if (s[i] !== s[j]) {
          if (i === mid) m.current += s[i] ? 1 : -1;       // rightward hop across the middle counts +1
          var t = s[i]; s[i] = s[j]; s[j] = t;
        }
      }
      m.time += n / L;
    };
    return m;
  }

  PaperViz.register('sep', function (v) {
    var L = 100, ROWS = 150, model = makeModel(L);
    var rows = [], avg = new Float64Array(L), samples = 0, t0 = 0, j0 = 0;
    var ctl = v.controls();
    function clear() { avg.fill(0); samples = 0; t0 = model.time; j0 = model.current; }
    var f = function (x) { return x.toFixed(3); };
    var r1 = v.slider(ctl, { label: 'Reset to the left half, rate r₁', min: 0, max: 0.1, step: 0.002, value: 0.03, fmt: f,
      onInput: function (x) { model.r1 = x; clear(); } });
    var r2 = v.slider(ctl, { label: 'Reset to the right half, rate r₂', min: 0, max: 0.1, step: 0.002, value: 0.03, fmt: f,
      onInput: function (x) { model.r2 = x; clear(); } });
    var btns = v.el('div', 'viz-actions'); ctl.appendChild(btns);

    var cv = v.canvas({
      height: function (w) { return w >= 620 ? 420 : 560; },
      label: 'Space-time diagram of particles on a lattice, repeatedly reset to a block in the left or right half, ' +
             'with the time-averaged density profile below.',
      draw: function (ctx, w, h, c) {
        var ML = 40, MR = 16, profH = 104, gap = 40;
        var K = { x: ML, y: 26, w: w - ML - MR, h: h - 26 - profH - gap - 44 };
        var cw = K.w / L, rh = K.h / ROWS, i, k;
        v.title(ctx, 'The lattice over time · newest at the bottom', 0, 0);
        ctx.fillStyle = v.alpha(c.ink2, 0.06); ctx.fillRect(K.x, K.y, K.w, K.h);
        ctx.fillStyle = c.a2;
        var off = ROWS - rows.length;
        for (k = 0; k < rows.length; k++) {
          var row = rows[k].s, y = K.y + (off + k) * rh, start = -1;
          for (i = 0; i <= L; i++) {
            var on = i < L && row[i];
            if (on && start < 0) start = i;
            if (!on && start >= 0) { ctx.fillRect(K.x + start * cw, y, (i - start) * cw, rh + 0.6); start = -1; }
          }
          if (rows[k].reset) {
            ctx.fillStyle = c.a1; ctx.fillRect(K.x - 9, y - 1, 6, 3);
            ctx.fillStyle = c.a2;
          }
        }
        ctx.strokeStyle = c.line; ctx.lineWidth = 1; ctx.strokeRect(K.x + 0.5, K.y + 0.5, K.w, K.h);
        ctx.save(); ctx.font = '500 11px ' + v.SANS; ctx.fillStyle = c.ink2; ctx.textAlign = 'center';
        ctx.translate(12, K.y + K.h / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('time →', 0, 0); ctx.restore();
        ctx.font = '500 10.5px ' + v.SANS; ctx.fillStyle = c.ink2; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillStyle = c.a1; ctx.fillRect(K.x, K.y + K.h + 9, 6, 3);
        ctx.fillStyle = c.ink2; ctx.fillText('a reset', K.x + 11, K.y + K.h + 5);
        ctx.textAlign = 'right'; ctx.fillText('each row: 100 sites, 50 particles', K.x + K.w, K.y + K.h + 5);

        /* time-averaged density */
        var P = { x: ML, y: K.y + K.h + gap + 4, w: K.w, h: profH - 4 };
        v.title(ctx, 'Average density at each site', 0, P.y - 20);
        var ax = v.axes(ctx, P, { xmin: 0, xmax: L, ymin: 0, ymax: 1, yticks: [0, 0.5, 1], xticks: [0, 50, 100], xlabel: 'site' });
        if (samples > 0) {
          ctx.fillStyle = v.alpha(c.a2, 0.75);
          for (i = 0; i < L; i++) { var d = avg[i] / samples; ctx.fillRect(P.x + i * cw, ax.Y(d), Math.max(1, cw - 0.6), P.y + P.h - ax.Y(d)); }
        }
        ctx.beginPath(); ctx.setLineDash([4, 4]); ctx.moveTo(P.x, ax.Y(0.5)); ctx.lineTo(P.x + P.w, ax.Y(0.5)); ctx.strokeStyle = c.ink; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
        v.label(ctx, 'equilibrium: ½ everywhere', P.x + P.w - 6, ax.Y(0.5) - 9, { align: 'right', size: 10.5 });
      }
    });

    var out = v.readout();
    var acc = 0, since = 0;
    var loop = v.loop(function (dt) {
      acc += dt * 22;                              // lattice time units per second
      while (acc >= 0.5) {
        acc -= 0.5;
        var reset = 0;
        model.step(0.25); reset = model.last || reset;
        model.step(0.25); reset = model.last || reset;
        rows.push({ s: model.s.slice(), reset: reset });
        if (rows.length > ROWS) rows.shift();
        for (var i = 0; i < L; i++) avg[i] += model.s[i];
        samples++;
      }
      since += dt;
      if (since > 0.3) {
        since = 0;
        var T = model.time - t0, J = T > 0 ? (model.current - j0) / T : 0, lft = 0;
        for (var k = 0; k < L / 2; k++) lft += samples ? avg[k] / samples : 0.5;
        var eq = Math.abs(r1.value - r2.value) < 1e-9;
        out.textContent = (r1.value + r2.value === 0 ? 'No resetting: this is the ordinary exclusion process relaxing to equilibrium. So far: '
          : eq ? 'Equal rates: averaged over many resets the density is flat and the current vanishes, as in equilibrium, yet no single row looks like equilibrium. So far: '
          : 'Unequal rates: the profile tilts towards the ' + (r1.value > r2.value ? 'left' : 'right') + ' and a steady current flows. So far: ') +
          'mean density in the left half ' + (lft / (L / 2)).toFixed(2) + ', current across the middle ' + (J >= 0 ? '+' : '−') + Math.abs(J).toFixed(3) +
          ' per unit time (over ' + Math.round(T) + ' time units).';
      }
      cv.redraw();
    });
    v.playButton(btns, loop);
    v.button(btns, 'Clear the average', clear);
    clear();
  }, { makeModel: makeModel });
})();
