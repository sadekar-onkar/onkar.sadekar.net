#!/usr/bin/env python3
"""Build the static site from content/*.md.

    python3 build.py            -> writes _site/
    python3 build.py --serve    -> writes _site/ and serves it on :8000

You should never need to edit HTML. Everything on the site comes from the
Markdown files in content/ and the assets in files/. GitHub Actions runs this
on every push, so editing a .md file and pushing is the whole workflow.

Entry format used throughout content/:

    ### Some title
    key: value
    key: another value

    Free Markdown body, until the next ### heading.

Dependencies (build-time only — the site it emits is plain HTML/CSS/JS with
no runtime dependencies at all): markdown, pyyaml.
"""

import os, re, sys, shutil, html, datetime, math

try:
    import yaml, markdown as md_lib
except ImportError:
    sys.exit("Missing build deps. Run:  pip3 install markdown pyyaml")

ROOT = os.path.dirname(os.path.abspath(__file__))
CONTENT = os.path.join(ROOT, 'content')
FILES = os.path.join(ROOT, 'files')
ASSETS = os.path.join(ROOT, 'assets')
OUT = os.path.join(ROOT, '_site')

MD = md_lib.Markdown(extensions=['extra', 'smarty'])


def md(text):
    """Markdown -> HTML."""
    if not text or not text.strip():
        return ''
    MD.reset()
    return MD.convert(text.strip())


def md_inline(text):
    """Markdown for a fragment, without the wrapping <p>."""
    out = md(text)
    if out.startswith('<p>') and out.endswith('</p>') and out.count('<p>') == 1:
        out = out[3:-4]
    return out


# --------------------------------------------------------------- parsing ---

def read(name):
    path = os.path.join(CONTENT, name)
    if not os.path.exists(path):
        return {}, ''
    raw = open(path, encoding='utf-8').read()
    meta = {}
    if raw.startswith('---'):
        end = raw.find('\n---', 3)
        if end != -1:
            meta = yaml.safe_load(raw[3:end]) or {}
            raw = raw[end + 4:]
    return meta, raw


def entries(body, level='###'):
    """Split a body into [{title, <keys>, body}] on `level` headings."""
    pat = re.compile(r'^%s\s+(.*)$' % re.escape(level), re.M)
    out, marks = [], list(pat.finditer(body))
    for i, m in enumerate(marks):
        chunk = body[m.end():marks[i + 1].start() if i + 1 < len(marks) else len(body)]
        item = {'title': m.group(1).strip()}
        lines, rest = chunk.strip('\n').split('\n'), []
        consuming = True
        for j, line in enumerate(lines):
            kv = re.match(r'^([a-z][a-z0-9_]*):\s*(.*)$', line) if consuming else None
            if kv:
                item[kv.group(1)] = kv.group(2).strip()
            else:
                if line.strip() == '' and consuming:
                    continue
                consuming = False
                rest.append(line)
        item['body'] = '\n'.join(rest).strip()
        out.append(item)
    return out


def sections(body):
    """Split a body into [(heading, sub-body)] on ## headings."""
    pat = re.compile(r'^##\s+(.*)$', re.M)
    marks = list(pat.finditer(body))
    if not marks:
        return [(None, body)]
    return [(m.group(1).strip(),
             body[m.end():marks[i + 1].start() if i + 1 < len(marks) else len(body)])
            for i, m in enumerate(marks)]


def split_list(value):
    return [v.strip() for v in re.split(r'[,|]', value or '') if v.strip()]


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


# ------------------------------------------------------------------ site ---

SITE, _ = read('site.md')
NAV = SITE.get('nav', [])


def e(s):
    return html.escape(str(s), quote=True)


def authors_html(text):
    """Bold the site owner wherever they appear in an author list."""
    me = SITE.get('short_name', 'O. Sadekar')
    parts = [a.strip() for a in text.split(',')]
    return ', '.join(
        ('<span class="me">%s</span>' % e(a)) if a == me else e(a) for a in parts)


def links_html(value, cls='pub-link'):
    """`Label | url, Label | url` -> anchors."""
    out = []
    for item in re.split(r',(?![^|]*\|[^,]*$)', value or ''):
        if '|' not in item:
            continue
        label, url = item.split('|', 1)
        out.append('<a class="%s" href="%s">%s</a>' % (cls, e(url.strip()), e(label.strip())))
    return ''.join(out)


# ---------------------------------------------------------------- layout ---

