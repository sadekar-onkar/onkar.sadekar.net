/* Drivers of cooperation in social dilemmas on higher-order networks
   (Sadekar, Civilini, Latora, Battiston — J. R. Soc. Interface 22, 20250134).

   Not a re-simulation: this draws the paper's own results. A live version on a
   lattice small enough to draw was tried first and dropped, because at a few
   hundred players the model simply falls into all-cooperate or all-defect and
   the averages the paper reports never appear. The data file holds the mean
   stationary cooperation over 400 runs of 1500 players for every combination
   of overlap (11 values), p_switch (11) and dilemma strength (18), i.e. the
   grid behind figures 2 to 4. See tools/prep_viz_data.py. */

(function () {
  'use strict';

  PaperViz.register('overlap', function (v) {
    var data = null, sel = { o: 10, p: 9 }, hover = null, hit = null;
    var ctl = v.controls();
    var al = v.slider(ctl, { label: 'Dilemma strength in groups, α', min: 0, max: 17, step: 1, value: 9,
      fmt: function (i) { return data ? sign(data.alpha[i]) : ''; },
      onInput: function () { cv.redraw(); say(); } });
    var what = v.segmented(ctl, { label: 'Cooperation shown', value: 'both',
      options: [{ value: 'both', label: 'overall' }, { value: 'pairs', label: 'in pairs' }, { value: 'groups', label: 'in groups' }],
      onChange: function () { cv.redraw(); say(); } });

    function sign(x) { return (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(1); }
    function val(a, o, p) {
      var pr = data.pairs[a][o][p], gr = data.groups[a][o][p];
      return what.value === 'pairs' ? pr : what.value === 'groups' ? gr : (pr + gr) / 2;
    }
    function pct(x) { return Math.round(x * 100) + '%'; }

    var cv = v.canvas({
      height: function (w) { return w >= 620 ? 380 : 700; },
      label: 'Left: stationary cooperation for each combination of structural overlap and inter-order copying. ' +
             'Right: cooperation against dilemma strength for the selected combination.',
      draw: function (ctx, w, h, c) {
        if (!data) return;
        var parts = v.split(w, h, 0.56), A = parts[0], B = parts[1], a = al.value, o, p;
        v.title(ctx, 'Cooperation at α = ' + sign(data.alpha[a]), A.x, A.y);
        var R = v.inset(A, 46, 26, 10, 78);
        var cw = R.w / 11, ch = R.h / 11;
        for (o = 0; o < 11; o++) for (p = 0; p < 11; p++) {
          var x = R.x + p * cw, y = R.y + R.h - (o + 1) * ch;
          ctx.fillStyle = v.mix(c.surface, c.a2, val(a, o, p));
          ctx.fillRect(x + 1, y + 1, cw - 2, ch - 2);
        }
        hit = { r: R, cw: cw, ch: ch };
        /* axes: cell-centred ticks */
        ctx.font = '500 10.5px ' + v.MONO; ctx.fillStyle = c.ink2;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        [0, 2, 4, 6, 8, 10].forEach(function (k) { ctx.fillText((k / 10).toFixed(1), R.x + (k + 0.5) * cw, R.y + R.h + 6); });
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        [0, 2, 4, 6, 8, 10].forEach(function (k) { ctx.fillText((k / 10).toFixed(1), R.x - 7, R.y + R.h - (k + 0.5) * ch); });
        ctx.font = '500 11px ' + v.SANS; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText('copying across group sizes, p_switch', R.x + R.w / 2, R.y + R.h + 22);
        ctx.save(); ctx.translate(R.x - 34, R.y + R.h / 2); ctx.rotate(-Math.PI / 2);
        ctx.textBaseline = 'bottom'; ctx.fillText('overlap of pairs and groups, ω', 0, 0); ctx.restore();
        /* colour scale */
        var sx = R.x, sy = R.y + R.h + 46, sw = Math.min(180, R.w), k;
        for (k = 0; k < sw; k++) { ctx.fillStyle = v.mix(c.surface, c.a2, k / (sw - 1)); ctx.fillRect(sx + k, sy, 1.5, 9); }
        ctx.strokeStyle = c.line; ctx.lineWidth = 1; ctx.strokeRect(sx + 0.5, sy + 0.5, sw, 9);
        ctx.font = '500 10.5px ' + v.MONO; ctx.fillStyle = c.ink2; ctx.textBaseline = 'top';
        ctx.textAlign = 'left'; ctx.fillText('0%', sx, sy + 13);
        ctx.textAlign = 'right'; ctx.fillText('100% cooperate', sx + sw, sy + 13);
        /* selection and hover outlines */
        [[sel, 2.5, c.ink], [hover, 1.5, c.ink2]].forEach(function (m) {
          if (!m[0]) return;
          ctx.strokeStyle = m[2]; ctx.lineWidth = m[1];
          ctx.strokeRect(R.x + m[0].p * cw + 1, R.y + R.h - (m[0].o + 1) * ch + 1, cw - 2, ch - 2);
        });

        /* ---- profile across alpha for the selected cell ---- */
        v.title(ctx, 'The selected cell as the dilemma hardens', B.x, B.y);
        var Q = v.inset(B, 44, 26, 16, 78);
        var bx = v.axes(ctx, Q, { xmin: -1.4, xmax: 0.3, ymin: 0, ymax: 1, yticks: [0, 0.5, 1], xticks: [-1.2, -0.8, -0.4, 0],
          xfmt: sign, yfmt: pct, xlabel: 'dilemma strength, α', ylabel: 'cooperators', ypad: 36 });
        /* alpha >= 0 is a strong dilemma */
        ctx.fillStyle = v.alpha(c.ink2, 0.08); ctx.fillRect(bx.X(0), Q.y, Q.x + Q.w - bx.X(0), Q.h);
        v.label(ctx, 'strong', bx.X(0.15), Q.y + Q.h - 10, { align: 'center', colour: c.ink2, size: 10, halo: 'rgba(0,0,0,0)' });
        v.label(ctx, 'relaxed dilemma', bx.X(-0.7), Q.y + Q.h - 10, { align: 'center', colour: c.ink2, size: 10, halo: 'rgba(0,0,0,0)' });
        var lines = [['pairs', c.a3, 1.5, 'in pairs'], ['groups', c.a4, 1.5, 'in groups'], ['both', c.ink, 2.5, 'overall']];
        lines.forEach(function (ln) {
          ctx.beginPath();
          for (var i = 0; i < 18; i++) {
            var pr = data.pairs[i][sel.o][sel.p], gr = data.groups[i][sel.o][sel.p];
            var yv = ln[0] === 'pairs' ? pr : ln[0] === 'groups' ? gr : (pr + gr) / 2;
            if (i) ctx.lineTo(bx.X(data.alpha[i]), bx.Y(yv)); else ctx.moveTo(bx.X(data.alpha[i]), bx.Y(yv));
          }
          ctx.strokeStyle = ln[1]; ctx.lineWidth = ln[2]; ctx.stroke();
        });
        /* cursor at the current alpha */
        var cx = bx.X(data.alpha[a]);
        ctx.beginPath(); ctx.moveTo(cx + 0.5, Q.y); ctx.lineTo(cx + 0.5, Q.y + Q.h); ctx.strokeStyle = v.alpha(c.ink, 0.3); ctx.lineWidth = 1; ctx.stroke();
        var both = (data.pairs[a][sel.o][sel.p] + data.groups[a][sel.o][sel.p]) / 2;
        ctx.beginPath(); ctx.arc(cx, bx.Y(both), 5.5, 0, 6.2832); ctx.fillStyle = c.ink; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = c.surface; ctx.stroke();
        /* legend */
        var lx = Q.x, ly = Q.y + Q.h + 52;
        ctx.font = '500 11px ' + v.SANS; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        lines.forEach(function (ln) {
          ctx.strokeStyle = ln[1]; ctx.lineWidth = ln[2]; ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 16, ly); ctx.stroke();
          ctx.fillStyle = c.ink; ctx.fillText(ln[3], lx + 21, ly); lx += ctx.measureText(ln[3]).width + 38;
        });
      }
    });

    var out = v.readout();
    function say() {
      if (!data) return;
      var a = al.value, cell = hover || sel;
      var pr = data.pairs[a][cell.o][cell.p], gr = data.groups[a][cell.o][cell.p];
      out.textContent = 'Overlap ω = ' + data.omega[cell.o].toFixed(1) + ', p_switch = ' + data.pswitch[cell.p].toFixed(1) +
        ', α = ' + sign(data.alpha[a]) + ': ' + pct((pr + gr) / 2) + ' cooperate overall (' + pct(pr) + ' in pairs, ' +
        pct(gr) + ' in groups). Mean of 400 runs of 1500 players.';
    }
    function cellAt(x, y) {
      if (!hit) return null;
      var p = Math.floor((x - hit.r.x) / hit.cw), o = Math.floor((hit.r.y + hit.r.h - y) / hit.ch);
      return p >= 0 && p < 11 && o >= 0 && o < 11 ? { o: o, p: p } : null;
    }
    cv.pointer(function (x, y, type) {
      var cell = type === 'leave' ? null : cellAt(x, y);
      cv.el.style.cursor = cell ? 'pointer' : '';
      if (type === 'down' && cell) sel = cell;
      if ((cell && (!hover || hover.o !== cell.o || hover.p !== cell.p)) || (!cell && hover) || type === 'down') {
        hover = cell; cv.redraw(); say();
      }
    });

    v.json('overlap').then(function (d) {
      data = d;
      al.set(d.alpha.indexOf(-0.3) >= 0 ? d.alpha.indexOf(-0.3) : 9, true);
      cv.redraw(); say();
    }).catch(function () { out.textContent = 'The data for this figure could not be loaded.'; });
  });
})();
