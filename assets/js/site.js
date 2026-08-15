/* site.js — theme + palette switching, nav, small progressive enhancements.
   No dependencies. Safe to load with `defer`.
   The palette/theme are applied by an inline <head> script (see any page) so
   there is no flash of the wrong colours; this file only wires up the UI. */

(function () {
  'use strict';

  var root = document.documentElement;
  var STORE_THEME = 'os-theme';
  var STORE_PALETTE = 'os-palette';

  var PALETTES = [
    { id: 'citrus', name: 'Ink & citrus', dots: ['#c04319', '#0f6f68', '#8a6410'] },
    { id: 'coral', name: 'Coral & mustard', dots: ['#c93e2d', '#0c7f7f', '#8a6510'] },
    { id: 'indigo', name: 'Indigo & lime', dots: ['#4f46e5', '#4d7c0f', '#7c3aed'] },
    { id: 'botanical', name: 'Moss & clay', dots: ['#3f6b3a', '#a9522c', '#3f6f9e'] }
  ];

  function store(key, val) {
    try { localStorage.setItem(key, val); } catch (e) { /* private mode */ }
  }
  function read(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  /* --- theme (light/dark) ------------------------------------------------ */

  function currentTheme() {
    return root.getAttribute('data-theme') ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }

  function setTheme(theme) {
    root.setAttribute('data-theme', theme);
    store(STORE_THEME, theme);
    var btn = document.querySelector('[data-theme-toggle]');
    if (btn) {
      btn.setAttribute('aria-label',
        theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    }
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: theme } }));
  }

  /* --- palette ----------------------------------------------------------- */

  function setPalette(id) {
    root.setAttribute('data-palette', id);
    store(STORE_PALETTE, id);
    document.querySelectorAll('[data-palette-option]').forEach(function (b) {
      b.setAttribute('aria-checked', String(b.dataset.paletteOption === id));
    });
    window.dispatchEvent(new CustomEvent('themechange', { detail: { palette: id } }));
  }

  function buildPaletteMenu() {
    var host = document.querySelector('[data-palette-menu]');
    if (!host) return;
    var active = root.getAttribute('data-palette') || 'citrus';
    var html = '<h4>Colour palette</h4>';
    PALETTES.forEach(function (p) {
      html += '<button type="button" role="menuitemradio" data-palette-option="' + p.id +
        '" aria-checked="' + (p.id === active) + '">' +
        '<span class="dots" aria-hidden="true">' +
        p.dots.map(function (d) { return '<span style="background:' + d + '"></span>'; }).join('') +
        '</span>' + p.name + '</button>';
    });
    host.innerHTML = html;
    host.querySelectorAll('[data-palette-option]').forEach(function (b) {
      b.addEventListener('click', function () {
        setPalette(b.dataset.paletteOption);
        closeMenu();
      });
    });
  }

  function closeMenu() {
    var menu = document.querySelector('[data-palette-menu]');
    var btn = document.querySelector('[data-palette-toggle]');
    if (menu) menu.setAttribute('data-open', 'false');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  /* --- wiring ------------------------------------------------------------ */

  document.addEventListener('DOMContentLoaded', function () {
    root.classList.remove('no-js');

    // theme toggle
    var themeBtn = document.querySelector('[data-theme-toggle]');
    if (themeBtn) {
      themeBtn.addEventListener('click', function () {
        setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
      });
      setTheme(currentTheme());
    }

    // follow the OS unless the visitor has made an explicit choice
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onChange = function (e) {
      if (!read(STORE_THEME)) root.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    };
    if (mq.addEventListener) mq.addEventListener('change', onChange);

    // palette menu
    buildPaletteMenu();
    var palBtn = document.querySelector('[data-palette-toggle]');
    var palMenu = document.querySelector('[data-palette-menu]');
    if (palBtn && palMenu) {
      palBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = palMenu.getAttribute('data-open') === 'true';
        palMenu.setAttribute('data-open', String(!open));
        palBtn.setAttribute('aria-expanded', String(!open));
      });
      document.addEventListener('click', function (e) {
        if (!palMenu.contains(e.target) && e.target !== palBtn) closeMenu();
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeMenu();
      });
    }

    // mobile nav
    var navBtn = document.querySelector('[data-nav-toggle]');
    var navList = document.querySelector('[data-nav-links]');
    if (navBtn && navList) {
      navBtn.addEventListener('click', function () {
        var open = navList.getAttribute('data-open') === 'true';
        navList.setAttribute('data-open', String(!open));
        navBtn.setAttribute('aria-expanded', String(!open));
      });
    }

    // hairline under the header once you scroll
    var header = document.querySelector('.site-header');
    if (header) {
      var onScroll = function () {
        header.classList.toggle('is-stuck', window.scrollY > 8);
      };
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    // reveal-on-scroll
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var reveals = document.querySelectorAll('.reveal');
    if (reduced || !('IntersectionObserver' in window)) {
      reveals.forEach(function (el) { el.classList.add('is-in'); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry, i) {
          if (!entry.isIntersecting) return;
          var el = entry.target;
          setTimeout(function () { el.classList.add('is-in'); },
            Math.min(i * 60, 240));
          io.unobserve(el);
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
      reveals.forEach(function (el) { io.observe(el); });
    }

    // publication filters (progressive enhancement — the list is real HTML)
    var filters = document.querySelectorAll('[data-filter]');
    if (filters.length) {
      var items = document.querySelectorAll('.pub');
      var count = document.querySelector('[data-pub-count]');
      filters.forEach(function (btn) {
        btn.addEventListener('click', function () {
          var tag = btn.dataset.filter;
          filters.forEach(function (b) {
            b.setAttribute('aria-pressed', String(b === btn));
          });
          var shown = 0;
          items.forEach(function (item) {
            var tags = (item.dataset.tags || '').split(' ');
            var show = tag === 'all' || tags.indexOf(tag) !== -1;
            item.hidden = !show;
            if (show) shown++;
          });
          if (count) {
            count.textContent = shown + (shown === 1 ? ' paper' : ' papers');
          }
        });
      });
    }

    // year in footer
    document.querySelectorAll('[data-year]').forEach(function (el) {
      el.textContent = String(new Date().getFullYear());
    });
  });
})();