ICONS = {
    'email': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 7 8.5 6 8.5-6"/></svg>',
    'scholar': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2 8.5l10 5.5 10-5.5L12 3Z"/><path d="M6 11v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/></svg>',
    'github': '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48l-.01-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85l-.01 2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"/></svg>',
    'arxiv': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h5"/></svg>',
    'orcid': '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 8h1.4v8H9zM12.4 8h2.8c2 0 3.2 1.6 3.2 4s-1.3 4-3.2 4h-2.8zm1.4 1.3v5.4h1.3c1.4 0 2-1.1 2-2.7s-.6-2.7-2-2.7z"/></svg>',
}

WASH = '''<div class="wash" aria-hidden="true">
        <svg viewBox="0 0 320 200" fill="none">
          <g stroke="currentColor" stroke-width="1" opacity="0.35">
            <path d="M40 100 L110 45 L180 80 L250 40 L300 95 L240 150 L160 160 L90 150 Z"/>
            <path d="M110 45 L160 160 M180 80 L240 150 M40 100 L180 80 M110 45 L250 40 M90 150 L180 80"/>
          </g>
          <g fill="currentColor" opacity="0.14">
            <path d="M110 45 L180 80 L90 150 Z"/>
            <path d="M180 80 L250 40 L240 150 Z"/>
          </g>
          <g fill="currentColor">
            <circle cx="40" cy="100" r="4"/><circle cx="110" cy="45" r="5.5"/>
            <circle cx="180" cy="80" r="6.5"/><circle cx="250" cy="40" r="4.5"/>
            <circle cx="300" cy="95" r="3.5"/><circle cx="240" cy="150" r="5"/>
            <circle cx="160" cy="160" r="4"/><circle cx="90" cy="150" r="4.5"/>
          </g>
        </svg>
      </div>'''


def page(filename, title, description, body, extra_js='', og_type='article'):
    nav_items = '\n'.join(
        '      <li><a href="%s"%s>%s</a></li>' %
        (n['url'], ' aria-current="page"' if n['url'] == filename else '', e(n['label']))
        for n in NAV)

    footer_links = '\n'.join(
        '          <li><a href="%s">%s</a></li>' % (n['url'], e(n['label']))
        for n in NAV if n['url'] != 'index.html')

    elsewhere = '\n'.join(
        '          <li><a href="%s">%s</a></li>' % (e(l['url']), e(l['label']))
        for l in SITE.get('links', []))

    canonical = '' if filename == 'index.html' else filename

    doc = '''<!DOCTYPE html>
<html lang="en" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>%(title)s</title>
<meta name="description" content="%(desc)s">
<link rel="canonical" href="%(base)s/%(canon)s">
<meta property="og:type" content="%(ogtype)s">
<meta property="og:title" content="%(title)s">
<meta property="og:description" content="%(desc)s">
<meta property="og:url" content="%(base)s/%(canon)s">
<meta property="og:image" content="%(base)s/assets/img/%(photo)s">
<meta name="twitter:card" content="summary">
<link rel="icon" href="assets/img/favicon.svg" type="image/svg+xml">
<link rel="preload" href="assets/fonts/SpaceGrotesk-var.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="assets/fonts/Inter-var.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="assets/css/site.css">
<script>
/* Apply the saved theme + palette before first paint (no flash of wrong colours). */
(function(){try{var t=localStorage.getItem('theme-v2'),p=localStorage.getItem('palette-v2');
document.documentElement.setAttribute('data-theme',t||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'));
if(p)document.documentElement.setAttribute('data-palette',p);}catch(e){}})();
</script>
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>

<header class="site-header">
  <div class="wrap nav">
    <a class="brand" href="index.html">
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
        <path class="n-edge" d="M6 18 L12 6 L18 18 Z" fill="none"/>
        <circle class="n-node" cx="12" cy="6" r="2.6"/>
        <circle class="n-node" cx="6" cy="18" r="2.6"/>
        <circle class="n-node" cx="18" cy="18" r="2.6"/>
      </svg>
      %(name)s
    </a>

    <ul class="nav-links" data-nav-links>
%(nav)s
    </ul>

    <div class="nav-right">
      <div class="themebar">
        <button class="icon-btn" type="button" data-theme-toggle aria-label="Switch colour theme">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="4.2"/>
            <path d="M12 2.6v2M12 19.4v2M2.6 12h2M19.4 12h2M5.4 5.4l1.4 1.4M17.2 17.2l1.4 1.4M18.6 5.4l-1.4 1.4M6.8 17.2l-1.4 1.4"/>
          </svg>
        </button>
        <button class="swatch" type="button" data-palette-toggle aria-haspopup="true" aria-expanded="false" aria-label="Change colour palette">
          <i aria-hidden="true"></i>
        </button>
      </div>
      <div class="palette-menu" data-palette-menu role="menu" data-open="false"></div>
      <button class="nav-toggle" type="button" data-nav-toggle aria-expanded="false" aria-label="Menu">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16"/>
        </svg>
      </button>
    </div>
  </div>
</header>

<main id="main">
%(body)s
</main>

<footer class="site-footer">
  <div class="wrap">
    <div class="footer-grid">
      <div>
        <h4>%(name)s</h4>
        <p style="font-size:0.92rem; color:var(--ink-2); margin:0">
          %(role)s<br>
          %(dept)s<br>
          %(inst)s
        </p>
      </div>
      <div>
        <h4>Site</h4>
        <ul>
%(footlinks)s
        </ul>
      </div>
      <div>
        <h4>Elsewhere</h4>
        <ul>
%(elsewhere)s
          <li><a href="mailto:%(email)s">Email</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <p>&copy; <span data-year>%(year)s</span> %(name)s</p>
      <p class="mono">Built by hand. No frameworks, no trackers.</p>
    </div>
  </div>
</footer>

<script src="assets/js/site.js" defer></script>
%(extrajs)s
</body>
</html>
''' % dict(title=e(title), desc=e(description), base=SITE['base_url'], canon=canonical,
           ogtype=og_type, photo=SITE.get('photo', 'photo.jpg'),
           name=e(SITE['name']), nav=nav_items, body=body,
           role=e(SITE.get('role', '')), dept=e(SITE.get('department', '')),
           inst=e(SITE.get('institution', '')), footlinks=footer_links,
           elsewhere=elsewhere, email=e(SITE.get('email', '')),
           year=datetime.date.today().year, extrajs=extra_js)

    open(os.path.join(OUT, filename), 'w', encoding='utf-8').write(doc)
    return len(doc)


