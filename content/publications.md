---
eyebrow: Peer-reviewed & preprints
title: Publications
lede: >-
  Peer-reviewed papers, preprints and work in progress, in network science,
  evolutionary game theory, anthropology and statistical physics. The same list
  is on
  [Google Scholar](https://scholar.google.com/citations?user=wRgJdSoAAAAJ).
  Each paper has an interactive figure under it: the model itself or the
  data, to play with.
ungrouped: Preprints & in preparation   # don't split this section by year
page_title: Publications — Onkar Sadekar
description: >-
  Peer-reviewed papers and preprints by Onkar Sadekar on higher-order networks,
  cooperation, cultural evolution and statistical physics.
---

<!--
  ONE BLOCK PER PAPER. To remove a paper, delete its block. To add one, copy a
  block and edit it. Nothing else needs changing anywhere.

    ### Title of the paper
    authors:  comma-separated; your own name is bolded automatically
    venue:    *Journal* volume, pages   (markdown allowed)
    year:     used for the year headings
    badge:    optional — preprint / in prep / chapter
    tags:     filter buttons; keys from `tags:` in site.md
    concepts: bipartite diagram; keys from `concepts:` in site.md
    links:    Label | url, Label | url    (the first one becomes the title link)
    viz:      optional — the interactive figure; names a file in assets/js/viz/
    viz_title: its heading

  Anything you write under the key lines is the note printed below the
  interactive figure. Delete the two viz lines and the figure is gone.

  The collaborators page is generated from the `authors:` lines below, so you
  never edit it directly.
-->

## Preprints & in preparation

### From streaks to synergies: a multi-scale analysis of performance and scoring in the NBA
authors: M. Bozhidarova, Y. Cai, R. M. S. Carvalho, D. Cirulli, Q. Dehaene, M. Diaz, A. Krasnokutskaya, B. Pereira, O. Sadekar, F. Battiston
venue: arXiv:2606.27957
year: 2026
badge: preprint
tags: sports
concepts: empirical-data, sport-analytics
links: arXiv | https://arxiv.org/abs/2606.27957
viz: nba
viz_title: Is a ten-point lead safe?

Counted from the play-by-play behind the paper: 6,460 regulation-time games, 2019–20 to 2024–25. Each cell is the share of games won by the team that led by that much at that minute. A ten-point lead at half-time was converted 78% of the time; the same lead with six minutes left, 94%. The strip underneath is the last lead change of every game, which tends to come either in the opening minutes or right at the end.

### Emergence of cooperation in nonlinear higher-order public goods games
authors: J. Llabrés, O. Sadekar, F. Malizia, F. Battiston
venue: arXiv:2604.07228
year: 2026
badge: preprint
tags: cooperation
concepts: group-interactions, evolutionary-games, cooperation
links: arXiv | https://arxiv.org/abs/2604.07228
viz: pgg
viz_title: Two kinds of return, two possible fates

The paper's mean-field equation, solved exactly as you move the sliders. With diminishing returns cooperation rises smoothly; with synergy it switches on abruptly and stays on. Mix a discounting two-player game with a synergistic three-player one and a third regime appears, in which a partly cooperative population and a fully cooperative one are both stable.


## Peer-reviewed

### Higher-order interactions shape collective human behaviour
authors: F. Battiston, V. Capraro, F. Karimi, S. Lehmann, A. B. Migliano, O. Sadekar, A. Sánchez, M. Perc
venue: *Nature Human Behaviour* 9, 2441–2457
year: 2025
tags: human behaviour
concepts: group-interactions, evolutionary-games
links: DOI | https://doi.org/10.1038/s41562-025-02373-5
viz: hoi
viz_title: When two friends agree, the third follows

A review has no single result to replay, so this is one of the models it discusses, on a small made-up network: social contagion in which a group of three adds pressure once two of its members have adopted ([Iacopini et al. 2019](https://doi.org/10.1038/s41467-019-10431-6)). With links alone the behaviour dies out at these settings. The same links plus group pressure keep it alive.

### Drivers of cooperation in social dilemmas on higher-order networks
authors: O. Sadekar, A. Civilini, V. Latora, F. Battiston
venue: *Journal of the Royal Society Interface* 22, 20250134
year: 2025
tags: cooperation
concepts: group-interactions, evolutionary-games, cooperation
links: DOI | https://doi.org/10.1098/rsif.2025.0134, arXiv | https://arxiv.org/abs/2502.09446, code | https://github.com/sadekar-onkar/overlap-ho-game
viz: overlap
viz_title: Cooperation needs pairs and groups to overlap

These are the simulations from the paper, not a re-run: the mean stationary cooperation of 1,500 players over 400 runs, for every combination of the three parameters. Cooperation is high only in the corner where players copy strategies across group sizes *and* their pairwise ties lie inside their groups. Drag the dilemma strength to watch that corner shrink.

### Population connectivity shapes the distribution and complexity of chimpanzee cumulative culture
authors: C. Gunasekaram, F. Battiston, O. Sadekar, C. Padilla-Iglesias, MA. van Noordwijk, R. Furrer, A. Manica, J. Bertranpetit, A. Whiten, CP. van Schaik, L. Vinicius, A. B. Migliano
venue: *Science* 386, 920–925
year: 2024
tags: culture
concepts: empirical-data, anthropology
links: DOI | https://doi.org/10.1126/science.adk3381
viz: chimps
viz_title: Complex tools travel along genetic links

The paper's data: 35 chimpanzee populations, the foraging behaviours recorded at each, and which pairs share genetic markers of past migration. Pairs that share a complex toolset are linked genetically about twice as often as any two populations are, and pairs that share only a simple tool or a tool-free habit are not. That is what you expect if complex culture spreads by migration instead of being reinvented. Site positions on the map are approximate.

### Evolutionary game selection creates cooperative environments
authors: O. Sadekar, A. Civilini, J. Gómez-Gardeñes, V. Latora, F. Battiston
venue: *Physical Review E* 110, 014306
year: 2024
tags: cooperation
concepts: evolutionary-games, cooperation
links: DOI | https://doi.org/10.1103/PhysRevE.110.014306, arXiv | https://arxiv.org/abs/2311.11128
viz: gamesel
viz_title: Let players pick the game and they sort themselves

The well-mixed model from the paper, with 1,000 players. Every dot is one player's own game. When games can be copied along with strategies, the population collapses onto a handful of games: cooperative ones if cooperators start in the majority, defecting ones if they do not. Try 40% and then 60%.

### Individual and team performance in cricket
authors: O. Sadekar, S. Chowdhary, M. S. Santhanam, F. Battiston
venue: *Royal Society Open Science* 11, 240809
year: 2024
tags: sports
concepts: empirical-data, sport-analytics
links: DOI | https://doi.org/10.1098/rsos.240809, arXiv | https://arxiv.org/abs/2401.15161, code | https://github.com/sadekar-onkar/cricket_public
viz: cricket
viz_title: A batter's best innings can come at any time

Real one-day careers from the paper's data. Across 743 batters with at least 30 innings, the best score falls almost anywhere in a career. The best and the second best, though, sit closer together than they do when the same careers are shuffled: top performances come in bursts.

### Explosive cooperation in social dilemmas on higher-order networks
authors: A. Civilini, O. Sadekar, F. Battiston, J. Gómez-Gardeñes, V. Latora
venue: *Physical Review Letters* 132, 167401
year: 2024
tags: cooperation
concepts: group-interactions, evolutionary-games, cooperation
links: DOI | https://doi.org/10.1103/PhysRevLett.132.167401, arXiv | https://arxiv.org/abs/2303.11475
viz: explosive
viz_title: Add group games and cooperation switches on all at once

Left, the paper's mean-field solution. Right, 900 simulated players. Below a critical share of three-player games everyone ends up defecting, as in the ordinary prisoner's dilemma. Past it a cooperative state appears abruptly, but only for a population that starts above the dashed critical mass. Click in the diagram to drop the population anywhere.

### An infectious diseases hazard map for India based on mobility and transportation networks
authors: O. Sadekar, M. Budamagunta, G. J. Sreejith, S. Jain, M. S. Santhanam
venue: *Current Science* 121, 1208–1215
year: 2021
tags: epidemics
concepts: empirical-data, epidemics
links: DOI | https://doi.org/10.18520/cs/v121/i9/1208-1215, arXiv | https://arxiv.org/abs/2105.15123
viz: hazard
viz_title: An outbreak follows the timetable, not the map

The 446-city network from the paper, built from air, rail and road traffic. On the map the infection jumps between distant hubs. Arrange the same cities by effective distance, the shortest path through the traffic network, and it spreads as a clean ring. The distances are computed in your browser the way the paper defines them.

### Thermodynamic uncertainty relation for energy transport in a transient regime: a model study
authors: S. Saryal, O. Sadekar, B. K. Agarwalla
venue: *Physical Review E* 103, 022141
year: 2021
tags: statphys
concepts: statistical-physics
links: DOI | https://doi.org/10.1103/PhysRevE.103.022141, arXiv | https://arxiv.org/abs/2008.08521
viz: tur
viz_title: Two qubits can slip under the precision bound

The uncertainty relation says a current cannot be both precise and thermodynamically cheap: the product plotted here should stay above 2. For two oscillators exchanging heat it always does. For two qubits it dips below when the hot side is hot enough, while the looser bound that follows from the fluctuation theorem still holds. The curves are for resonant exchange coupling; the paper's third, hybrid model is not drawn.

### Active Brownian motion in two dimensions under stochastic resetting
authors: V. Kumar, O. Sadekar, U. Basu
venue: *Physical Review E* 102, 052129
year: 2020
tags: statphys
concepts: stochastic-resetting, statistical-physics
links: DOI | https://doi.org/10.1103/PhysRevE.102.052129, arXiv | https://arxiv.org/abs/2008.03294
viz: abp
viz_title: Reset a swimmer, and what you reset decides the shape

A simulation of the paper's model: 1,500 self-propelled particles under its three resetting protocols. Reset position and direction quickly and the cloud is a jet. Reset position alone and it is a round, sharply peaked blob. Reset direction alone and there is no stationary state at all.

### Zero-current nonequilibrium state in symmetric exclusion process with dichotomous stochastic resetting
authors: O. Sadekar, U. Basu
venue: *Journal of Statistical Mechanics* 073209
year: 2020
tags: statphys
concepts: stochastic-resetting, statistical-physics
links: DOI | https://doi.org/10.1088/1742-5468/ab9e5e, arXiv | https://arxiv.org/abs/2004.00951
viz: sep
viz_title: Flat on average, never at rest

A small Monte Carlo version of the model: particles hop on a ring and are repeatedly thrown back into the left half or the right half. With equal rates the long-time average looks like equilibrium, flat density and no net current, while every single snapshot is a block in the middle of melting. Make the rates unequal and a current appears.
