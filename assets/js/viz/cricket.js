/* Individual and team performance in cricket
   (Sadekar, Chowdhary, Santhanam, Battiston — R. Soc. Open Sci. 11, 240809).

   Real careers. Each bar is one ODI innings in the order it was played; the
   three highest scores are picked out (ties go to the innings that took fewer
   balls, the paper's rule). Underneath, the same two questions asked of every
   batter with at least 30 innings in the data: where in a career does the best
   innings fall, and how far apart are the best and the second best compared
   with the same careers shuffled. Counts come from tools/prep_viz_data.py. */

(function () {
  'use strict';

  PaperViz.register('cricket', function (v) {
    var data = null, player = null, order = null, hover = -1, bars = null;
    var ctl = v.controls();
    var who = v.select(ctl, { label: 'Batter', options: [{ value: '0', label: 'Loading…' }], value: '0',
      onChange: function (i) { pick(+i); } });
    var btns = v.el('div', 'viz-actions'); ctl.appendChild(btns);
    v.button(btns, 'Shuffle this career', function () {
      if (!player) return;
      order = order || player.runs.map(function (_, i) { return i; });
      for (var i = order.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = order[i]; order[i] = order[j]; order[j] = t; }
      cv.redraw(); say();
    });
    v.button(btns, 'Real order', function () { order = null; cv.redraw(); say(); });

    function pick(i) { player = data.players[i]; order = null; hover = -1; cv.redraw(); say(); }
    /* position (0-based, in display order) of the innings ranked k-th best */
    function where(k) { var idx = player.top[k]; return order ? order.indexOf(idx) : idx; }
    function pct(x) { return Math.round(x * 100) + '%'; }

    function hist(ctx, c, R, title, series, labels, xl) {
      v.title(ctx, title, R.x, R.y);
      var Q = v.inset(R, 34, 24, 8, 34), max = 0;
      series.forEach(function (s) { s.values.forEach(function (x) { max = Math.max(max, x); }); });
      max = Math.ceil(max * 10) / 10;
      var ax = v.axes(ctx, Q, { xmin: 0, xmax: 1, ymin: 0, ymax: max, yticks: [0, max / 2, max], xticks: [0, 0.5, 1],
        yfmt: pct, xfmt: function (t) { return labels[t === 0 ? 0 : t === 0.5 ? 1 : 2]; }, xlabel: xl, xedge: true });
      var n = series[0].values.length, bw = Q.w / n, k = series.length;
      series.forEach(function (s, si) {
        ctx.fillStyle = s.colour;
        s.values.forEach(function (x, i) {
          var w = (bw - 4) / k, bx = Q.x + i * bw + 2 + si * w, y = ax.Y(x);
          ctx.fillRect(bx, y, w - (k > 1 ? 1 : 0), Q.y + Q.h - y);
        });
      });
      if (series.length > 1) {
        var lx = Q.x + Q.w - 4, ly = Q.y + 6;
        ctx.font = '500 10.5px ' + v.SANS; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        series.forEach(function (s, i) {
          ctx.fillStyle = c.ink; ctx.fillText(s.name, lx - 14, ly + i * 15);
          ctx.fillStyle = s.colour; ctx.fillRect(lx - 9, ly + i * 15 - 5, 9, 9);
        });
      }
    }

    var cv = v.canvas({
      height: function (w) { return w >= 620 ? 500 : 720; },
      label: 'A batting career as a row of bars, one per innings, with the three highest scores marked. ' +
             'Below, two histograms over all batters.',
      draw: function (ctx, w, h, c) {
        if (!data || !player) return;
        var wide = w >= 620, topH = wide ? 250 : 240, i;
        var runs = player.runs, n = runs.length, max = Math.max.apply(null, runs);
        var ymax = Math.ceil(max / 50) * 50;
        v.title(ctx, player.name + ' · ' + n + ' innings, ' + player.years[0] + '–' + player.years[1] +
          (order ? ' · shuffled' : ''), 0, 0);
        var R = { x: 34, y: 34, w: w - 50, h: topH - 34 - 40 };
        var ax = v.axes(ctx, R, { xmin: 0, xmax: n, ymin: 0, ymax: ymax, yticks: [0, ymax / 2, ymax],
          xticks: [0, Math.round(n / 2), n], xlabel: order ? 'innings, in shuffled order' : 'innings, in the order they were played' });
        var bw = R.w / n, rank = {};
        player.top.forEach(function (idx, k) { rank[idx] = k; });
        for (i = 0; i < n; i++) {
          var idx = order ? order[i] : i, y = ax.Y(runs[idx]);
          ctx.fillStyle = idx in rank ? c.a1 : (i === hover ? c.ink : v.alpha(c.ink2, 0.55));
          ctx.fillRect(R.x + i * bw, y, Math.max(1, bw - (bw > 3 ? 1 : 0.3)), R.y + R.h - y);
        }
        bars = { R: R, bw: bw, n: n };
        /* name the top three, best first, keeping the labels apart */
        var placed = [];
        [0, 1, 2].forEach(function (k) {
          var pos = where(k), x = R.x + (pos + 0.5) * bw, y = ax.Y(runs[player.top[k]]) - 9;
          placed.forEach(function (q) { if (Math.abs(q[0] - x) < 44 && Math.abs(q[1] - y) < 13) y = q[1] - 13; });
          placed.push([x, y]);
          v.label(ctx, runs[player.top[k]] + (k === 0 ? ' best' : k === 1 ? ' 2nd' : ' 3rd'), x, Math.max(R.y - 6, y),
            { align: x > R.x + R.w - 50 ? 'right' : x < R.x + 50 ? 'left' : 'center', weight: k === 0 ? 700 : 500, size: 10.5, mono: true });
        });

        var by = topH + 14, bh = h - by;
        var A = wide ? { x: 0, y: by, w: (w - 30) / 2, h: bh } : { x: 0, y: by, w: w, h: (bh - 20) / 2 };
        var B = wide ? { x: A.w + 30, y: by, w: A.w, h: bh } : { x: 0, y: by + A.h + 20, w: w, h: A.h };
        hist(ctx, c, A, 'When the best innings came · ' + data.n_players + ' batters',
          [{ values: data.best_pos, colour: c.a2 }], ['debut', 'mid-career', 'last innings'], 'point in the career');
        /* this player's own best, as a marker on that axis */
        var QA = v.inset(A, 34, 24, 8, 34), mx = QA.x + (where(0) + 1) / n * QA.w;
        ctx.beginPath(); ctx.moveTo(mx, QA.y); ctx.lineTo(mx, QA.y + QA.h); ctx.strokeStyle = c.a1; ctx.lineWidth = 2; ctx.stroke();
        v.label(ctx, player.name.split(' ').pop(), mx + (mx > QA.x + QA.w - 70 ? -5 : 5), QA.y + 8,
          { align: mx > QA.x + QA.w - 70 ? 'right' : 'left', size: 10.5, weight: 600 });
        hist(ctx, c, B, 'Gap between best and second best',
          [{ values: data.gap2, colour: c.a2, name: 'real careers' }, { values: data.gap2_null, colour: v.alpha(c.ink2, 0.55), name: 'shuffled' }],
          ['back to back', 'half a career', 'whole career'], 'distance apart');
      }
    });

    var out = v.readout();
    function say() {
      if (!player) return;
      var n = player.runs.length, runs = player.runs;
      if (hover >= 0) {
        var idx = order ? order[hover] : hover;
        out.textContent = 'Innings ' + (hover + 1) + ' of ' + n + (order ? ' (shuffled order)' : '') + ': ' + runs[idx] +
          (player.notout.indexOf(idx) >= 0 ? ' not out.' : '.');
        return;
      }
      var b = where(0), s = where(1);
      out.textContent = player.name + "'s best, " + runs[player.top[0]] + ', ' + (order ? 'lands' : 'came') + ' ' + pct((b + 1) / n) +
        ' of the way through ' + (order ? 'this shuffled career' : 'the career') + '; the second best, ' + runs[player.top[1]] + ', ' +
        (order ? 'is ' : 'was ') + Math.abs(b - s) + ' innings away (' + pct(Math.abs(b - s) / n) + ' of the career).';
    }
    cv.pointer(function (x, y, type) {
      var hv = -1;
      if (bars && type !== 'leave' && y >= bars.R.y - 10 && y <= bars.R.y + bars.R.h + 4) {
        var i = Math.floor((x - bars.R.x) / bars.bw);
        if (i >= 0 && i < bars.n) hv = i;
      }
      if (hv !== hover) { hover = hv; cv.redraw(); say(); }
    });

    v.json('cricket').then(function (d) {
      data = d;
      who.input.textContent = '';
      d.players.forEach(function (p, i) {
        var o = document.createElement('option'); o.value = String(i); o.textContent = p.name; who.input.appendChild(o);
      });
      who.input.value = '0';
      pick(0);
    }).catch(function () { out.textContent = 'The data for this figure could not be loaded.'; });
  });
})();
