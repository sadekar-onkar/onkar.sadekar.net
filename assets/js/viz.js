/* The interactive figure under each paper on the publications page.

   This file is the shell: it opens and closes a paper's panel, loads that
   paper's module from assets/js/viz/<key>.js the first time it is opened, and
   hands the module a small toolkit (a canvas that follows the theme and the
   container width, sliders, an animation loop that stops when nobody can see
   it). Nothing is fetched or run until a panel is opened, so the page costs
   the same as before for a visitor who never clicks.

   Plain canvas and plain DOM, no libraries — the same rule as the rest of the
   site. Colours come from the CSS custom properties, so every palette and the
   light/dark switch are followed automatically.

   A module looks like this:

       PaperViz.register('key', function (v) {
         var s = v.slider(v.controls(), {label: 'x', min: 0, max: 1, value: .5,
                                         onInput: function () { cv.redraw(); }});
         var cv = v.canvas({height: 320, draw: function (ctx, w, h, c) { ... }});
       });
*/

(function () {
  'use strict';

  var registry = {};      // key -> init function
  var pending = {};       // key -> [callbacks] while the script loads
  var instances = [];     // every live viz, for theme changes
  var root = document.documentElement;
  var base = (function () {
    var s = document.currentScript && document.currentScript.src;
    return s ? s.replace(/js\/viz\.js.*$/, '') : 'assets/';
  })();

  var reduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------ colours -- */

  var probe = document.createElement('canvas').getContext('2d');

  function rgb(colour) {
    probe.fillStyle = '#000';
    probe.fillStyle = colour;
    var c = probe.fillStyle;
    if (c[0] === '#') {
      var n = parseInt(c.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    var m = c.match(/[\d.]+/g) || [0, 0, 0];
    return [+m[0], +m[1], +m[2]];
  }
  function alpha(colour, a) {
    var c = rgb(colour);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }
  /* A colour between two others; t = 0 gives `from`, 1 gives `to`. */
  function mix(from, to, t) {
    var a = rgb(from), b = rgb(to);
    t = Math.max(0, Math.min(1, t));
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * t) + ',' +
      Math.round(a[1] + (b[1] - a[1]) * t) + ',' + Math.round(a[2] + (b[2] - a[2]) * t) + ')';
  }

  function readColours() {
    var s = getComputedStyle(root);
    var g = function (n) { return s.getPropertyValue(n).trim(); };
    return {
      bg: g('--bg'), soft: g('--bg-soft'), surface: g('--surface'),
      ink: g('--ink'), ink2: g('--ink-2'), line: g('--line'),
      a1: g('--a1'), a2: g('--a2'), a3: g('--a3'), a4: g('--a4'), a1ink: g('--a1-ink')
    };
  }

  var MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';
  var SANS = 'Inter, -apple-system, "Segoe UI", sans-serif';

  /* ------------------------------------------------------------ toolkit -- */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  var uid = 0;

  function Viz(panel, stage, key) {
    this.panel = panel;
    this.stage = stage;
    this.key = key;
    this.c = readColours();
    this.reduced = reduced;
    this.canvases = [];
    this.loops = [];
    this.open = true;
    this.visible = true;
    this.alpha = alpha;
    this.mix = mix;
    this.MONO = MONO;
    this.SANS = SANS;
    var self = this;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        self.visible = es[es.length - 1].isIntersecting;
        self._kick();
      }).observe(stage);
    }
  }

  Viz.prototype.el = el;

  Viz.prototype.controls = function () {
    var d = el('div', 'viz-controls');
    this.stage.appendChild(d);
    return d;
  };

  /* A labelled range input. Returns {value, set(v), input}. */
  Viz.prototype.slider = function (parent, o) {
    var id = 'vz' + (++uid);
    var wrap = el('div', 'viz-field');
    var lab = el('label', 'viz-label', o.label);
    lab.htmlFor = id;
    var out = el('output', 'viz-value');
    out.htmlFor = id;
    var input = el('input', 'viz-range');
    input.type = 'range'; input.id = id;
    input.min = o.min; input.max = o.max; input.step = o.step || 'any';
    input.value = o.value;
    var fmt = o.fmt || function (x) { return (+x).toFixed(2); };
    var api = {
      input: input, value: +o.value,
      set: function (x, silent) {
        input.value = x; api.value = +input.value; out.textContent = fmt(api.value);
        if (!silent && o.onInput) o.onInput(api.value);
      }
    };
    input.addEventListener('input', function () {
      api.value = +input.value; out.textContent = fmt(api.value);
      if (o.onInput) o.onInput(api.value);
    });
    out.textContent = fmt(api.value);
    var head = el('div', 'viz-field-head');
    head.appendChild(lab); head.appendChild(out);
    wrap.appendChild(head); wrap.appendChild(input);
    if (o.hint) wrap.appendChild(el('span', 'viz-hint', o.hint));
    parent.appendChild(wrap);
    return api;
  };

  Viz.prototype.button = function (parent, label, onClick, cls) {
    var b = el('button', 'viz-btn' + (cls ? ' ' + cls : ''), label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    parent.appendChild(b);
    return b;
  };

  /* A row of mutually exclusive buttons. Returns {value, set(v)}. */
  Viz.prototype.segmented = function (parent, o) {
    var wrap = el('div', 'viz-field viz-field--seg' + (o.wide ? ' viz-field--wide' : ''));
    if (o.label) wrap.appendChild(el('span', 'viz-label', o.label));
    var row = el('div', 'viz-seg');
    row.setAttribute('role', 'group');
    if (o.label) row.setAttribute('aria-label', o.label);
    var api = { value: o.value };
    var btns = o.options.map(function (opt) {
      var b = el('button', 'viz-seg-btn', opt.label);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(opt.value === o.value));
      b.addEventListener('click', function () { api.set(opt.value); });
      row.appendChild(b);
      return { b: b, value: opt.value };
    });
    api.set = function (val, silent) {
      api.value = val;
      btns.forEach(function (x) { x.b.setAttribute('aria-pressed', String(x.value === val)); });
      if (!silent && o.onChange) o.onChange(val);
    };
    wrap.appendChild(row);
    parent.appendChild(wrap);
    return api;
  };

  Viz.prototype.select = function (parent, o) {
    var id = 'vz' + (++uid);
    var wrap = el('div', 'viz-field');
    var lab = el('label', 'viz-label', o.label);
    lab.htmlFor = id;
    var sel = el('select', 'viz-select');
    sel.id = id;
    o.options.forEach(function (opt) {
      var op = el('option', null, opt.label);
      op.value = opt.value;
      sel.appendChild(op);
    });
    sel.value = o.value;
    var api = { value: o.value, input: sel,
      set: function (val, silent) { sel.value = val; api.value = sel.value; if (!silent && o.onChange) o.onChange(api.value); } };
    sel.addEventListener('change', function () { api.value = sel.value; if (o.onChange) o.onChange(sel.value); });
    wrap.appendChild(lab); wrap.appendChild(sel);
    parent.appendChild(wrap);
    return api;
  };

  /* One line of live text under the figure. */
  Viz.prototype.readout = function () {
    var p = el('p', 'viz-readout');
    p.setAttribute('aria-live', 'polite');
    this.stage.appendChild(p);
    return p;
  };

  /* A canvas that fills the stage width, keeps its height rule, is sharp on
     retina screens and redraws on resize and on theme change.
       o.height  number, or function (width) -> height
       o.draw    function (ctx, w, h, colours)
       o.label   accessible description
     Returns {el, ctx, w, h, redraw(), pointer(fn)}. */
  Viz.prototype.canvas = function (o) {
    var self = this;
    var wrap = el('div', 'viz-canvas');
    var cv = el('canvas');
    cv.setAttribute('role', 'img');
    if (o.label) cv.setAttribute('aria-label', o.label);
    wrap.appendChild(cv);
    (o.parent || this.stage).appendChild(wrap);
    var ctx = cv.getContext('2d');
    var api = { el: cv, wrap: wrap, ctx: ctx, w: 0, h: 0, dirty: true };

    function size() {
      var w = Math.floor(wrap.clientWidth);
      if (!w) return false;
      var h = Math.round(typeof o.height === 'function' ? o.height(w) : (o.height || 320));
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (w !== api.w || h !== api.h || dpr !== api.dpr) {
        api.w = w; api.h = h; api.dpr = dpr;
        cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
        cv.style.height = h + 'px';
        if (o.resize) o.resize(w, h);
      }
      return true;
    }
    api.redraw = function () {
      if (!size()) return;
      ctx.setTransform(api.dpr, 0, 0, api.dpr, 0, 0);
      ctx.clearRect(0, 0, api.w, api.h);
      o.draw(ctx, api.w, api.h, self.c);
    };
    /* fn(x, y, type, event) with x, y in CSS pixels; type is move | down | up | leave */
    api.pointer = function (fn) {
      var at = function (e, type) {
        var r = cv.getBoundingClientRect();
        fn(e.clientX - r.left, e.clientY - r.top, type, e);
      };
      cv.addEventListener('pointermove', function (e) { at(e, 'move'); });
      cv.addEventListener('pointerdown', function (e) {
        if (cv.setPointerCapture) { try { cv.setPointerCapture(e.pointerId); } catch (x) {} }
        at(e, 'down');
      });
      cv.addEventListener('pointerup', function (e) { at(e, 'up'); });
      cv.addEventListener('pointerleave', function (e) { at(e, 'leave'); });
      cv.addEventListener('pointercancel', function (e) { at(e, 'leave'); });
    };
    if ('ResizeObserver' in window) {
      new ResizeObserver(function () { api.redraw(); }).observe(wrap);
    } else {
      window.addEventListener('resize', api.redraw);
    }
    this.canvases.push(api);
    api.redraw();
    return api;
  };

  /* An animation loop. step(dt) is called once per frame, dt in seconds and
     capped so that a background tab coming back does not jump. It only runs
     while the panel is open, on screen, and the tab is visible. Returns
     {running, play(), pause(), toggle(), kick(), sleep()}; `running` is what the
     user asked for. */
  Viz.prototype.loop = function (step, autoplay) {
    var self = this, raf = 0, last = 0, asleep = false;
    var api = { running: autoplay !== false && !reduced };
    function frame(t) {
      raf = 0;
      if (!api.running || !self.open || !self.visible || document.hidden) return;
      var dt = last ? Math.min((t - last) / 1000, 0.05) : 0.016;
      last = t;
      step(dt);
      if (!asleep) raf = requestAnimationFrame(frame);
    }
    /* kick() (re)starts the frames if they are allowed to run; a step that
       has nothing left to animate calls sleep() and is woken by the next kick. */
    api.kick = function () {
      asleep = false;
      if (!raf && api.running && self.open && self.visible && !document.hidden) {
        last = 0; raf = requestAnimationFrame(frame);
      }
    };
    api.sleep = function () { asleep = true; };
    api.play = function () { api.running = true; api.kick(); if (api.onChange) api.onChange(); };
    api.pause = function () { api.running = false; if (api.onChange) api.onChange(); };
    api.toggle = function () { if (api.running) api.pause(); else api.play(); };
    this.loops.push(api);
    api.kick();
    return api;
  };

  /* A play/pause button wired to a loop. */
  Viz.prototype.playButton = function (parent, loop) {
    var b = this.button(parent, '', function () { loop.toggle(); });
    function sync() {
      b.textContent = loop.running ? 'Pause' : 'Play';
      b.setAttribute('aria-pressed', String(loop.running));
    }
    loop.onChange = sync;
    sync();
    return b;
  };

  Viz.prototype._kick = function () {
    this.loops.forEach(function (l) { l.kick(); });
  };

  Viz.prototype.redrawAll = function () {
    this.canvases.forEach(function (c) { c.redraw(); });
  };

  Viz.prototype.json = function (name) {
    return fetch(base + 'data/viz/' + name + '.json').then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  };

  /* Axes for a chart drawn inside rect r = {x, y, w, h}. Returns the two
     scales. Grid and labels are deliberately quiet; the data is the figure.
       o: xmin xmax ymin ymax, xticks yticks (arrays), xfmt yfmt,
          xlabel ylabel, grid (default true) */
  Viz.prototype.axes = function (ctx, r, o) {
    var c = this.c;
    var X = function (v) { return r.x + (v - o.xmin) / (o.xmax - o.xmin) * r.w; };
    var Y = function (v) { return r.y + r.h - (v - o.ymin) / (o.ymax - o.ymin) * r.h; };
    var xf = o.xfmt || String, yf = o.yfmt || String;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.font = '500 10.5px ' + MONO;
    ctx.fillStyle = c.ink2;
    ctx.strokeStyle = c.line;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
    (o.yticks || []).forEach(function (t) {
      var y = Math.round(Y(t)) + 0.5;
      if (o.grid !== false) { ctx.beginPath(); ctx.moveTo(r.x, y); ctx.lineTo(r.x + r.w, y); ctx.stroke(); }
      ctx.fillText(yf(t), r.x - 7, y);
    });
    ctx.textBaseline = 'top';
    (o.xticks || []).forEach(function (t, i, all) {
      var x = Math.round(X(t)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, r.y + r.h); ctx.lineTo(x, r.y + r.h + 4); ctx.stroke();
      /* o.xedge: the end labels are words, so keep them inside the plot */
      ctx.textAlign = !o.xedge ? 'center' : i === 0 ? 'left' : i === all.length - 1 ? 'right' : 'center';
      ctx.fillText(xf(t), x, r.y + r.h + 7);
    });
    ctx.textAlign = 'center';
    ctx.beginPath();
    ctx.moveTo(r.x + 0.5, r.y); ctx.lineTo(r.x + 0.5, r.y + r.h + 0.5); ctx.lineTo(r.x + r.w, r.y + r.h + 0.5);
    ctx.stroke();
    ctx.font = '500 11px ' + SANS;
    if (o.xlabel) { ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(o.xlabel, r.x + r.w / 2, r.y + r.h + 22); }
    if (o.ylabel) {
      ctx.save(); ctx.translate(r.x - (o.ypad || 34), r.y + r.h / 2); ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(o.ylabel, 0, 0); ctx.restore();
    }
    ctx.restore();
    return { X: X, Y: Y };
  };

  /* A small heading inside a canvas panel. */
  Viz.prototype.title = function (ctx, text, x, y) {
    ctx.save();
    ctx.font = '600 11.5px ' + SANS;
    ctx.fillStyle = this.c.ink;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(text, x, y);
    ctx.restore();
  };

  /* Text with a halo of the surface colour, so it stays readable on top of
     marks. */
  Viz.prototype.label = function (ctx, text, x, y, o) {
    o = o || {};
    ctx.save();
    ctx.font = (o.weight || 500) + ' ' + (o.size || 11) + 'px ' + (o.mono ? MONO : SANS);
    ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.baseline || 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = 3.5;
    ctx.strokeStyle = o.halo || this.c.surface;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = o.colour || this.c.ink;
    ctx.fillText(text, x, y);
    ctx.restore();
  };

  /* Two panels side by side when there is room, stacked when there is not.
     Returns [rectA, rectB] in canvas pixels. */
  Viz.prototype.split = function (w, h, frac, gap) {
    gap = gap == null ? 28 : gap;
    if (w >= 620) {
      var wa = Math.round((w - gap) * (frac || 0.5));
      return [{ x: 0, y: 0, w: wa, h: h }, { x: wa + gap, y: 0, w: w - wa - gap, h: h }];
    }
    var ha = Math.round((h - gap) * 0.5);
    return [{ x: 0, y: 0, w: w, h: ha }, { x: 0, y: ha + gap, w: w, h: h - ha - gap }];
  };
  Viz.prototype.inset = function (r, l, t, rr, b) {
    return { x: r.x + l, y: r.y + t, w: r.w - l - rr, h: r.h - t - b };
  };

  /* --------------------------------------------------------- the shell -- */

  function loadModule(key, done) {
    if (registry[key]) return done(null);
    if (pending[key]) return pending[key].push(done);
    pending[key] = [done];
    var s = document.createElement('script');
    s.src = base + 'js/viz/' + key + '.js';
    s.onload = function () {
      var q = pending[key]; delete pending[key];
      q.forEach(function (f) { f(registry[key] ? null : new Error('module did not register')); });
    };
    s.onerror = function () {
      var q = pending[key]; delete pending[key];
      q.forEach(function (f) { f(new Error('could not load')); });
    };
    document.head.appendChild(s);
  }

  function start(panel) {
    var key = panel.getAttribute('data-viz');
    var stage = panel.querySelector('[data-viz-stage]');
    if (panel._viz || !stage) return;
    panel._viz = 'loading';
    stage.textContent = '';
    stage.appendChild(el('p', 'viz-loading', 'Loading…'));
    loadModule(key, function (err) {
      stage.textContent = '';
      if (err) {
        panel._viz = null;
        stage.appendChild(el('p', 'viz-loading', 'The interactive figure could not be loaded.'));
        return;
      }
      var v = new Viz(panel, stage, key);
      panel._viz = v;
      instances.push(v);
      try {
        registry[key](v);
      } catch (e) {
        stage.textContent = '';
        stage.appendChild(el('p', 'viz-loading', 'The interactive figure failed to start.'));
        if (window.console) console.error(e);
      }
    });
  }

  function setOpen(panel, open, scroll) {
    var btn = document.querySelector('[data-viz-open="' + panel.id + '"]');
    panel.hidden = !open;
    if (btn) btn.setAttribute('aria-expanded', String(open));
    if (open) {
      if (!panel._viz) start(panel);
      else if (panel._viz !== 'loading') { panel._viz.open = true; panel._viz.redrawAll(); panel._viz._kick(); }
      if (scroll) {
        var li = panel.closest('.pub') || panel;
        if (li.hidden) li.hidden = false;
        li.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      }
    } else if (panel._viz && panel._viz !== 'loading') {
      panel._viz.open = false;
    }
  }

  function fromHash() {
    var id = decodeURIComponent(location.hash.slice(1));
    if (!/^viz-[a-z0-9-]+$/.test(id)) return;
    var panel = document.getElementById(id);
    if (panel && panel.hasAttribute('data-viz')) setOpen(panel, true, true);
  }

  function boot() {
    document.querySelectorAll('[data-viz-open]').forEach(function (btn) {
      var panel = document.getElementById(btn.getAttribute('data-viz-open'));
      if (!panel) return;
      btn.hidden = false;
      btn.addEventListener('click', function () {
        var open = panel.hidden;
        setOpen(panel, open, false);
        if (open && history.replaceState) history.replaceState(null, '', '#' + panel.id);
      });
    });
    document.querySelectorAll('[data-viz-close]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var panel = btn.closest('[data-viz]');
        setOpen(panel, false, false);
        var opener = document.querySelector('[data-viz-open="' + panel.id + '"]');
        if (opener) opener.focus();
      });
    });
    fromHash();
    window.addEventListener('hashchange', fromHash);
    document.addEventListener('visibilitychange', function () {
      instances.forEach(function (v) { v._kick(); });
    });
    /* follow the theme and palette switches */
    new MutationObserver(function () {
      instances.forEach(function (v) { v.c = readColours(); v.redrawAll(); });
    }).observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-palette'] });
  }

  window.PaperViz = {
    register: function (key, init, extras) {
      registry[key] = init;
      if (extras) window.PaperViz.models[key] = extras;
    },
    models: {}
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
