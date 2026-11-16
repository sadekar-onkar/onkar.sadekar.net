/* Evolutionary game selection creates cooperative environments
   (Sadekar, Civilini, Gómez-Gardeñes, Latora, Battiston — PRE 110, 014306).

   The paper's well-mixed model, run live. Every player carries a strategy AND
   a game of their own, a point (T, S) in the "games diamond" with payoff matrix

            C          D
       C  alpha - T    S            alpha = 4, beta = 2, so every game
       D    T       beta - S        pays out the same total

   Each player meets k = 4 random opponents and plays twice against each, once
   by its own matrix and once by the opponent's. A focal player then copies a
   model player with the Fermi probability on the average payoff difference:
   the strategy with probability p_s = 1, the game with probability p_g. */

(function () {
  'use strict';

  var ALPHA = 4, BETA = 2, K = 4;

  function makeModel(N, rand) {
    rand = rand || Math.random;
    var Tg = new Float32Array(N), Sg = new Float32Array(N), s = new Uint8Array(N);
    var m = { N: N, T: Tg, S: Sg, s: s, pg: 0.1 };
    m.seed = function (rho) {
      var nC = Math.round(rho * N), i;
      for (i = 0; i < N; i++) {
        /* uniform over the diamond |T - 2| + |S - 1| <= 1 */
        var u = rand() * 2 - 1, w = rand() * 2 - 1;
        Tg[i] = 2 + (u + w) / 2; Sg[i] = 1 + (u - w) / 2;
        s[i] = i < nC ? 1 : 0;
      }
    };
    /* payoff to a player using strategy a against b, under the game (t, sg) */
    function pay(a, b, t, sg) { return a ? (b ? ALPHA - t : sg) : (b ? t : BETA - sg); }
    function payoff(i) {
      var p = 0;
      for (var g = 0; g < K; g++) {
        var j = Math.floor(rand() * (N - 1)); if (j >= i) j++;
        p += pay(s[i], s[j], Tg[i], Sg[i]) + pay(s[i], s[j], Tg[j], Sg[j]);
      }
      return p / K;
    }
    m.step = function (n) {
      for (var q = 0; q < n; q++) {
        var f = Math.floor(rand() * N), mo = Math.floor(rand() * (N - 1)); if (mo >= f) mo++;
        var pi = 1 / (1 + Math.exp(payoff(f) - payoff(mo)));
        var doS = rand() < pi, doG = rand() < m.pg && rand() < pi;
        if (doG) { Tg[f] = Tg[mo]; Sg[f] = Sg[mo]; }
        if (doS) s[f] = s[mo];
      }
    };
    /* [fraction cooperating, fraction holding a cooperative game (S > T - 1)] */
    m.stats = function () {
      var c = 0, g = 0;
      for (var i = 0; i < N; i++) { c += s[i]; if (Sg[i] > Tg[i] - 1) g++; }
      return [c / N, g / N];
    };
    return m;
  }

  PaperViz.register('gamesel', function (v) {
    var N = 1000, model = makeModel(N), trace = [], t = 0, distinct = N;
    var ctl = v.controls();

    function restart() { model.seed(rho0.value); trace = []; t = 0; cv.redraw(); loop.kick(); }

    var rho0 = v.slider(ctl, { label: 'Cooperators at the start', min: 0.1, max: 0.9, step: 0.01, value: 0.6,
      fmt: function (x) { return Math.round(x * 100) + '%'; }, onInput: restart });
    var pg = v.segmented(ctl, { label: 'How often a game is copied, p_g', value: 0.1,
      options: [{ value: 0, label: 'never' }, { value: 0.01, label: '1%' }, { value: 0.1, label: '10%' }, { value: 1, label: 'always' }],
      onChange: function (x) { model.pg = x; restart(); } });
    var btns = v.el('div', 'viz-actions'); ctl.appendChild(btns);

    var cv = v.canvas({
      height: function (w) { return w >= 620 ? 380 : 680; },
      label: 'Left: every player as a dot at the position of its game in the plane of temptation T and sucker payoff S, ' +
             'coloured by strategy. Right: the share of cooperators and of cooperative games over time.',
      draw: function (ctx, w, h, c) {
        var parts = v.split(w, h, 0.52), A = parts[0], B = parts[1], i;
        v.title(ctx, 'The games still being played', A.x, A.y);
        var R = v.inset(A, 34, 26, 8, 40);
        var side = Math.min(R.w, R.h); R = { x: R.x + (R.w - side) / 2, y: R.y, w: side, h: side };
        var ax = v.axes(ctx, R, { xmin: 1, xmax: 3, ymin: 0, ymax: 2, xticks: [1, 2, 3], yticks: [0, 1, 2], grid: false,
          xlabel: 'temptation to defect, T', ylabel: "sucker's payoff, S", ypad: 22 });
        /* the diamond and its four games */
        ctx.beginPath(); ctx.moveTo(ax.X(2), ax.Y(2)); ctx.lineTo(ax.X(3), ax.Y(1)); ctx.lineTo(ax.X(2), ax.Y(0)); ctx.lineTo(ax.X(1), ax.Y(1)); ctx.closePath();
        ctx.fillStyle = v.alpha(c.ink2, 0.06); ctx.fill(); ctx.strokeStyle = c.line; ctx.lineWidth = 1; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ax.X(2), ax.Y(0)); ctx.lineTo(ax.X(2), ax.Y(2)); ctx.moveTo(ax.X(1), ax.Y(1)); ctx.lineTo(ax.X(3), ax.Y(1)); ctx.stroke();
        /* cooperative games lie above S = T - 1 */
        ctx.beginPath(); ctx.setLineDash([4, 4]); ctx.moveTo(ax.X(1.5), ax.Y(0.5)); ctx.lineTo(ax.X(2.5), ax.Y(1.5));
        ctx.strokeStyle = c.ink2; ctx.stroke(); ctx.setLineDash([]);
        var names = [['Harmony', 1.25, 1.93], ["Prisoner's dilemma", 2.75, 0.07], ['Snowdrift', 2.75, 1.93], ['Stag hunt', 1.25, 0.07]];
        names.forEach(function (nm) {
          v.label(ctx, nm[0], ax.X(nm[1]), ax.Y(nm[2]), { align: 'center', colour: c.ink2, size: 10.5 });
        });
        /* players. Copied games are identical, so players pile up on the
           same point: one disc per distinct game, its area the number of
           players holding it, split by how many of them cooperate. */
        var groups = {}, keys = [];
        for (i = 0; i < N; i++) {
          var gk = model.T[i].toFixed(4) + ',' + model.S[i].toFixed(4), g = groups[gk];
          if (!g) { g = groups[gk] = { t: model.T[i], s: model.S[i], n: 0, c: 0 }; keys.push(gk); }
          g.n++; g.c += model.s[i];
        }
        var r = Math.max(1.8, side / 150);
        keys.sort(function (p, q) { return groups[q].n - groups[p].n; });
        keys.forEach(function (gk) {
          var g = groups[gk], x = ax.X(g.t), y = ax.Y(g.s), rr = r * Math.sqrt(g.n), f = g.c / g.n;
          if (f > 0) { ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, rr, -Math.PI / 2, -Math.PI / 2 + f * 6.2832); ctx.closePath(); ctx.fillStyle = v.alpha(c.a2, 0.85); ctx.fill(); }
          if (f < 1) { ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, rr, -Math.PI / 2 + f * 6.2832, 1.5 * Math.PI); ctx.closePath(); ctx.fillStyle = v.alpha(c.a1, 0.85); ctx.fill(); }
          if (g.n > 12) { ctx.beginPath(); ctx.arc(x, y, rr, 0, 6.2832); ctx.strokeStyle = c.surface; ctx.lineWidth = 1.5; ctx.stroke(); }
        });
        distinct = keys.length;
        var kx = A.x + 2, ky = A.y + A.h - 2;
        ctx.font = '500 11px ' + v.SANS; ctx.textBaseline = 'bottom'; ctx.textAlign = 'left';
        [['cooperates', c.a2], ['defects', c.a1]].forEach(function (k) {
          ctx.fillStyle = k[1]; ctx.beginPath(); ctx.arc(kx + 5, ky - 6, 4.5, 0, 6.2832); ctx.fill();
          ctx.fillStyle = c.ink; ctx.fillText(k[0], kx + 14, ky); kx += ctx.measureText(k[0]).width + 30;
        });

        /* ---- time series ---- */
        v.title(ctx, 'What the population becomes', B.x, B.y);
        var Q = v.inset(B, 40, 26, 118, 40), span = Math.max(60, t);
        var bx = v.axes(ctx, Q, { xmin: 0, xmax: span, ymin: 0, ymax: 1, yticks: [0, 0.5, 1],
          xticks: [0, Math.round(span / 2), Math.round(span)],
          yfmt: function (y) { return Math.round(y * 100) + '%'; }, xlabel: 'generations' });
        var series = [[1, c.a2, 'players cooperating'], [2, c.a3, 'cooperative games']];
        series.forEach(function (sr) {
          if (trace.length < 2) return;
          ctx.beginPath();
          trace.forEach(function (p, k) { var x = bx.X(p[0]), y = bx.Y(p[sr[0]]); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
          ctx.strokeStyle = sr[1]; ctx.lineWidth = 2; ctx.stroke();
        });
        if (trace.length) {
          var last = trace[trace.length - 1], ys = series.map(function (sr) { return bx.Y(last[sr[0]]); });
          if (Math.abs(ys[0] - ys[1]) < 14) { var mid = (ys[0] + ys[1]) / 2, up = ys[0] <= ys[1] ? 0 : 1; ys[up] = mid - 7; ys[1 - up] = mid + 7; }
          series.forEach(function (sr, k) {
            ctx.fillStyle = sr[1]; ctx.beginPath(); ctx.arc(bx.X(last[0]) + 7, ys[k], 3.5, 0, 6.2832); ctx.fill();
            v.label(ctx, sr[2], bx.X(last[0]) + 14, ys[k], { colour: c.ink, size: 10.5 });
          });
        }
      }
    });

    var out = v.readout();
    var acc = 0, since = 0;
    var loop = v.loop(function (dt) {
      /* nothing can change once one game and one strategy are left */
      var st0 = model.stats();
      if (t > 4000 || (distinct === 1 && (st0[0] === 0 || st0[0] === 1))) { loop.sleep(); return; }
      var gens = dt * 22;                         // generations per second
      acc += gens * N;
      var n = Math.floor(acc); acc -= n;
      model.step(n); t += n / N;
      since += dt;
      if (since > 0.08) {
        since = 0;
        var st = model.stats();
        trace.push([t, st[0], st[1]]);
        if (trace.length > 900) trace = trace.filter(function (_, k) { return k % 2 === 0; });
        out.textContent = 'Started with ' + Math.round(rho0.value * 100) + '% cooperators. After ' + Math.round(t) +
          ' generations: ' + Math.round(st[0] * 100) + '% cooperate, and ' + Math.round(st[1] * 100) +
          '% of the games in play are cooperative ones (' + distinct + ' distinct game' + (distinct === 1 ? '' : 's') + ' left).' +
          (model.pg === 0 ? ' Games cannot be copied here, so the mix of games never changes.' : '');
      }
      cv.redraw();
    });
    v.playButton(btns, loop);
    v.button(btns, 'Restart', restart);
    model.pg = pg.value;
    restart();
  }, { makeModel: makeModel });
})();
