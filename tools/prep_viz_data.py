#!/usr/bin/env python3
"""Build the small JSON files behind the data-driven paper visualisations.

    python3 tools/prep_viz_data.py [/path/to/onkar_main]

This is NOT part of the site build. build.py never runs it and GitHub Actions
never sees it: the research data lives outside this repository. It is kept here
so that every number in assets/data/viz/*.json can be traced to the file and
the rule that produced it. Run it by hand when a dataset changes, then commit
the JSON it writes.

Needs numpy, pandas, scipy (analysis-side only; nothing here reaches a browser).

    hazard.json   India mobility network  -> effective-distance backbone
    cricket.json  ODI batting careers     -> where the best innings falls
    nba.json      NBA play-by-play        -> is the lead safe?
    chimps.json   chimpanzee sites        -> shared behaviours vs genetic links
    overlap.json  the JRSI paper's runs   -> cooperation over (overlap, p_switch, alpha)
"""

import io, json, os, sys, zipfile, pickle, itertools

import numpy as np
import pandas as pd
from scipy.sparse.csgraph import dijkstra

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'assets', 'data', 'viz')
ROOT = sys.argv[1] if len(sys.argv) > 1 else '/Users/om/onkar_main'

HAZARD_ZIP = os.path.join(ROOT, '08_Helping_Others/Masters_Thesis/hazardmap.zip')
CRICKET = os.path.join(ROOT, '01_Projects/0_done/Cricket_Record_Stat/Data/'
                       'ODI_data_cleaned_merged_renorm_Runs_with_team_match_num_with_player_designation.csv')
NBA = os.path.join(ROOT, '01_Projects/Sports/C72h_NBA/scripts')
CHIMPS = os.path.join(ROOT, '01_Projects/0_done/chimps_cumulative_culture/data')
OVERLAP = os.path.join(ROOT, '01_Projects/0_done/Overlap/ho_game_overlap_git/'
                       'data/final_data_overlap_VSC5/data/final_data_v2')


def write(name, obj):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, separators=(',', ':'), ensure_ascii=False)
    print('  %-14s %6.1f KB' % (name, os.path.getsize(path) / 1024))


# ------------------------------------------------------------------ hazard ---

def _dp(points, tol):
    """Douglas-Peucker on an open line of [lon, lat]."""
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = points[a]; bx, by = points[b]
        dx, dy = bx - ax, by - ay
        norm = (dx * dx + dy * dy) ** 0.5
        worst, idx = 0.0, None
        for i in range(a + 1, b):
            px, py = points[i]
            d = (abs(dy * (px - ax) - dx * (py - ay)) / norm) if norm else ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
            if d > worst:
                worst, idx = d, i
        if idx is not None and worst > tol:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(points, keep) if k]


def simplify(ring, tol):
    """Simplify a closed ring. Its first and last points coincide, which gives
    Douglas-Peucker no chord to measure from, so cut it at the point farthest
    from the start and simplify the two halves."""
    if len(ring) < 8:
        return ring
    x0, y0 = ring[0]
    far = max(range(len(ring)), key=lambda i: (ring[i][0] - x0) ** 2 + (ring[i][1] - y0) ** 2)
    return _dp(ring[:far + 1], tol)[:-1] + _dp(ring[far:], tol)