def page_head(eyebrow, h1, lede):
    return '''  <section class="page-head">
    <div class="wrap">
      <p class="eyebrow">%s</p>
      <h1>%s</h1>
      <p class="lede">%s</p>
      %s
    </div>
  </section>
''' % (e(eyebrow), e(h1), md_inline(lede), WASH)


def section_head(title, trailing=''):
    return ('      <div class="section-head"><h2>%s</h2>'
            '<span class="rule" aria-hidden="true"></span>%s</div>\n'
            % (e(title), trailing))


def timeline(items):
    out = ['      <ol class="timeline">']
    for it in items:
        date, _, rest = it['title'].partition('—')
        if not rest:
            date, rest = '', it['title']
        out.append('        <li class="tl-item">\n'
                   '          <div class="tl-date">%s</div>\n'
                   '          <div class="tl-body"><h3>%s</h3>%s</div>\n'
                   '        </li>' % (e(date.strip()), md_inline(rest.strip()), md(it['body'])))
    out.append('      </ol>')
    return '\n'.join(out) + '\n'


def rows(items):
    out = ['      <div class="rows">']
    for it in items:
        date, _, rest = it['title'].partition('—')
        if not rest:
            date, rest = '', it['title']
        out.append('        <div class="row">\n'
                   '          <div class="row-key">%s</div>\n'
                   '          <div class="row-val"><h3>%s</h3>%s</div>\n'
                   '        </div>' % (e(date.strip()), md_inline(rest.strip()), md(it['body'])))
    out.append('      </div>')
    return '\n'.join(out) + '\n'


# ------------------------------------------------------ publication model ---

def load_publications():
    """Parse publications.md. `tags:`/`concepts:` are written as plain labels
    right on the paper ("Higher-order networks", not a slug) — there is no
    separate vocabulary file to keep in sync. This slugifies each label into
    a stable key for data-attributes/CSS, and collects key -> label (first
    seen wins) so filter buttons and the bipartite diagram can be built
    without any other config."""
    meta, body = read('publications.md')
    groups = []
    tag_labels, concept_labels = {}, {}
    for heading, sub in sections(body):
        papers = []
        for it in entries(sub):
            tags, concepts = [], []
            for label in split_list(it.get('tags', '')):
                key = slug(label)
                tag_labels.setdefault(key, label)
                tags.append(key)
            for label in split_list(it.get('concepts', '')):
                key = slug(label)
                concept_labels.setdefault(key, label)
                concepts.append(key)
            papers.append({
                'title': it['title'],
                'authors': it.get('authors', ''),
                'venue': it.get('venue', ''),
                'year': it.get('year', ''),
                'badge': it.get('badge', ''),
                'tags': tags,
                'concepts': concepts,
                'links': it.get('links', ''),
                'note': it['body'],
            })
        groups.append((heading, papers))
    return meta, groups, tag_labels, concept_labels


