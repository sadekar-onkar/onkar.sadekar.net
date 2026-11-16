/* An infectious diseases hazard map for India based on mobility and
   transportation networks (Sadekar, Budamagunta, Sreejith, Jain, Santhanam —
   Current Science 121, 1208).

   The paper's network and the paper's measure. 446 cities, joined by the
   combined daily air, rail and road traffic. If P(n -> m) is the fraction of
   travellers leaving n who go to m, the length of that hop is
   d = 1 - ln P, and the effective distance from an outbreak city is the
   shortest path through the network. The paper's SIR simulations show the
   disease arriving in order of that distance, not of kilometres.

   The data file carries only the hops that can lie on a shortest path, so the
   distances computed here for any origin are exactly the paper's
   (tools/prep_viz_data.py checks Mumbai -> Thane 2.89, Pune 3.17, Delhi 3.70). */

(function () {
  'use strict';

  var LON0 = 67.5, LON1 = 98, LAT0 = 6, LAT1 = 37.5, KX = Math.cos(22 * Math.PI / 180);

  function dijkstra(data, src) {
    var n = data.cities.length, dist = new Float64Array(n).fill(Infinity), par = new Int32Array(n).fill(-1);
    var done = new Uint8Array(n), i, k;
    dist[src] = 0;
    for (var it = 0; it < n; it++) {
      var u = -1, best = Infinity;
      for (i = 0; i < n; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u < 0) break;
      done[u] = 1;
      for (k = data.start[u]; k < data.start[u + 1]; k++) {
        var w = data.to[k], nd = best + data.d100[k] / 100;
        if (nd < dist[w]) { dist[w] = nd; par[w] = u; }
      }
    }
    return { dist: dist, par: par };
  }
  function km(a, b) {
    var r = Math.PI / 180, dla = (b[1] - a[1]) * r, dlo = (b[2] - a[2]) * r;
    var h = Math.pow(Math.sin(dla / 2), 2) + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.pow(Math.sin(dlo / 2), 2);
    return 12742 * Math.asin(Math.sqrt(h));
  }

  PaperViz.register('hazard', function (v) {
    var data = null, origin = 0, sp = null, order = [], rank = null, dmax = 1;
    var front = 0, hover = -1, geoPts = [], ringPts = [];
    var MAJOR = ['Mumbai', 'Delhi', 'Kolkata', 'Chennai', 'Bangalore', 'Hyderabad', 'Patna', 'Guwahati', 'Tirupati', 'Lucknow', 'Ahmedabad', 'Kochi'];
    var ctl = v.controls();
    var where = v.select(ctl, { label: 'Outbreak starts in', options: [{ value: '0', label: 'Loading…' }], value: '0',
      onChange: function (i) { setOrigin(+i); } });
    var btns = v.el('div', 'viz-actions'); ctl.appendChild(btns);
    v.button(btns, 'Replay the outbreak', function () { front = 0; loop.kick(); });

    function setOrigin(i) {
      origin = i; sp = dijkstra(data, i);
      order = []; for (var k = 0; k < data.cities.length; k++) if (isFinite(sp.dist[k])) order.push(k);
      order.sort(function (a, b) { return sp.dist[a] - sp.dist[b]; });
      rank = new Int32Array(data.cities.length).fill(-1); order.forEach(function (c, k) { rank[c] = k; });
      dmax = sp.dist[order[order.length - 1]];
      front = v.reduced ? Infinity : 0;
      /* the menu lists a dozen cities; any other origin gets a temporary entry */
      var extra = where.input.querySelector('[data-extra]');
      if (extra) extra.remove();
      var known = Array.prototype.some.call(where.input.options, function (o) { return o.value === String(i); });
      if (!known) {
        extra = document.createElement('option'); extra.setAttribute('data-extra', '');
        extra.value = String(i); extra.textContent = data.cities[i][0]; where.input.appendChild(extra);
      }
      where.input.value = String(i);
      say(); cv.redraw(); loop.kick();
    }

    function colourOf(c, d) { return v.mix(c.a1, c.surface, Math.pow(d / dmax, 0.8) * 0.74); }

    /* One of the two views. pts: where each city sits in it. */
    function drawCities(ctx, c, pts, small) {
      var i, q, p;
      /* routes: each city reached so far, joined to the city it caught it from */
      ctx.beginPath();
      for (i = 0; i < order.length; i++) {
        q = order[i]; p = sp.par[q];
        if (p < 0 || sp.dist[q] > front) continue;
        ctx.moveTo(pts[p][0], pts[p][1]); ctx.lineTo(pts[q][0], pts[q][1]);
      }
      ctx.strokeStyle = v.alpha(c.a1, 0.18); ctx.lineWidth = 0.8; ctx.stroke();
      if (hover >= 0 && isFinite(sp.dist[hover])) {
        ctx.beginPath(); q = hover; ctx.moveTo(pts[q][0], pts[q][1]);
        while (sp.par[q] >= 0) { q = sp.par[q]; ctx.lineTo(pts[q][0], pts[q][1]); }
        ctx.strokeStyle = c.ink; ctx.lineWidth = 1.8; ctx.stroke();
      }
      /* far cities first, so the near ones sit on top */
      for (i = order.length - 1; i >= 0; i--) {
        q = order[i];
        var rad = Math.max(1.7, Math.sqrt(data.cities[q][3]) / 560 * (small ? 0.75 : 1));
        ctx.beginPath(); ctx.arc(pts[q][0], pts[q][1], rad, 0, 6.2832);
        ctx.fillStyle = sp.dist[q] <= front ? colourOf(c, sp.dist[q]) : v.alpha(c.ink2, 0.2);
        ctx.fill();
      }
      p = pts[origin];
      ctx.beginPath(); ctx.arc(p[0], p[1], 6.5, 0, 6.2832); ctx.fillStyle = c.ink; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = c.surface; ctx.stroke();
    }
    function nameCities(ctx, c, pts, R, count) {
      var named = [origin].concat(order.slice(1, 1 + count)), boxes = [];
      if (hover >= 0 && named.indexOf(hover) < 0) named.push(hover);
      named.forEach(function (q) {
        if (q !== origin && q !== hover && sp.dist[q] > front) return;
        var s = pts[q], right = s[0] > R.x + R.w - 96, bx = s[0] + (right ? -9 : 9), by = s[1] - 9;
        boxes.forEach(function (b) { if (Math.abs(b[0] - bx) < 84 && Math.abs(b[1] - by) < 13) by = b[1] - 13; });
        boxes.push([bx, by]);
        v.label(ctx, data.cities[q][0], bx, by, { align: right ? 'right' : 'left', weight: q === origin || q === hover ? 700 : 500, size: 11 });
      });
    }

    var cv = v.canvas({
      height: function (w) { return w >= 620 ? Math.round(Math.min(520, w * 0.5)) : Math.round(w * 2.02) + 60; },
      label: 'Two views of 446 Indian cities during an outbreak. On the map the cities reached so far are scattered; ' +
             'laid out by effective distance from the outbreak city, they form a growing disc.',
      draw: function (ctx, w, h, c) {
        if (!data || !sp) return;
        var parts = v.split(w, h, 0.5, 24), A = v.inset(parts[0], 0, 24, 0, 22), B = v.inset(parts[1], 0, 24, 0, 22), i, k;
        v.title(ctx, 'On the map', parts[0].x, parts[0].y);
        v.title(ctx, 'By effective distance from ' + data.cities[origin][0], parts[1].x, parts[1].y);

        /* ---- geography ---- */
        var sc = Math.min(A.w / ((LON1 - LON0) * KX), A.h / (LAT1 - LAT0));
        var ox = A.x + (A.w - sc * (LON1 - LON0) * KX) / 2, oy = A.y + (A.h - sc * (LAT1 - LAT0)) / 2;
        var MX = function (lon) { return ox + (lon - LON0) * KX * sc; }, MY = function (lat) { return oy + (LAT1 - lat) * sc; };
        ctx.beginPath();
        data.outline.forEach(function (ring) {
          ring.forEach(function (p, q) { if (q) ctx.lineTo(MX(p[0]), MY(p[1])); else ctx.moveTo(MX(p[0]), MY(p[1])); });
          ctx.closePath();
        });
        ctx.fillStyle = v.alpha(c.ink2, 0.07); ctx.fill();
        ctx.strokeStyle = v.alpha(c.ink2, 0.3); ctx.lineWidth = 0.8; ctx.stroke();
        geoPts = data.cities.map(function (ct) { return [MX(ct[2]), MY(ct[1])]; });
        drawCities(ctx, c, geoPts, w < 620);
        nameCities(ctx, c, geoPts, A, 3);

        /* ---- effective distance: radius is the distance, bearing is kept ---- */
        var cx = B.x + B.w / 2, cy = B.y + B.h / 2, Rmax = Math.min(B.w, B.h) / 2 - 8, o = geoPts[origin];
        ctx.font = '500 10px ' + v.MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        var stepR = dmax > 14 ? 4 : 2;
        for (k = stepR; k <= dmax; k += stepR) {
          ctx.beginPath(); ctx.arc(cx, cy, k / dmax * Rmax, 0, 6.2832); ctx.strokeStyle = c.line; ctx.lineWidth = 1; ctx.stroke();
          ctx.fillStyle = c.ink2; ctx.fillText(String(k), cx, cy - k / dmax * Rmax - 2);
        }
        ringPts = data.cities.map(function (ct, q) {
          if (q === origin || !isFinite(sp.dist[q])) return [cx, cy];
          var ang = Math.atan2(geoPts[q][1] - o[1], geoPts[q][0] - o[0]), rr = sp.dist[q] / dmax * Rmax;
          return [cx + rr * Math.cos(ang), cy + rr * Math.sin(ang)];
        });
        if (front < dmax) {
          ctx.beginPath(); ctx.arc(cx, cy, front / dmax * Rmax, 0, 6.2832);
          ctx.fillStyle = v.alpha(c.a1, 0.07); ctx.fill();
          ctx.strokeStyle = v.alpha(c.a1, 0.6); ctx.lineWidth = 2; ctx.stroke();
        }
        drawCities(ctx, c, ringPts, w < 620);
        nameCities(ctx, c, ringPts, B, 3);

        /* colour key */
        var kx = parts[0].x + 2, ky = parts[0].y + parts[0].h - 10;
        for (i = 0; i < 70; i++) { ctx.fillStyle = colourOf(c, i / 69 * dmax); ctx.fillRect(kx + 82 + i, ky, 1.5, 8); }
        ctx.font = '500 10px ' + v.MONO; ctx.fillStyle = c.ink2; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        ctx.fillText('reached early', kx, ky + 4); ctx.fillText('late', kx + 158, ky + 4);
      }
    });

    var out = v.readout();
    function say() {
      if (!data || !sp) return;
      var o = data.cities[origin];
      if (hover >= 0 && hover !== origin && isFinite(sp.dist[hover])) {
        var path = [], q = hover; while (q >= 0) { path.unshift(data.cities[q][0]); q = sp.par[q]; }
        out.textContent = data.cities[hover][0] + ': effective distance ' + sp.dist[hover].toFixed(2) + ' from ' + o[0] + ', number ' +
          rank[hover] + ' of ' + (order.length - 1) + ' to be reached, ' + Math.round(km(o, data.cities[hover])) + ' km away. Route: ' + path.join(' → ') + '.';
        return;
      }
      /* the most telling pair: a far city reached early, a near city reached late */
      var near = order.slice(1, 13), far = near.reduce(function (a, b) { return km(o, data.cities[b]) > km(o, data.cities[a]) ? b : a; });
      var dFar = km(o, data.cities[far]), late = -1;
      for (var k = order.length - 1; k > rank[far]; k--) {
        if (km(o, data.cities[order[k]]) < dFar * 0.5) { late = order[k]; break; }
      }
      out.textContent = 'Outbreak in ' + o[0] + '. First reached: ' + order.slice(1, 4).map(function (c2) { return data.cities[c2][0]; }).join(', ') + '. ' +
        data.cities[far][0] + ' is ' + Math.round(dFar) + ' km away and is number ' + rank[far] + ' of ' + (order.length - 1) +
        (late >= 0 ? '; ' + data.cities[late][0] + ', only ' + Math.round(km(o, data.cities[late])) + ' km away, is number ' + rank[late] + '.' : '.') +
        ' Click any city to start there.';
    }

    var loop = v.loop(function (dt) {
      if (front < dmax) front = Math.min(dmax, front + dt * dmax / 6);
      cv.redraw();
      if (front >= dmax) loop.sleep();
    });

    function nearest(x, y) {
      var best = -1, bd = 13 * 13;
      [geoPts, ringPts].forEach(function (pts) {
        pts.forEach(function (s, i) { var d = (s[0] - x) * (s[0] - x) + (s[1] - y) * (s[1] - y); if (d < bd) { bd = d; best = i; } });
      });
      return best;
    }
    cv.pointer(function (x, y, type) {
      if (!data) return;
      var n = type === 'leave' ? -1 : nearest(x, y);
      cv.el.style.cursor = n >= 0 ? 'pointer' : '';
      if (type === 'down' && n >= 0 && n !== origin) { hover = -1; setOrigin(n); return; }
      if (n !== hover) { hover = n; cv.redraw(); say(); }
    });

    v.json('hazard').then(function (d) {
      data = d;
      var idx = {}; d.cities.forEach(function (c2, i) { idx[c2[0]] = i; });
      where.input.textContent = '';
      MAJOR.forEach(function (name) {
        if (!(name in idx)) return;
        var o = document.createElement('option'); o.value = String(idx[name]); o.textContent = name; where.input.appendChild(o);
      });
      setOrigin(idx.Mumbai != null ? idx.Mumbai : 0);
    }).catch(function () { out.textContent = 'The data for this figure could not be loaded.'; });
  }, { dijkstra: dijkstra });
})();