def hazard():
    z = zipfile.ZipFile(HAZARD_ZIP)
    rd = lambda n: io.BytesIO(z.read('hazardmap/' + n))
    geo = pd.read_csv(rd('Website/html_page_gen/lat_long_pop_446_cities.csv'), index_col=0)
    F = np.nan_to_num(np.genfromtxt(rd('Codes/F_matrix_combined_final.csv'), delimiter=','))
    n = len(geo)
    assert F.shape == (n, n)

    # Exactly the paper's definition (Codes/Code_Network_Properties/Code_Deff.py):
    #   P_nm = F_nm / F_n,  d_nm = 1 - ln P_nm,  D_eff = shortest path over d.
    with np.errstate(divide='ignore', invalid='ignore'):
        P = np.nan_to_num(F / F.sum(axis=1, keepdims=True))
        d = np.where(P > 0, 1 - np.log(P), 0.0)       # 0 = "no edge" for csgraph
    np.fill_diagonal(d, 0)
    deff = dijkstra(d, directed=True)

    # An edge can only ever lie on a shortest path if it IS the shortest path
    # between its own endpoints. Everything else is dead weight for Dijkstra,
    # so ship only that backbone and let the browser recompute any origin.
    # Stored as a compressed adjacency list: city i's edges are
    # to[start[i]:start[i+1]] with lengths d100[...] / 100.
    start, to, d100 = [0], [], []
    for i in range(n):
        for j in np.nonzero(d[i])[0]:
            if d[i, j] <= deff[i, j] + 1e-9:
                to.append(int(j)); d100.append(int(round(float(d[i, j]) * 100)))
        start.append(len(to))

    # sanity: the paper's Table 2 says Mumbai -> Thane 2.89, Pune 3.17, Delhi 3.7
    idx = {c: i for i, c in enumerate(geo.city)}
    chk = [round(float(deff[idx['Mumbai'], idx[c]]), 2) for c in ('Thane', 'Pune', 'Delhi')]
    assert chk == [2.89, 3.17, 3.7], chk

    g = json.load(rd('Website/html_page_gen/india_states_modified1.geojson'))
    rings = []
    for feat in g['features']:
        geom = feat['geometry']
        if not geom:
            continue
        polys = [geom['coordinates']] if geom['type'] == 'Polygon' else geom['coordinates']
        for poly in polys:
            ring = simplify([[p[0], p[1]] for p in poly[0]], 0.1)
            if len(ring) >= 5:
                rings.append([[round(x, 2), round(y, 2)] for x, y in ring])

    write('hazard.json', {
        'source': 'Sadekar et al., Current Science 121, 1208 (2021): combined air + rail + road flux matrix, 446 cities',
        'cities': [[c, round(float(la), 3), round(float(lo), 3), int(p)]
                   for c, p, la, lo in zip(geo.city, geo.population, geo.latitude, geo.longitude)],
        'start': start, 'to': to, 'd100': d100,
        'outline': rings,
    })
    print('     %d cities, %d of %d edges kept, outline %d rings / %d points'
          % (n, len(to), int((d > 0).sum()), len(rings), sum(len(r) for r in rings)))


# ----------------------------------------------------------------- cricket ---

FEATURED = ['Sachin Tendulkar', 'Virat Kohli', 'Rohit Sharma', 'Ricky Ponting',
            'Kumar Sangakkara', 'Sanath Jayasuriya', 'Brian Lara', 'Jacques Kallis',
            'M S Dhoni', 'Chris Gayle', 'AB de Villiers', 'Sourav Ganguly',
            'Inzamam-ul-Haq', 'Adam Gilchrist', 'Saeed Anwar', 'Viv Richards']
MIN_INNINGS = 30


def top3(runs, balls):
    """Indices of the best, second and third innings: most runs, ties broken
    by fewer balls faced (the paper's rule)."""
    order = sorted(range(len(runs)), key=lambda i: (-runs[i], balls[i]))
    return order[:3]


