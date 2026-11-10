---
eyebrow: Workshop
title: Who works on what
page_title: Workshop groups
description: >-
  The discussion groups from a workshop: everyone ranked the projects they
  wanted to work on, and the room was split into groups to match.
lede: >-
  Everyone ranked up to four of the workshop's projects. Pick how many groups
  to run and the room is split into that many — one project each, sizes kept
  close to even — so that as many people as possible get what they asked for.
  The four solutions aim for everyone's 1st, 2nd, 3rd and 4th choice in turn.
caption: >-
  Each star is a group: the project in the middle, its people around it,
  coloured to match the cards below. Thick links are first choices, faint ones
  are projects someone did not rank. Drag a node to move it; hover for details.
groups_title: Who goes where
categories_title: How the projects were ranked
---

## How the groups are found

Each solution is exact, not a heuristic. For every possible set of projects
to run, the people are assigned to them by solving an assignment problem (the
Hungarian algorithm), with every group held between the minimum and maximum
size shown above. The set with the best total wins.

A person placed in the project they were aiming for costs nothing; one step
away on their ballot costs 1, two steps 3, three steps 6, and a project they
did not rank at all costs 50. The steps grow, so the solver prefers to move
two people one step each over one person three steps. In solution 2, 3 or 4
the aim is that person's 2nd, 3rd or 4th choice — or their last, if they
ranked fewer — so someone who ranked a single project aims for it every time.

In the bars above, the solid part is how many people ranked a project first;
the pale part, how many ranked it at all.
