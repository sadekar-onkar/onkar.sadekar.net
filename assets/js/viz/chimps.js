/* Population connectivity shapes the distribution and complexity of
   chimpanzee cumulative culture
   (Gunasekaram, Battiston, Sadekar, ... Migliano — Science 386, 920).

   The paper's data, drawn directly: 35 chimpanzee populations, the foraging
   behaviours recorded at each, and which pairs of populations share genetic
   markers of past migration. A line joins two sites that share at least one
   behaviour of the chosen kind; it is drawn strongly when that pair is also
   linked genetically. The percentages in the bars are counted from the same
   file, nothing is modelled.

   Site positions are approximate (entered by hand, good to about a degree;
   see tools/prep_viz_data.py) and the coastline is a sketch. */

(function () {
  'use strict';

  /* Atlantic coast from Senegal to Angola, [lon, lat] */
  var COAST = [[-17, 15.5], [-17.5, 14.7], [-16.8, 13.5], [-16.7, 12.4], [-16, 11.9], [-15, 10.9], [-14.5, 10.4],
    [-13.7, 9.5], [-13.2, 8.5], [-12.5, 7.4], [-11.4, 6.8], [-10.8, 6.3], [-9.3, 5.2], [-7.7, 4.4], [-6, 4.8],
    [-4, 5.3], [-3, 5.1], [-2, 4.7], [-0.2, 5.5], [1.2, 6.1], [2.4, 6.35], [3.4, 6.4], [4.5, 6.3], [5.3, 5.5],
    [6, 4.3], [7, 4.4], [8.3, 4.5], [8.9, 4], [9.7, 3.9], [9.8, 2.5], [9.8, 1], [9.3, 0.4], [8.8, -0.7],
    [9.4, -1.9], [10, -2.7], [11, -3.9], [11.8, -4.8], [12.3, -6], [12.8, -7], [13.2, -8.5]];
  var LON0 = -19, LON1 = 34, LAT0 = -8.5, LAT1 = 15.5;
  var REGIONS = { W: 'Western', NC: 'Nigeria–Cameroon', C: 'Central', E: 'Eastern' };

  PaperViz.register('chimps', function (v) {
    var data = null, hover = -1, pts = [], stats = {};
    var ctl = v.controls();
    var cls = v.segmented(ctl, { label: 'Behaviours shared between sites', value: 'complex', options: [
      { value: 'nontool', label: 'no tools' }, { value: 'simple', label: 'simple tools' }, { value: 'complex', label: 'complex toolsets' }],
      onChange: function () { cv.redraw(); say(); } });
    var mark = v.segmented(ctl, { label: 'Genetic link between sites', value: 'ibd', options: [
      { value: 'ibd', label: 'recent (IBD segments)' }, { value: 'nepra', label: 'older (rare alleles)' }],
      onChange: function () { cv.redraw(); say(); } });

    function key(i, j) { return i < j ? i + '-' + j : j + '-' + i; }
    function prepare() {
      var sets = { ibd: {}, nepra: {} }, n = data.sites.length, all = n * (n - 1) / 2;
      ['ibd', 'nepra'].forEach(function (g) { data[g].forEach(function (e) { sets[g][key(e[0], e[1])] = 1; }); });
      data.sets = sets;
      ['ibd', 'nepra'].forEach(function (g) {
        stats[g] = { base: data[g].length / all };
        Object.keys(data.classes).forEach(function (k) {
          var links = data.classes[k].links, hit = links.filter(function (l) { return sets[g][key(l[0], l[1])]; }).length;
          stats[g][k] = { n: links.length, hit: hit };
        });
      });
    }

    var cv = v.canvas({
      height: function (w) { return w >= 620 ? Math.round(Math.max(320, w * 0.31)) : Math.round(w * 0.47 + 310); },
      label: 'Map of 35 chimpanzee field sites across equatorial Africa with lines joining sites that share behaviours, ' +
             'and bars comparing how often such pairs are also linked genetically.',
      draw: function (ctx, w, h, c) {
        if (!data) return;
        var wide = w >= 620, M = wide ? { x: 0, y: 0, w: Math.round(w * 0.66), h: h } : { x: 0, y: 0, w: w, h: Math.round(w * 0.47) };
        var B = wide ? { x: M.w + 26, y: 0, w: w - M.w - 26, h: h } : { x: 0, y: M.h + 22, w: w, h: h - M.h - 22 };
        var sc = Math.min(M.w / (LON1 - LON0), M.h / (LAT1 - LAT0));
        var ox = M.x + (M.w - sc * (LON1 - LON0)) / 2, oy = M.y + (M.h - sc * (LAT1 - LAT0)) / 2;
        var X = function (lon) { return ox + (lon - LON0) * sc; }, Y = function (lat) { return oy + (LAT1 - lat) * sc; };
        var i, g = mark.value, k = cls.value, C = data.classes[k];

        /* land */
        ctx.save();
        ctx.beginPath(); ctx.rect(ox, oy, sc * (LON1 - LON0), sc * (LAT1 - LAT0)); ctx.clip();
        ctx.beginPath(); ctx.moveTo(X(COAST[0][0]), Y(COAST[0][1]));
        COAST.forEach(function (p) { ctx.lineTo(X(p[0]), Y(p[1])); });
        ctx.lineTo(X(LON1), Y(LAT0)); ctx.lineTo(X(LON1), Y(LAT1)); ctx.closePath();
        ctx.fillStyle = v.alpha(c.ink2, 0.09); ctx.fill();
        ctx.strokeStyle = v.alpha(c.ink2, 0.35); ctx.lineWidth = 1; ctx.stroke();
        ctx.restore();
        v.label(ctx, 'Atlantic', X(-8), Y(0), { align: 'center', colour: c.ink2, size: 10.5, halo: 'rgba(0,0,0,0)' });

        var has = {};
        C.behaviours.forEach(function (b) { b.sites.forEach(function (s) { has[s] = 1; }); });
        pts = data.sites.map(function (s) { return [X(s[3]), Y(s[2])]; });

        /* links: unmatched first and faint, genetically matched on top */
        [0, 1].forEach(function (pass) {
          C.links.forEach(function (l) {
            var matched = !!data.sets[g][key(l[0], l[1])];
            if (matched !== !!pass) return;
            var on = hover < 0 || l[0] === hover || l[1] === hover;
            var a = pts[l[0]], b = pts[l[1]], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 - Math.abs(a[0] - b[0]) * 0.18;
            ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(mx, my, b[0], b[1]);
            ctx.strokeStyle = matched ? v.alpha(c.a1, on ? 0.85 : 0.12) : v.alpha(c.ink2, on ? 0.35 : 0.06);
            ctx.lineWidth = matched ? 1.8 : 1; ctx.stroke();
          });
        });
        /* sites */
        for (i = 0; i < pts.length; i++) {
          var p = pts[i], active = has[i];
          ctx.beginPath(); ctx.arc(p[0], p[1], active ? 5 : 3, 0, 6.2832);
          ctx.fillStyle = active ? c.ink : c.surface; ctx.fill();
          ctx.lineWidth = active ? 2 : 1.2; ctx.strokeStyle = active ? c.surface : c.ink2; ctx.stroke();
        }
        if (hover >= 0) {
          var hp = pts[hover];
          ctx.beginPath(); ctx.arc(hp[0], hp[1], 8, 0, 6.2832); ctx.strokeStyle = c.ink; ctx.lineWidth = 1.5; ctx.stroke();
          v.label(ctx, data.sites[hover][0], hp[0] + (hp[0] > M.x + M.w - 110 ? -12 : 12), hp[1] - 12,
            { align: hp[0] > M.x + M.w - 110 ? 'right' : 'left', weight: 600 });
        }
        /* subspecies ranges, as plain captions under the map */
        ctx.font = '500 10px ' + v.MONO; ctx.fillStyle = c.ink2; ctx.textBaseline = 'bottom'; ctx.textAlign = 'center';
        [['WESTERN', -9.5, 13.9], ['NIGERIA–CAMEROON', 9, 9.6], ['CENTRAL', 14.5, -5.6], ['EASTERN', 28.5, 6.3]].forEach(function (r) {
          ctx.fillText(r[0], X(r[1]), Y(r[2]));
        });

        /* ---- bars: share of sharing pairs that are also genetically linked ---- */
        v.title(ctx, 'Sharing pairs that are also genetically linked', B.x, B.y);
        var rows = [['nontool', 'no tools'], ['simple', 'simple tools'], ['complex', 'complex toolsets']];
        var by = B.y + 34, bw = B.w - 46, rowH = wide ? Math.min(62, (B.h - 110) / 3) : 58, base = stats[g].base;
        rows.forEach(function (r, n) {
          var st = stats[g][r[0]], f = st.hit / st.n, y = by + n * rowH, sel = r[0] === k;
          ctx.font = (sel ? '600' : '500') + ' 11.5px ' + v.SANS; ctx.fillStyle = sel ? c.ink : c.ink2;
          ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(r[1], B.x, y);
          ctx.fillStyle = v.alpha(c.ink2, 0.12); ctx.fillRect(B.x, y + 18, bw, 12);
          ctx.fillStyle = sel ? c.a1 : v.alpha(c.a1, 0.4);
          ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(B.x, y + 18, bw * f, 12, [0, 3, 3, 0]); else ctx.rect(B.x, y + 18, bw * f, 12); ctx.fill();
          ctx.font = '500 11px ' + v.MONO; ctx.fillStyle = c.ink; ctx.textBaseline = 'middle';
          ctx.fillText(Math.round(f * 100) + '%', B.x + bw + 8, y + 24);
          ctx.font = '500 10px ' + v.MONO; ctx.fillStyle = c.ink2; ctx.textBaseline = 'top';
          ctx.fillText(st.hit + ' of ' + st.n + ' pairs', B.x, y + 33);
        });
        /* what chance alone would give: the share of ALL pairs that are linked */
        var bx = B.x + bw * base;
        ctx.beginPath(); ctx.setLineDash([3, 3]);
        rows.forEach(function (r, n) { ctx.moveTo(bx + 0.5, by + n * rowH + 14); ctx.lineTo(bx + 0.5, by + n * rowH + 34); });
        ctx.strokeStyle = c.ink; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
        var cy = by + 3 * rowH + 6;
        ctx.font = '500 10.5px ' + v.SANS; ctx.fillStyle = c.ink2; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.beginPath(); ctx.setLineDash([3, 3]); ctx.moveTo(B.x, cy + 7); ctx.lineTo(B.x + 16, cy + 7); ctx.strokeStyle = c.ink; ctx.stroke(); ctx.setLineDash([]);
        ctx.fillText('any two sites: ' + Math.round(base * 100) + '%', B.x + 22, cy);
        cy += 22;
        ctx.strokeStyle = v.alpha(c.a1, 0.85); ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(B.x, cy + 7); ctx.lineTo(B.x + 16, cy + 7); ctx.stroke();
        ctx.fillText('shared behaviour and genetic link', B.x + 22, cy);
        cy += 18;
        ctx.strokeStyle = v.alpha(c.ink2, 0.5); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(B.x, cy + 7); ctx.lineTo(B.x + 16, cy + 7); ctx.stroke();
        ctx.fillText('shared behaviour only', B.x + 22, cy);
      }
    });

    var out = v.readout();
    function say() {
      if (!data) return;
      var g = mark.value, k = cls.value, C = data.classes[k], st = stats[g][k];
      if (hover >= 0) {
        var s = data.sites[hover], list = C.behaviours.filter(function (b) { return b.sites.indexOf(hover) >= 0; })
          .map(function (b) { return b.name.toLowerCase(); });
        out.textContent = s[0] + ' (' + REGIONS[s[1]] + ' chimpanzees): ' +
          (list.length ? list.join(', ') + '.' : 'none of the ' + C.label.toLowerCase() + ' behaviours recorded here.');
        return;
      }
      out.textContent = C.label + ' (' + C.behaviours.map(function (b) { return b.name.toLowerCase(); }).join(', ') + '): ' +
        st.hit + ' of the ' + st.n + ' pairs of sites that share one are also linked by ' +
        (g === 'ibd' ? 'recent migration' : 'older shared ancestry') + ', which is ' + Math.round(100 * st.hit / st.n) +
        '% against ' + Math.round(100 * stats[g].base) + '% for any two sites.';
    }
    cv.pointer(function (x, y, type) {
      var best = -1, bd = 16 * 16;
      if (type !== 'leave') pts.forEach(function (p, i) {
        var d = (p[0] - x) * (p[0] - x) + (p[1] - y) * (p[1] - y);
        if (d < bd) { bd = d; best = i; }
      });
      if (best !== hover) { hover = best; cv.redraw(); say(); }
    });

    v.json('chimps').then(function (d) { data = d; prepare(); cv.redraw(); say(); })
      .catch(function () { out.textContent = 'The data for this figure could not be loaded.'; });
  });
})();