def cricket():
    d = pd.read_csv(CRICKET, low_memory=False)
    b = d[d.bat_run.notna()].copy()
    b['bat_balls'] = b.bat_balls.fillna(1e9)
    b = b.sort_values(['Match_Date', 'Match_ID'])
    careers = {name: (g.bat_run.astype(int).tolist(), g.bat_balls.tolist(),
                      g.Match_Date.str[:4].astype(int).tolist(),
                      (g.bat_wicket == 'notout').tolist())
               for name, g in b.groupby('player_name', sort=False)}

    rng = np.random.default_rng(7)
    pos, gap2, gap3, gap2s, gap3s = [], [], [], [], []
    for name, (runs, balls, _, _) in careers.items():
        n = len(runs)
        if n < MIN_INNINGS:
            continue
        t = top3(runs, balls)
        pos.append((t[0] + 1) / n)
        gap2.append(abs(t[0] - t[1]) / n); gap3.append(abs(t[0] - t[2]) / n)
        for _ in range(40):                      # null: shuffle the order
            perm = rng.permutation(n)
            ts = top3([runs[k] for k in perm], [balls[k] for k in perm])
            gap2s.append(abs(ts[0] - ts[1]) / n); gap3s.append(abs(ts[0] - ts[2]) / n)

    edges10 = np.linspace(0, 1, 11)
    hist = lambda v, e: (np.histogram(v, bins=e)[0] / len(v)).round(4).tolist()

    feats = []
    for name in FEATURED:
        if name not in careers:
            print('     missing', name); continue
        runs, balls, years, notout = careers[name]
        feats.append({'name': name, 'runs': runs, 'top': top3(runs, balls),
                      'years': [years[0], years[-1]],
                      'notout': [i for i, x in enumerate(notout) if x]})
    write('cricket.json', {
        'source': 'Sadekar et al., R. Soc. Open Sci. 11, 240809 (2024): howstat.com ODI scorecards, 1971 to Oct 2023',
        'min_innings': MIN_INNINGS, 'n_players': len(pos),
        'best_pos': hist(pos, edges10),
        'gap_edges': edges10.round(2).tolist(),
        'gap2': hist(gap2, edges10), 'gap2_null': hist(gap2s, edges10),
        'gap3': hist(gap3, edges10), 'gap3_null': hist(gap3s, edges10),
        'players': feats,
    })
    print('     %d batters with >= %d innings; best-vs-2nd within 10%% of career: %.3f real, %.3f shuffled'
          % (len(pos), MIN_INNINGS, np.mean(np.array(gap2) < .1), np.mean(np.array(gap2s) < .1)))
    for f in feats[:3]:
        print('     %s  N*/N = %.2f' % (f['name'], (f['top'][0] + 1) / len(f['runs'])))


# --------------------------------------------------------------------- nba ---

MAXLEAD = 20      # leads of 20 or more share the last row


def nba():
    seqs = pickle.load(open(os.path.join(NBA, 'nba_score_tuples_time.pkl'), 'rb'))
    tab = pd.read_csv(os.path.join(NBA, 'last_lead_change_team_game.csv')).drop_duplicates('GAME_ID')
    tab = tab.set_index('GAME_ID')

    wins = np.zeros((MAXLEAD, 47)); tot = np.zeros((MAXLEAD, 47))
    games, kept = {}, 0
    for year, season in seqs.items():
        for gid, g in season.items():
            if gid not in tab.index or tab.loc[gid, 'game_duration_seconds'] != 2880:
                continue                      # regulation games only
            h = a = 0; t_arr = []; m_arr = []
            for pts, team, t in g['score_tuples']:
                if team == g['home_team']: h += pts
                else: a += pts
                if t_arr and t_arr[-1] == t: m_arr[-1] = h - a
                else: t_arr.append(t); m_arr.append(h - a)
            if (h, a) != (g['home_score'], g['away_score']) or h == a:
                continue                      # sequence does not reproduce the final score
            kept += 1
            t_np, m_np = np.array(t_arr), np.array(m_arr)
            home_won = h > a
            for minute in range(1, 48):
                k = np.searchsorted(t_np, minute * 60, side='right') - 1
                m = m_np[k] if k >= 0 else 0
                if m == 0:
                    continue
                row = min(abs(m), MAXLEAD) - 1
                tot[row, minute - 1] += 1
                wins[row, minute - 1] += (m > 0) == home_won
            # lead changes: the sign of the margin flips (ties are not changes)
            sign = 0; changes = 0; worst = 0
            for m in m_arr:
                s = (m > 0) - (m < 0)
                if s and sign and s != sign: changes += 1
                if s: sign = s
                worst = min(worst, m if home_won else -m)
            games[gid] = dict(year=int(year), home=g['home_team'], away=g['away_team'],
                              hs=h, as_=a, changes=changes, deficit=-worst,
                              t=[int(x) for x in t_arr], m=[int(x) for x in m_arr])

    with np.errstate(invalid='ignore'):
        p = np.where(tot >= 15, wins / np.maximum(tot, 1), np.nan)

    reg = tab[tab.game_duration_seconds == 2880]
    llc = reg.last_lead_change_seconds.dropna()
    hist = np.histogram(llc, bins=np.arange(0, 2881, 60))[0]

    def pick(gid, why):
        g = games[gid]
        return {'id': int(gid), 'label': '%s %d, %s %d' % (g['away'], g['as_'], g['home'], g['hs']),
                'season': '%d-%02d' % (g['year'], (g['year'] + 1) % 100), 'why': why,
                'home': g['home'], 'away': g['away'], 'changes': g['changes'],
                't': g['t'], 'm': g['m']}

    chosen = []
    for gid, why in ((22400509, 'A see-saw'), (22400041, 'A quiet one')):
        if gid in games:
            chosen.append(pick(gid, why))
    by = lambda key: max(games, key=lambda k: games[k][key])
    chosen.append(pick(by('changes'), 'Most lead changes in the sample'))
    chosen.append(pick(by('deficit'), 'Biggest deficit overcome'))
    late = reg.last_lead_change_seconds.idxmax()
    if late in games:
        chosen.append(pick(late, 'Decided latest'))

    write('nba.json', {
        'source': 'Bozhidarova et al., arXiv:2606.27957: NBA play-by-play, 2019-20 to 2024-25, regulation-time games',
        'n_games': kept, 'maxlead': MAXLEAD,
        'p': [[None if np.isnan(x) else round(float(x), 3) for x in row] for row in p],
        'n': tot.astype(int).tolist(),
        'llc': hist.astype(int).tolist(), 'llc_n': int(len(llc)),
        'llc_none': int((~reg.has_lead_change).sum()), 'llc_games': int(len(reg)),
        'games': chosen,
    })
    print('     %d games; P(win | +10 at half) = %.3f; +10 with 6 min left = %.3f'
          % (kept, p[9, 23], p[9, 41]))
    for c in chosen:
        print('     %-34s %s (%d changes)' % (c['why'], c['label'], c['changes']))


