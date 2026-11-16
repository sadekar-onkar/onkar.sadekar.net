/* From streaks to synergies: a multi-scale analysis of performance and
   scoring in the NBA (Bozhidarova, Cai, Carvalho, Cirulli, Dehaene, Diaz,
   Krasnokutskaya, Pereira, Sadekar, Battiston — arXiv:2606.27957).

   Counted from the play-by-play behind the paper: every regulation-time game
   of six regular seasons. The shading answers "a team leads by this much at
   this minute: how often does it go on to win?" (each cell is that share of
   games, shown only where at least 15 games passed through it). One real game
   is drawn across it, and the strip underneath is the paper's last lead
   change: the minute at which the winner went ahead for good. */

(function () {
  'use strict';

  PaperViz.register('nba', function (v) {
    var data = null, game = null, hover = null, geo = null;
    var ctl = v.controls();
    var pickS = v.select(ctl, { label: 'Game drawn on top', options: [{ value: '0', label: 'Loading…' }], value: '0',
      onChange: function (i) { game = data.games[+i]; cv.redraw(); say(); } });

    function pct(x) { return Math.round(x * 100) + '%'; }
    /* home minus away just after second t */
    function marginAt(g, t) {
      var lo = 0, hi = g.t.length - 1, k = -1;
      while (lo <= hi) { var m = (lo + hi) >> 1; if (g.t[m] <= t) { k = m; lo = m + 1; } else hi = m - 1; }
      return k < 0 ? 0 : g.m[k];
    }
    function cellP(minute, lead) {
      if (lead < 1 || minute < 1 || minute > 47) return null;
      var row = Math.min(lead, data.maxlead) - 1;
      return { p: data.p[row][minute - 1], n: data.n[row][minute - 1] };
    }

    var cv = v.canvas({
      height: function (w) { return w >= 620 ? 470 : 520; },
      label: 'Heat map of the share of games won by the leading team, by minute and size of lead, with one game’s ' +
             'score margin drawn across it; below, a histogram of the minute of the last lead change.',
      draw: function (ctx, w, h, c) {
        if (!data) return;
        var ML = 46, MR = 12, top = 30, stripH = 86, gap = 44;
        var R = { x: ML, y: top, w: w - ML - MR, h: h - top - stripH - gap - 34 };
        var L = data.maxlead, rows = 2 * L + 1, ch = R.h / rows, cw = R.w / 48, i, m;
        var X = function (sec) { return R.x + sec / 2880 * R.w; };
        var Y = function (margin) { return R.y + (L + 0.5 - margin) * ch; };
        geo = { R: R, cw: cw, ch: ch, L: L };
        v.title(ctx, 'How often the team in front goes on to win', 0, 0);
        /* cells: columns are minutes 1..47, rows are leads +L..-L */
        for (m = 1; m <= 47; m++) for (i = 1; i <= L; i++) {
          var p = data.p[i - 1][m - 1];
          if (p == null) continue;
          ctx.fillStyle = v.mix(c.surface, c.a2, Math.max(0, (p - 0.5) / 0.5) * 0.92);
          var x = R.x + (m - 0.5) * cw;
          ctx.fillRect(x, Y(i) - ch / 2, cw + 0.5, ch + 0.5);
          ctx.fillRect(x, Y(-i) - ch / 2, cw + 0.5, ch + 0.5);
        }
        /* frame, quarters, zero line */
        ctx.strokeStyle = c.line; ctx.lineWidth = 1; ctx.strokeRect(R.x + 0.5, R.y + 0.5, R.w, R.h);
        ctx.font = '500 10.5px ' + v.MONO; ctx.fillStyle = c.ink2; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        [0, 12, 24, 36, 48].forEach(function (q, k) {
          var qx = Math.round(X(q * 60)) + 0.5;
          if (k > 0 && k < 4) { ctx.beginPath(); ctx.moveTo(qx, R.y); ctx.lineTo(qx, R.y + R.h); ctx.strokeStyle = v.alpha(c.ink2, 0.3); ctx.stroke(); }
          if (k < 4) ctx.fillText('Q' + (k + 1), X(q * 60 + 360), R.y + R.h + 6);
        });
        ctx.beginPath(); ctx.moveTo(R.x, Y(0)); ctx.lineTo(R.x + R.w, Y(0)); ctx.strokeStyle = v.alpha(c.ink, 0.45); ctx.stroke();
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        [20, 10, 0, -10, -20].forEach(function (t) { ctx.fillText(t === 0 ? 'level' : '+' + Math.abs(t), R.x - 6, Y(t)); });
        if (game) {
          ctx.save(); ctx.font = '600 10.5px ' + v.SANS; ctx.fillStyle = c.ink2; ctx.textAlign = 'center';
          ctx.translate(11, Y(L / 2)); ctx.rotate(-Math.PI / 2); ctx.fillText(game.home + ' ahead', 0, 0); ctx.restore();
          ctx.save(); ctx.font = '600 10.5px ' + v.SANS; ctx.fillStyle = c.ink2; ctx.textAlign = 'center';
          ctx.translate(11, Y(-L / 2)); ctx.rotate(-Math.PI / 2); ctx.fillText(game.away + ' ahead', 0, 0); ctx.restore();
          /* the game, as a step line clipped to the plot */
          ctx.save(); ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();
          ctx.beginPath(); ctx.moveTo(X(0), Y(0));
          var prev = 0, clamp = function (q) { return Math.max(-L - 0.4, Math.min(L + 0.4, q)); };
          for (i = 0; i < game.t.length; i++) {
            ctx.lineTo(X(game.t[i]), Y(clamp(prev))); ctx.lineTo(X(game.t[i]), Y(clamp(game.m[i]))); prev = game.m[i];
          }
          ctx.lineTo(X(2880), Y(clamp(prev)));
          ctx.strokeStyle = c.surface; ctx.lineWidth = 4.5; ctx.lineJoin = 'round'; ctx.stroke();
          ctx.strokeStyle = c.ink; ctx.lineWidth = 1.8; ctx.stroke();
          ctx.restore();
          /* the last lead change of this game */
          var sign = 0, last = null;
          for (i = 0; i < game.t.length; i++) {
            var s = game.m[i] > 0 ? 1 : game.m[i] < 0 ? -1 : 0;
            if (s && sign && s !== sign) last = game.t[i];
            if (s) sign = s;
          }
          if (last != null) {
            ctx.beginPath(); ctx.arc(X(last), Y(0), 5, 0, 6.2832); ctx.fillStyle = c.a1; ctx.fill();
            ctx.lineWidth = 2; ctx.strokeStyle = c.surface; ctx.stroke();
            v.label(ctx, 'last lead change', X(last) + (X(last) > R.x + R.w - 120 ? -9 : 9), Y(0) - 12,
              { align: X(last) > R.x + R.w - 120 ? 'right' : 'left', size: 10.5, weight: 600 });
          }
        }
        if (hover) {
          var hx = R.x + (hover.minute - 0.5) * cw, hy = Y(hover.margin) - ch / 2;
          ctx.strokeStyle = c.ink; ctx.lineWidth = 1.5; ctx.strokeRect(hx, hy, cw, ch);
        }
        /* colour scale */
        var sx = R.x + R.w - 150, sy = 4;
        if (w > 520) {
          for (i = 0; i < 80; i++) { ctx.fillStyle = v.mix(c.surface, c.a2, i / 79 * 0.92); ctx.fillRect(sx + 30 + i, sy, 1.5, 9); }
          ctx.strokeStyle = c.line; ctx.strokeRect(sx + 30.5, sy + 0.5, 80, 9);
          ctx.font = '500 10px ' + v.MONO; ctx.fillStyle = c.ink2; ctx.textBaseline = 'middle';
          ctx.textAlign = 'right'; ctx.fillText('50%', sx + 25, sy + 5); ctx.textAlign = 'left'; ctx.fillText('100%', sx + 115, sy + 5);
        }

        /* ---- last lead change, all games ---- */
        var S = { x: R.x, y: R.y + R.h + gap, w: R.w, h: stripH };
        v.title(ctx, 'When the last lead change happens · ' + data.llc_n.toLocaleString('en') + ' games', 0, S.y - 20);
        var mx = Math.max.apply(null, data.llc);
        ctx.fillStyle = c.a1;
        data.llc.forEach(function (n, k) {
          var bh = n / mx * S.h;
          ctx.fillRect(S.x + k * cw + 1, S.y + S.h - bh, cw - 2, bh);
        });
        ctx.strokeStyle = c.line; ctx.beginPath(); ctx.moveTo(S.x, S.y + S.h + 0.5); ctx.lineTo(S.x + S.w, S.y + S.h + 0.5); ctx.stroke();
        ctx.font = '500 10.5px ' + v.MONO; ctx.fillStyle = c.ink2; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        [0, 12, 24, 36, 48].forEach(function (q) { ctx.fillText(q + "'", X(q * 60), S.y + S.h + 6); });
        ctx.font = '500 11px ' + v.SANS; ctx.fillText('minute of play', S.x + S.w / 2, S.y + S.h + 21);
        if (hover) {
          ctx.strokeStyle = c.ink; ctx.lineWidth = 1.5;
          ctx.strokeRect(S.x + (hover.minute - 1) * cw + 1, S.y, cw - 2, S.h);
        }
      }
    });

    var out = v.readout();
    function say() {
      if (!data) return;
      if (hover) {
        var lead = Math.abs(hover.margin), cell = cellP(hover.minute, lead), share = data.llc[hover.minute - 1] / data.llc_n;
        var a = lead === 0 ? 'Level after ' + hover.minute + ' minutes.'
          : !cell || cell.p == null ? 'A lead of ' + lead + (lead >= data.maxlead ? ' or more' : '') + ' after ' + hover.minute + ' minutes: too few games to say.'
          : 'Teams ahead by ' + lead + (lead >= data.maxlead ? ' or more' : '') + ' after ' + hover.minute + ' minutes went on to win ' +
            pct(cell.p) + ' of ' + cell.n.toLocaleString('en') + ' such games.';
        out.textContent = a + ' In ' + (share * 100).toFixed(1) + '% of games the last lead change came in minute ' + hover.minute + '.';
        return;
      }
      var early = 0, late = 0;
      for (var i = 0; i < 6; i++) { early += data.llc[i]; late += data.llc[47 - i]; }
      out.textContent = game.label + ' (' + game.season + '), ' + game.changes + ' lead change' + (game.changes === 1 ? '' : 's') +
        '. Across all games the last one tends to come either very early or very late: ' + pct(early / data.llc_n) +
        ' in the first six minutes, ' + pct(late / data.llc_n) + ' in the last six. Move over the chart to read a cell.';
    }
    cv.pointer(function (x, y, type) {
      var hv = null;
      if (geo && type !== 'leave') {
        var R = geo.R, minute = Math.floor((x - R.x) / geo.cw + 0.5);
        if (minute >= 1 && minute <= 47 && y >= R.y) {
          var margin = y <= R.y + R.h ? geo.L - Math.floor((y - R.y) / geo.ch) : 0;
          hv = { minute: minute, margin: Math.max(-geo.L, Math.min(geo.L, margin)) };
        }
      }
      if ((hv && (!hover || hv.minute !== hover.minute || hv.margin !== hover.margin)) || (!hv && hover)) { hover = hv; cv.redraw(); say(); }
    });

    v.json('nba').then(function (d) {
      data = d;
      pickS.input.textContent = '';
      d.games.forEach(function (g, i) {
        var o = document.createElement('option'); o.value = String(i); o.textContent = g.why + ': ' + g.label + ' (' + g.season + ')';
        pickS.input.appendChild(o);
      });
      pickS.input.value = '0'; game = d.games[0];
      cv.redraw(); say();
    }).catch(function () { out.textContent = 'The data for this figure could not be loaded.'; });
  });
})();
