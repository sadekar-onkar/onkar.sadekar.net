---
eyebrow: Workshop
title: Who should talk to whom
page_title: Workshop network
description: >-
  The interest network from a workshop: people linked when the same topics
  drew them in.
lede: >-
  Everyone in the room marked the topics that interested them as the talks went
  by. That gives a bipartite graph — people on one side, topics on the other.
  Projected onto the people, it becomes a map of who was drawn to the same
  things.
caption: >-
  Drag a node to move it. Hover a link to see how much two people share. Colours
  are communities found by label propagation on whatever network the current
  threshold produces.
categories_title: What the room was interested in
---

## Reading this honestly

A one-mode projection is not a measurement, it is a choice. Two people who both
ticked a popular topic have told you almost nothing; two who both ticked a rare
one have told you a great deal. The three settings above differ in how seriously
they take that difference.

**Shared count** is raw co-occurrence, and it flatters whoever ticked the most
boxes — an enthusiastic voter ends up looking like the centre of the room.
**Jaccard** divides the overlap by the union, so enthusiasm cancels out.
**Validated** tests every pair against the null model that the two chose
independently, and keeps only the pairs that beat it after correcting for the
number of pairs tested.

Push the last one and most links usually disappear. That is the honest answer
for a room of a few dozen people: the eye finds structure in a projection long
before the evidence supports it. The dense picture is not more true than the
sparse one, and being able to move between them is the point.

## What is not here

Individual ballots are not published, and neither is which topics any pair has
in common — a link carries only a count. People who did not consent to be named
keep their place in the network under a label instead of a name, and their name
is not in this page's source either. The topic list below is a total over
everyone.