# ------------------------------------------------------------------ chimps ---

# Approximate field-site positions (lat, lon). The paper's data files carry the
# site names and regions but not coordinates; these were entered by hand from
# the published locations of the sites and are good to roughly a degree, which
# is all a continental map needs. Do not use them for anything quantitative.
SITES = {
    'Bafing': (12.6, -10.4), 'Bakoun-Sobory': (11.6, -12.4), 'Bateke': (-2.1, 14.0),
    'Bili-Uele': (4.1, 24.6), 'Boe': (11.8, -14.2), 'Budongo': (1.7, 31.5),
    'Bwindi': (-1.05, 29.7), 'Comoe': (8.8, -3.8), 'Conkouati': (-3.9, 11.4),
    'Dindefelo': (12.4, -12.3), 'Djouroutou': (5.4, -7.3), 'East Nimba': (7.5, -8.5),
    'Gashaka': (7.3, 11.6), 'Gishwati': (-1.8, 29.4), 'Goualougo': (2.2, 16.5),
    'Grebo': (5.4, -7.7), 'Issa-Ugalla': (-5.5, 30.6), 'Kabogo': (-5.5, 29.4),
    'Kayan': (12.9, -12.6), 'Korup': (5.1, 8.9), 'La Belgique': (3.1, 13.2),
    'Loango': (-2.1, 9.6), 'Lope': (-0.2, 11.6), 'Mbe': (6.2, 9.1),
    'Mt. Cameroon': (4.2, 9.2), 'Mt. Cristal': (0.6, 10.4), 'Mt. Sangbe': (7.9, -7.3),
    'Ngogo': (0.5, 30.4), 'Nyungwe': (-2.5, 29.2), 'Outamba-Kilimi': (9.7, -12.1),
    'Rubi-Tele': (2.3, 25.0), 'Sangaredi': (11.1, -13.8), 'Sapo': (5.4, -8.5),
    'Sobeya': (12.0, -12.2), 'Tai': (5.9, -7.3),
}
NEPRA_STRONG = 0.0006      # the paper's threshold for a "strong" rare-allele link


