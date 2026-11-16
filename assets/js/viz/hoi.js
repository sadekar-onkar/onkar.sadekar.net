/* Higher-order interactions shape collective human behaviour
   (Battiston, Capraro, Karimi, Lehmann, Migliano, Sadekar, Sánchez, Perc —
   Nature Human Behaviour 9, 2441).

   A review has no single result to replay, so this is one of the models it
   covers, small enough to poke at: social contagion with group reinforcement
   (the "simplicial contagion" model of Iacopini et al., Nat. Commun. 2019).

   Someone who has adopted a behaviour passes it along each link at rate beta.
   On top of that, a group of three in which the two others have both adopted
   convinces the third at rate beta_delta. Adopters give up at rate 1. The
   sliders are the rescaled strengths lambda = beta <k> and
   lambda_delta = beta_delta <k_delta>, <k> and <k_delta> being the mean number
   of links and of triangles per person in this particular network. */

(function () {
  'use strict';

  /* a small seeded generator, so the network is the same on every visit */
  function lcg(seed) { var s = seed >>> 0; return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

  function makeModel(N, rand) {
    rand = rand || Math.random;
    var g = lcg(11), pos = [], i, j, k;
    /* jittered grid -> evenly spread points in a 3:2 box */
    var cols = Math.round(Math.sqrt(N * 1.5)), rows = Math.ceil(N / cols);
    for (i = 0; i < N; i++) pos.push([(i % cols + 0.2 + 0.6 * g()) / cols, (Math.floor(i / cols) + 0.2 + 0.6 * g()) / rows]);
    var R = 1.55 / cols, nbr = [], tris = [], triOf = [], edges = [];
    for (i = 0; i < N; i++) { nbr.push([]); triOf.push([]); }
    var d = function (a, b) { return Math.hypot(pos[a][0] - pos[b][0], (pos[a][1] - pos[b][1]) * rows / cols); };
    for (i = 0; i < N; i++) for (j = i + 1; j < N; j++) if (d(i, j) < R) { nbr[i].push(j); nbr[j].push(i); edges.push([i, j]); }
    /* a little under half of the closed triads become genuine three-person groups */
    for (i = 0; i < N; i++) for (j = i + 1; j < N; j++) if (nbr[i].indexOf(j) >= 0)
      for (k = j + 1; k < N; k++) if (nbr[i].indexOf(k) >= 0 && nbr[j].indexOf(k) >= 0 && g() < 0.45) {
        triOf[i].push(tris.length); triOf[j].push(tris.length); triOf[k].push(tris.length); tris.push([i, j, k]);
      }
    var s = new Uint8Array(N);
    var m = { N: N, pos: pos, edges: edges, tris: tris, nbr: nbr, triOf: triOf, s: s, aspect: cols / rows,
              lam: 0.7, lamD: 0, kMean: 2 * edges.length / N, kDMean: 3 * tris.length / N };
    m.seed = function (frac) { for (var q = 0; q < N; q++) s[q] = rand() < frac ? 1 : 0; };
    m.count = function () { var c = 0; for (var q = 0; q < N; q++) c += s[q]; return c; };
    m.step = function (dt) {
      var beta = m.lam / m.kMean, betaD = m.kDMean ? m.lamD / m.kDMean : 0, next = new Uint8Array(N), q, a, t;
      for (q = 0; q < N; q++) {
        if (s[q]) { next[q] = rand() < dt ? 0 : 1; continue; }
        var rate = 0, list = nbr[q];
        for (a = 0; a < list.length; a++) rate += beta * s[list[a]];
        for (a = 0; a < triOf[q].length; a++) { t = tris[triOf[q][a]]; if (s[t[0]] + s[t[1]] + s[t[2]] === 2) rate += betaD; }
        next[q] = rand() < 1 - Math.exp(-rate * dt) ? 1 : 0;
      }
      s.set(next);
    };
    return m;
  }

  PaperViz.register('hoi', function (v) {
    var model = makeModel(150), trace = [], layout = null;
    var ctl = v.controls();
    var lam = v.slider(ctl, { label: 'Pull of one friend, λ', min: 0, max: 2, step: 0.05, value: 0.9,
      onInput: function (x) { model.lam = x; loop.kick(); } });
    var lamD = v.slider(ctl, { label: 'Extra pull of a group, λΔ', min: 0, max: 6, step: 0.1, value: 4.5,
      fmt: function (x) { return x.toFixed(1); }, onInput: function (x) { model.lamD = x; loop.kick(); } });
    var btns = v.el('div', 'viz-actions'); ctl.appendChild(btns);
    model.lam = lam.value; model.lamD = lamD.value;

    function seed(f) { model.seed(f); trace = []; cv.redraw(); loop.kick(); }

    var cv = v.canvas({
      height: function (w) { return w >= 620 ? 380 : 660; },
      label: 'A network of 150 people joined by links and by shaded three-person groups; people who have adopted the ' +
             'behaviour are filled in. Beside it, the share of adopters over time.',
      draw: function (ctx, w, h, c) {
        var parts = v.split(w, h, 0.62), A = parts[0], B = parts[1], i;
        v.title(ctx, '150 people · click anyone to change their mind', A.x, A.y);
        var box = v.inset(A, 6, 28, 6, 28), sw = Math.min(box.w, box.h * model.aspect), sh = sw / model.aspect;
        var ox = box.x + (box.w - sw) / 2, oy = box.y + (box.h - sh) / 2;
        var P = function (q) { return [ox + model.pos[q][0] * sw, oy + model.pos[q][1] * sh]; };
        layout = { P: P, r: Math.max(4, sw / 85) };
        model.tris.forEach(function (t) {
          var n = model.s[t[0]] + model.s[t[1]] + model.s[t[2]], a = P(t[0]), b = P(t[1]), d = P(t[2]);
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(d[0], d[1]); ctx.closePath();
          ctx.fillStyle = n >= 2 ? v.alpha(c.a1, 0.28) : v.alpha(c.ink2, 0.1); ctx.fill();
        });
        ctx.lineWidth = 1; ctx.strokeStyle = v.alpha(c.ink2, 0.4); ctx.beginPath();
        model.edges.forEach(function (e) { var a = P(e[0]), b = P(e[1]); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); });
        ctx.stroke();
        for (i = 0; i < model.N; i++) {
          var p = P(i);
          ctx.beginPath(); ctx.arc(p[0], p[1], layout.r, 0, 6.2832);
          ctx.fillStyle = model.s[i] ? c.a1 : c.surface; ctx.fill();
          ctx.lineWidth = 1.5; ctx.strokeStyle = model.s[i] ? c.a1 : c.ink2; ctx.stroke();
        }
        var kx = A.x + 6, ky = A.y + A.h - 8;
        ctx.font = '500 11px ' + v.SANS; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        ctx.fillStyle = c.a1; ctx.beginPath(); ctx.arc(kx + 5, ky, 5, 0, 6.2832); ctx.fill();
        ctx.fillStyle = c.ink; ctx.fillText('has adopted', kx + 15, ky); kx += 96;
        ctx.fillStyle = v.alpha(c.a1, 0.28); ctx.fillRect(kx, ky - 6, 14, 12);
        ctx.fillStyle = c.ink; ctx.fillText('group with two adopters: pressure on the third', kx + 20, ky);

        v.title(ctx, 'Adopters over time', B.x, B.y);
        var Q = v.inset(B, 40, 28, 10, 34);
        var ax = v.axes(ctx, Q, { xmin: 0, xmax: 1, ymin: 0, ymax: 1, yticks: [0, 0.5, 1], xticks: [],
          yfmt: function (y) { return Math.round(y * 100) + '%'; }, xlabel: 'time →' });
        if (trace.length > 1) {
          ctx.beginPath();
          trace.forEach(function (y, k) { var x = Q.x + k / 320 * Q.w; if (k) ctx.lineTo(x, ax.Y(y)); else ctx.moveTo(x, ax.Y(y)); });
          ctx.strokeStyle = c.a1; ctx.lineWidth = 2; ctx.stroke();
        }
      }
    });

    var out = v.readout();
    var acc = 0, since = 0;
    var loop = v.loop(function (dt) {
      acc += dt * 1.6;                              // model time per second
      while (acc > 0.04) { model.step(0.04); acc -= 0.04; }
      since += dt;
      if (since > 0.08) {
        since = 0;
        var f = model.count() / model.N;
        trace.push(f); if (trace.length > 320) trace.shift();
        out.textContent = Math.round(f * 100) + '% have adopted. ' +
          (f === 0 ? 'It has died out: seed it again.'
            : model.lamD === 0 ? 'Only links are spreading it; each friend is a separate, weak push.'
            : 'Groups add pressure whenever two of the three have adopted. Slide the group pull to zero and watch what is left.');
      }
      cv.redraw();
    });
    v.playButton(btns, loop);
    v.button(btns, 'Seed a few', function () { seed(0.05); });
    v.button(btns, 'Seed 40%', function () { seed(0.4); });

    cv.pointer(function (x, y, type) {
      if (type !== 'down' || !layout) return;
      var best = -1, bd = 18 * 18;
      for (var i = 0; i < model.N; i++) {
        var p = layout.P(i), d = (p[0] - x) * (p[0] - x) + (p[1] - y) * (p[1] - y);
        if (d < bd) { bd = d; best = i; }
      }
      if (best >= 0) { model.s[best] = 1 - model.s[best]; cv.redraw(); loop.kick(); }
    });
    seed(0.4);
  }, { makeModel: makeModel });
})();