def pub_item(p):
    first = re.search(r'\|\s*([^,]+)', p['links'])
    href = first.group(1).strip() if first else None
    title = ('<a href="%s">%s</a>' % (e(href), md_inline(p['title']))) if href else md_inline(p['title'])
    badge = '<span class="pub-badge">%s</span>' % e(p['badge']) if p['badge'] else ''
    venue = md_inline(p['venue']) if p['venue'] else ''
    return ('        <li class="pub" data-tags="%s" data-concepts="%s">\n'
            '          <div>\n'
            '            <h3 class="pub-title">%s%s</h3>\n'
            '            <p class="pub-authors">%s</p>\n'
            '            <p class="pub-venue">%s</p>\n'
            '            <div class="pub-links">%s</div>\n'
            '          </div>\n'
            '        </li>\n'
            % (e(' '.join(p['tags'])), e(' '.join(p['concepts'])),
               title, badge, authors_html(p['authors']), venue, links_html(p['links'])))


# ------------------------------------------ static bipartite concept graph ---

def bipartite_svg(papers, concept_labels):
    """A deterministic two-column bipartite diagram: concepts | papers.

    No physics, no JavaScript. Hover highlighting is done with CSS :has(),
    which degrades to a plain static picture in browsers without it.
    """
    used = []
    for p in papers:
        for c in p['concepts']:
            if c not in used:
                used.append(c)
    # busiest concepts first, so the heavy edges sit together
    used.sort(key=lambda c: -sum(1 for p in papers if c in p['concepts']))

    # order papers by their first concept to reduce edge crossings
    ordered = sorted([p for p in papers if p['concepts']],
                     key=lambda p: (used.index(p['concepts'][0]), p['title']))

    row = 30
    padding = 26
    height = max(len(used), len(ordered)) * row + padding * 2
    width = 980
    cx, px = 250, 600          # column x positions

    def ypos(i, n):
        span = (n - 1) * row
        return padding + (height - padding * 2 - span) / 2 + i * row

    parts = ['<svg class="bip" viewBox="0 0 %d %d" role="img" '
             'aria-label="Bipartite diagram linking each paper to the concepts it uses.">'
             % (width, height)]

    # edges first so nodes sit on top
    for pi, p in enumerate(ordered):
        py = ypos(pi, len(ordered))
        for c in p['concepts']:
            ci = used.index(c)
            cy = ypos(ci, len(used))
            mid = (cx + px) / 2
            parts.append(
                '<path class="bip-edge e-%s" d="M%d %.1f C%d %.1f %d %.1f %d %.1f"/>'
                % (e(c), cx + 6, cy, mid, cy, mid, py, px - 6, py))

    for ci, c in enumerate(used):
        cy = ypos(ci, len(used))
        n = sum(1 for p in ordered if c in p['concepts'])
        parts.append('<g class="bip-concept c-%s">' % e(c))
        parts.append('<circle class="bip-dot" cx="%d" cy="%.1f" r="%.1f"/>'
                     % (cx, cy, 4 + min(n, 8) * 0.7))
        parts.append('<text class="bip-label bip-label--left" x="%d" y="%.1f">%s</text>'
                     % (cx - 14, cy + 4, e(concept_labels.get(c, c))))
        parts.append('<text class="bip-count" x="%d" y="%.1f">%d</text>' % (cx + 16, cy + 4, n))
        parts.append('</g>')

    for pi, p in enumerate(ordered):
        py = ypos(pi, len(ordered))
        cls = ' '.join('e-%s' % c for c in p['concepts'])
        label = re.sub(r'<[^>]+>', '', md_inline(p['title']))
        if len(label) > 44:
            label = label[:43].rstrip() + '…'
        parts.append('<g class="bip-paper %s">' % e(cls))
        parts.append('<circle class="bip-dot bip-dot--paper" cx="%d" cy="%.1f" r="4"/>' % (px, py))
        parts.append('<text class="bip-label" x="%d" y="%.1f">%s</text>'
                     % (px + 14, py + 4, e(label)))
        parts.append('</g>')

    parts.append('</svg>')

    hover = '\n'.join(
        'svg.bip:has(.c-%s:hover) .bip-edge:not(.e-%s),'
        'svg.bip:has(.c-%s:hover) .bip-paper:not(.e-%s){opacity:.12}' % (c, c, c, c)
        for c in used)

    return ('      <figure class="bipfig">\n        <div class="bipfig-scroll">%s</div>\n'
            '        <figcaption>Every paper and the ideas it uses. '
            'Hover a concept on the left to pick out its papers.</figcaption>\n'
            '      </figure>\n      <style>%s</style>\n' % (''.join(parts), hover))