def chimps():
    rd = lambda n, **k: pd.read_csv(os.path.join(CHIMPS, n), sep=';', **k)
    reg = rd('regions.csv').set_index('site').region
    sites = list(reg.index)
    assert set(sites) == set(SITES), set(sites) ^ set(SITES)
    ix = {s: i for i, s in enumerate(sites)}
    pair = lambda a, b: tuple(sorted((ix[a], ix[b])))

    ibd = sorted({pair(a, b) for a, b in rd('IBD_edgelist.csv').values.tolist()})
    ne = rd('NePRA_edgelist.csv')
    nepra = sorted({pair(a, b) for a, b, s in ne.values.tolist() if s >= NEPRA_STRONG})

    classes = {}
    for key, label in (('nontool', 'No tools'), ('simple', 'Simple tools'), ('complex', 'Complex toolsets')):
        a = rd(key + '_aff.csv', index_col=0)
        a.columns = [c.strip() for c in a.columns]
        behaviours = [{'name': c, 'sites': [ix[s] for s in a.index[a[c] == 1]]} for c in a.columns]
        links = {}
        for bi, beh in enumerate(behaviours):
            for i, j in itertools.combinations(sorted(beh['sites']), 2):
                links.setdefault((i, j), []).append(bi)
        classes[key] = {'label': label, 'behaviours': behaviours,
                        'links': [[i, j, bs] for (i, j), bs in sorted(links.items())]}
        L = set(links); I = set(ibd); N = set(nepra)
        print('     %-8s %3d sharing pairs: %2d IBD (%.0f%%), %3d strong NePRA (%.0f%%)'
              % (key, len(L), len(L & I), 100 * len(L & I) / len(L),
                 len(L & N), 100 * len(L & N) / len(L)))

    npairs = len(sites) * (len(sites) - 1) // 2
    print('     baseline over %d pairs: IBD %.0f%%, strong NePRA %.0f%%'
          % (npairs, 100 * len(ibd) / npairs, 100 * len(nepra) / npairs))
    write('chimps.json', {
        'source': 'Gunasekaram et al., Science 386, 920 (2024)',
        'sites': [[s, reg[s], SITES[s][0], SITES[s][1]] for s in sites],
        'ibd': ibd, 'nepra': nepra, 'classes': classes,
    })


# ----------------------------------------------------------------- overlap ---

def overlap():
    """The averaged runs behind figures 2-4 of the paper (N = 1500, k/ = 4,
    k_delta = 2, quasi-stationary method), read exactly as the paper's own
    plotting notebook reads them: row 0 is the number of pairwise cooperators
    in each run, row 1 the number of higher-order cooperators."""
    N = 1500
    overlaps = [round(0.1 * i, 1) for i in range(11)]
    pswitch = [round(0.1 * i, 1) for i in range(11)]
    Gh = [round(0.4 + 0.1 * i, 1) for i in range(18)]
    Wh = 0.7
    order = sorted(range(len(Gh)), key=lambda g: Wh - Gh[g])       # alpha ascending
    pairs, groups, runs = [], [], set()
    for g in order:
        pa, gr = [], []
        for o in overlaps:
            rp, rg = [], []
            for ps in pswitch:
                d = np.load(os.path.join(OVERLAP,
                    'RR-averaged_coop_N_1500_kp_4_kh_2_overlap_%s_Rp_1.0_Sp_-0.1_Tp_1.1_Pp_0.0_'
                    'Gh_%s_Wh_0.7_wf_0.167_rho_pi_0.5_rho_hi_0.5_p_error_%s.npy' % (o, Gh[g], ps)))
                runs.add(d.shape[1])
                rp.append(round(float(d[0].mean()) / N, 3)); rg.append(round(float(d[1].mean()) / N, 3))
            pa.append(rp); gr.append(rg)
        pairs.append(pa); groups.append(gr)
    write('overlap.json', {
        'source': 'Sadekar et al., J. R. Soc. Interface 22, 20250134 (2025): the simulations behind figures 2-4',
        'alpha': [round(Wh - Gh[g], 2) for g in order], 'omega': overlaps, 'pswitch': pswitch,
        'pairs': pairs, 'groups': groups,        # [alpha][omega][pswitch]
    })
    a = np.array(pairs) + np.array(groups)
    ai = [round(Wh - Gh[g], 2) for g in order].index(-0.5)
    print('     runs per point: %s; alpha=-0.5: rho(omega=1, p=0.9) = %.2f, rho(omega=0, p=0.9) = %.2f, rho(omega=1, p=0) = %.2f'
          % (sorted(runs), a[ai][10][9] / 2, a[ai][0][9] / 2, a[ai][10][0] / 2))


if __name__ == '__main__':
    todo = sys.argv[2:] or ['hazard', 'cricket', 'nba', 'chimps', 'overlap']
    for name in todo:
        print(name)
        globals()[name]()
