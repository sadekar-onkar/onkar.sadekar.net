# tests

The workshop code is the only part of this site with maths in it, and the only
part where a silent wrong answer would look plausible. These check it.

```bash
./tests/run.sh
```

No dependencies and no runtime to install: macOS ships the JavaScriptCore shell
(`jsc`), which runs the site's plain browser scripts as-is. Nothing here is
copied into `_site/`.

**groups.test.js** checks `assets/js/groups.js`:

- the Hungarian solver and the whole grouping against exhaustive search on
  small random instances — the answer must be the true optimum, not a good one.
- planted data: K distinct projects, everyone placed exactly once, sizes inside
  the tolerance, and solution r giving everyone their r-th choice when that is
  possible.
- people who ranked one project stay in it across all four solutions.
- robustness (no votes, K larger than the room or the project list, stale ids)
  and speed at workshop scale.

**render.test.js** runs `network.js` headless against a fake DOM and canvas. It
cannot tell you the picture looks good, but it does prove the workshop mode
builds, regroups in place, takes a live re-poll, survives being revived from a hidden figure,
and paints finite, spread-out coordinates — the failure mode when a canvas is
measured at zero size is every node stacked on one point, which is invisible in
code review and obvious here.

**ballots.test.js** drives `wsadmin.js` the way the admin does — fake DOM, fake
Store, a click on "Show the ballots" — and reads back the matrix it built: which
rank lands in which cell, a non-voter still getting a row, the column totals,
the legend, and the CSV down to the quoting of a name with a comma in it.