# ----------------------------------------------------------------- pages ---

def build_home():
    meta, body = read('home.md')
    secs = dict(sections(body))

    about = secs.get('About', '')
    positions = entries(secs.get('Positions', ''))
    themes = entries(secs.get('Themes', ''))
    _, newsbody = read('news.md')
    news = entries(newsbody)[:int(SITE.get('news_on_home', 6))]

    _, pubgroups, _, _ = load_publications()
    allpapers = [p for _, ps in pubgroups for p in ps]
    selected_titles = split_list(meta.get('selected', ''))
    selected = [p for t in selected_titles
                for p in allpapers if p['title'].lower().startswith(t.lower()[:40])]

    theme_cards = []
    for i, t in enumerate(themes):
        chips = ''.join('<li class="chip">%s</li>' % e(c) for c in split_list(t.get('chips', '')))
        theme_cards.append(
            '        <article class="card card--link card--theme t%d reveal">\n'
            '          <span class="num">%02d</span>\n'
            '          <h3><a href="%s">%s</a></h3>\n'
            '          %s\n'
            '          <ul class="chips">%s</ul>\n'
            '        </article>\n'
            % (i + 1, i + 1, e(t.get('url', 'research.html')), md_inline(t['title']),
               md(t['body']), chips))

    pubs = ''.join(
        '        <li class="pub">\n          <div>\n'
        '            <h3 class="pub-title">%s</h3>\n'
        '            <p class="pub-authors">%s</p>\n'
        '            <p class="pub-venue">%s</p>\n'
        '          </div>\n        </li>\n'
        % (('<a href="%s">%s</a>' % (e(re.search(r'\|\s*([^,]+)', p['links']).group(1).strip()),
                                     md_inline(p['title'])))
           if re.search(r'\|\s*([^,]+)', p['links']) else md_inline(p['title']),
           authors_html(p['authors']), md_inline(p['venue']))
        for p in selected)

    contact = ''.join(
        '        <li><a href="%s">%s<span class="ll-key">%s</span>'
        '<span class="ll-val">%s</span></a></li>\n'
        % (e(l['url']), ICONS.get(l.get('icon', ''), ''), e(l['label']), e(l.get('text', l['url'])))
        for l in SITE.get('contact', []))

    body_html = '''  <section class="hero">
    <div class="hero-bg" data-network="ambient" aria-hidden="true"><canvas></canvas></div>
    <div class="wrap">
      <div class="hero-grid">
        <div>
          <p class="eyebrow">%(eyebrow)s</p>
          <h1>%(first)s <span class="accent">%(last)s</span></h1>
          <p class="hero-role">%(tagline)s</p>
          <div class="hero-actions">
            <a class="btn btn--primary" href="research.html">What I work on
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>
            <a class="btn" href="publications.html">Publications</a>
            <a class="btn" href="assets/pdf/%(cv)s">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 11l5 5 5-5M4 20h16"/></svg>
              CV</a>
          </div>
        </div>
        <figure class="hero-portrait">
          <img src="assets/img/%(photo)s" width="720" height="900" alt="%(name)s">
        </figure>
      </div>
    </div>
  </section>

  <section class="section section--soft">
    <div class="wrap">
%(abouthead)s      <div class="grid grid--2" style="align-items:start; gap:clamp(2rem,5vw,3.5rem)">
        <div>%(about)s</div>
        <div>%(positions)s</div>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="wrap">
%(themehead)s      <div class="grid grid--2">
%(themes)s      </div>
    </div>
  </section>

  <section class="section section--soft">
    <div class="wrap">
%(pubhead)s      <ol class="pub-list">
%(pubs)s      </ol>
    </div>
  </section>

  <section class="section">
    <div class="wrap wrap--narrow">
%(newshead)s%(news)s    </div>
  </section>

  <section class="section section--soft">
    <div class="wrap wrap--narrow">
%(conthead)s      <p class="lede" style="margin-bottom:1.75rem">%(contactlede)s</p>
      <ul class="linklist">
%(contact)s      </ul>
    </div>
  </section>
''' % dict(
        eyebrow=e(SITE.get('eyebrow', '')),
        first=e(SITE['name'].split()[0]), last=e(' '.join(SITE['name'].split()[1:])),
        tagline=md_inline(meta.get('tagline', SITE.get('tagline', ''))),
        cv=e(SITE.get('cv', 'cv.pdf')), photo=e(SITE.get('photo', 'photo.jpg')),
        name=e(SITE['name']),
        abouthead=section_head('About'), about=md(about), positions=rows(positions),
        themehead=section_head('What I work on', '<a href="research.html">All research &rarr;</a>'),
        themes=''.join(theme_cards),
        pubhead=section_head('Selected papers', '<a href="publications.html">All publications &rarr;</a>'),
        pubs=pubs,
        newshead=section_head(meta.get('news_heading', 'Recently')), news=timeline(news),
        conthead=section_head('Get in touch'),
        contactlede=md_inline(meta.get('contact_lede', '')), contact=contact)

    return page('index.html', SITE['title'], SITE['description'], body_html,
                '<script src="assets/js/network.js" defer></script>', og_type='profile')


def build_research():
    meta, body = read('research.md')
    items = entries(body, '##')
    cards = []
    for i, t in enumerate(items):
        chips = ''.join('<li class="chip">%s</li>' % e(c) for c in split_list(t.get('chips', '')))
        papers = ''.join(
            '<li>%s</li>' % md_inline(line.lstrip('- ').strip())
            for line in t.get('papers', '').split(';') if line.strip())
        key = ('<h4 class="mini-head">Key papers</h4><ul class="mini-list">%s</ul>' % papers) if papers else ''
        cards.append(
            '      <article class="card card--theme t%d reveal" id="%s" style="scroll-margin-top:6rem">\n'
            '        <span class="num">%02d</span>\n        <h3>%s</h3>\n%s\n'
            '        <ul class="chips" style="margin-top:1.1rem">%s</ul>\n%s\n      </article>\n'
            % (i + 1, e(t.get('id', slug(t['title']))), i + 1,
               md_inline(t['title']), md(t['body']), chips, key))

    body_html = page_head(meta.get('eyebrow', 'What I do'), meta.get('title', 'Research'),
                          meta.get('lede', ''))
    body_html += '  <section class="section">\n    <div class="wrap">\n'
    if meta.get('callout'):
        body_html += '      <div class="callout reveal" style="margin-bottom:2.5rem">%s</div>\n' % md(meta['callout'])
    body_html += '      <div class="grid grid--2">\n' + ''.join(cards) + '      </div>\n    </div>\n  </section>\n'
    return page('research.html', meta.get('page_title', 'Research'), meta.get('description', ''), body_html)


def build_publications():
    meta, groups, tag_labels, concept_labels = load_publications()
    allpapers = [p for _, ps in groups for p in ps]

    filters = ['<button class="filter" type="button" data-filter="all" aria-pressed="true">All</button>']
    for key, label in sorted(tag_labels.items(), key=lambda kv: kv[1]):
        filters.append('<button class="filter" type="button" data-filter="%s" aria-pressed="false">%s</button>'
                       % (e(key), e(label)))

    out = page_head(meta.get('eyebrow', ''), meta.get('title', 'Publications'), meta.get('lede', ''))
    out += '  <section class="section">\n    <div class="wrap">\n'
    out += bipartite_svg(allpapers, concept_labels)
    out += ('      <div class="pub-toolbar" style="margin-top:2.5rem">\n'
            '        <span class="label">Filter</span>\n        %s\n'
            '        <span class="mono" style="margin-left:auto; color:var(--ink-2)" data-pub-count>%d papers</span>\n'
            '      </div>\n' % ('\n        '.join(filters), len(allpapers)))

    for heading, papers in groups:
        if not papers:
            continue
        by_year, order = {}, []
        for p in papers:
            y = p['year'] or '—'
            if y not in by_year:
                by_year[y] = []
                order.append(y)
            by_year[y].append(p)
        out += '      <h2 class="pub-section-head">%s</h2>\n' % e(heading or '')
        grouped = meta.get('group_by_year', True) and heading != meta.get('ungrouped')
        if grouped and len(order) > 1:
            for y in order:
                out += ('      <section class="pub-year">\n'
                        '        <h3 class="year-head"><span>%s</span></h3>\n        <ol class="pub-list">\n'
                        % e(y))
                out += ''.join(pub_item(p) for p in by_year[y])
                out += '        </ol>\n      </section>\n'
        else:
            out += '      <ol class="pub-list pub-list--flush">\n'
            out += ''.join(pub_item(p) for p in papers)
            out += '      </ol>\n'

    out += '    </div>\n  </section>\n'
    return page('publications.html', meta.get('page_title', 'Publications'),
                meta.get('description', ''), out)


def build_collaborators():
    """Derived entirely from publications.md — there is no separate list."""
    meta, groups, _, _ = load_publications()
    me = SITE.get('short_name', '')
    profiles = SITE.get('profiles', {}) or {}

    by_person = {}
    for _, papers in groups:
        for p in papers:
            first = re.search(r'\|\s*([^,]+)', p['links'])
            href = first.group(1).strip() if first else None
            for a in [x.strip() for x in p['authors'].split(',')]:
                if not a or a == me:
                    continue
                by_person.setdefault(a, []).append((p['title'], href))

    people = sorted(by_person.items(), key=lambda kv: (-len(kv[1]), kv[0]))
    listed = sum(1 for _, papers in people if len(papers) >= 2)

    blocks = []
    for name, papers in people:
        url = profiles.get(name, '')
        items = ''.join(
            '\n          <li data-href="%s">%s</li>' %
            (e(h or ''), ('<a href="%s">%s</a>' % (e(h), md_inline(t))) if h else md_inline(t))
            for t, h in papers)
        # People with a single shared paper stay out of the visible "everyone,
        # in full" list (data-count="1" is hidden by CSS) but the <details>
        # block itself is still emitted, so the network graph — which reads
        # this markup directly — still has them as a full node.
        blocks.append(
            '      <details class="collab" data-person="%s" data-count="%d"%s>\n'
            '        <summary><span class="collab-name">%s</span>'
            '<span class="collab-count">%d %s</span></summary>\n'
            '        <ol class="collab-papers">%s\n        </ol>\n      </details>\n'
            % (e(name), len(papers), (' data-url="%s"' % e(url)) if url else '', e(name),
               len(papers), 'paper' if len(papers) == 1 else 'papers', items))

    out = page_head(meta.get('collab_eyebrow', 'People'), 'Collaborators',
                    SITE.get('collab_lede', ''))
    out += '''  <section class="section">
    <div class="wrap">
      <figure class="netfig" data-network="collab" data-hub-name="%s">
        <canvas role="img" aria-label="A network of co-authors. Every edge is a shared paper — hover or click an edge to see which one, or click a person to list everything you share."></canvas>
        <div class="netfig-tip" data-net-tip></div>
        <figcaption class="netfig-bar"><p class="netfig-caption" data-net-caption></p></figcaption>
      </figure>
      <div class="collab-panel" data-collab-panel hidden></div>
%s      <div class="collab-list">
%s      </div>
    </div>
  </section>
''' % (e(SITE['name']),
       section_head('Everyone, in full',
                    '<span class="mono" style="color:var(--ink-2)">%d people</span>' % listed)
       .replace('      <div', '      <div style="margin-top:3rem"', 1),
       ''.join(blocks))

    return page('collaborators.html', 'Collaborators — ' + SITE['name'],
                SITE.get('collab_description', ''), out,
                '<script src="assets/js/network.js" defer></script>')


def build_simple(name, filename):
    meta, body = read(name)
    out = page_head(meta.get('eyebrow', ''), meta.get('title', ''), meta.get('lede', ''))
    for heading, sub in sections(body):
        items = entries(sub)
        style = meta.get('style', {}).get(heading, meta.get('default_style', 'timeline'))
        soft = ' section--soft' if len(out.split('class="section')) % 2 == 0 else ''
        out += '  <section class="section%s">\n    <div class="wrap wrap--narrow">\n' % soft
        out += section_head(heading) if heading else ''
        if style == 'rows':
            out += rows(items)
        elif style == 'cards':
            out += '      <div class="grid grid--2">\n'
            out += ''.join('        <article class="card reveal"><h3>%s</h3>%s%s</article>\n'
                           % (md_inline(i['title']), md(i['body']),
                              ('<ul class="chips" style="margin-top:1rem">%s</ul>'
                               % ''.join('<li class="chip">%s</li>' % e(c)
                                         for c in split_list(i.get('chips', ''))))
                              if i.get('chips') else '')
                           for i in items)
            out += '      </div>\n'
        elif style == 'prose':
            out += md(sub)
        else:
            out += timeline(items)
        out += '    </div>\n  </section>\n'
    return page(filename, meta.get('page_title', meta.get('title', '')),
                meta.get('description', ''), out)


def build_code():
    meta, body = read('code.md')
    items = entries(body)
    cards = ''.join(
        '        <article class="card card--link reveal">\n'
        '          <span class="mono" style="color:var(--a%d)">%s</span>\n'
        '          <h3><a href="%s">%s</a></h3>\n%s\n'
        '          <ul class="chips">%s</ul>\n        </article>\n'
        % (i % 3 + 1, e(it.get('lang', '')), e(it.get('url', '#')), md_inline(it['title']),
           md(it['body']),
           ''.join('<li class="chip">%s</li>' % e(c) for c in split_list(it.get('chips', ''))))
        for i, it in enumerate(items))
    out = page_head(meta.get('eyebrow', ''), meta.get('title', 'Code'), meta.get('lede', ''))
    out += '  <section class="section">\n    <div class="wrap">\n      <div class="grid grid--2">\n'
    out += cards + '      </div>\n'
    if meta.get('footnote'):
        out += '      <div class="callout reveal" style="margin-top:2.5rem">%s</div>\n' % md(meta['footnote'])
    out += '    </div>\n  </section>\n'
    return page('code.html', meta.get('page_title', 'Code'), meta.get('description', ''), out)


def build_cv():
    meta, body = read('cv.md')
    out = page_head(meta.get('eyebrow', 'CV'), meta.get('title', 'Curriculum vitae'), meta.get('lede', ''))
    out += '  <section class="section">\n    <div class="wrap wrap--narrow">\n'
    out += ('      <p style="margin-bottom:2.5rem"><a class="btn btn--primary" href="assets/pdf/%s">'
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 11l5 5 5-5M4 20h16"/></svg>'
            ' Download CV (PDF)</a></p>\n' % e(SITE.get('cv', 'cv.pdf')))
    for heading, sub in sections(body):
        out += section_head(heading)
        items = entries(sub)
        if items:
            out += rows(items).replace('<div class="rows">', '<div class="rows" style="margin-bottom:3rem">')
        else:
            out += md(sub)
    out += '    </div>\n  </section>\n'
    return page('cv.html', meta.get('page_title', 'CV'), meta.get('description', ''), out)


def build_404():
    meta, body = read('404.md')
    out = ('  <section class="section" style="text-align:center; padding-top:6rem">\n'
           '    <div class="wrap wrap--narrow">\n      <p class="eyebrow">Error 404</p>\n'
           '      <h1>%s</h1>\n      <p class="lede" style="color:var(--ink-2)">%s</p>\n'
           '      <p style="margin-top:2rem"><a class="btn btn--primary" href="index.html">Back to the homepage</a>'
           ' <a class="btn" href="publications.html">Publications</a></p>\n'
           '    </div>\n  </section>\n'
           % (e(meta.get('title', 'Page not found')), md_inline(meta.get('lede', ''))))
    return page('404.html', 'Page not found', 'That page does not exist.', out)


# ------------------------------------------------------------------ main ---

def copy_assets():
    shutil.copytree(ASSETS, os.path.join(OUT, 'assets'))
    img = os.path.join(OUT, 'assets', 'img')
    pdf = os.path.join(OUT, 'assets', 'pdf')
    os.makedirs(img, exist_ok=True)
    os.makedirs(pdf, exist_ok=True)
    for f in sorted(os.listdir(FILES)):
        src = os.path.join(FILES, f)
        if not os.path.isfile(src) or f.startswith('.'):
            continue
        dest = pdf if f.lower().endswith('.pdf') else img
        shutil.copy2(src, os.path.join(dest, f))
        print('  files/%s -> assets/%s/%s' % (f, os.path.basename(dest), f))
    for extra in ('robots.txt', '.nojekyll'):
        if os.path.exists(os.path.join(ROOT, extra)):
            shutil.copy2(os.path.join(ROOT, extra), os.path.join(OUT, extra))


def sitemap():
    today = datetime.date.today().isoformat()
    urls = ['']
    urls += [n['url'] for n in NAV if n['url'] != 'index.html']
    body = '\n'.join(
        '  <url><loc>%s/%s</loc><lastmod>%s</lastmod><priority>%s</priority></url>'
        % (SITE['base_url'], u, today, '1.0' if u == '' else '0.8') for u in urls)
    open(os.path.join(OUT, 'sitemap.xml'), 'w').write(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n%s\n</urlset>\n' % body)


def main():
    if os.path.exists(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)
    copy_assets()
    total = 0
    for label, fn in [('index.html', build_home),
                      ('research.html', build_research),
                      ('publications.html', build_publications),
                      ('collaborators.html', build_collaborators),
                      ('talks.html', lambda: build_simple('talks.md', 'talks.html')),
                      ('code.html', build_code),
                      ('cv.html', build_cv),
                      ('404.html', build_404)]:
        n = fn()
        total += n
        print('  %-22s %6d bytes' % (label, n))
    sitemap()
    print('built %d pages, %d KB of HTML -> _site/' % (8, total // 1024))


if __name__ == '__main__':
    main()
    if '--serve' in sys.argv:
        import http.server, socketserver, functools
        os.chdir(OUT)
        h = functools.partial(http.server.SimpleHTTPRequestHandler)
        print('serving _site/ on http://localhost:8000')
        socketserver.TCPServer(('', 8000), h).serve_forever()
