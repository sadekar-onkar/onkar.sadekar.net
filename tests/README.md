# tests

The workshop code is the only part of this site with maths in it, and the only
part where a silent wrong answer would look plausible. These check it.

```bash
./tests/run.sh
```

No dependencies and no runtime to install: macOS ships the JavaScriptCore shell
(`jsc`), which runs the site's plain browser scripts as-is. Nothing here is
copied into `_site/`.

**projection.test.js** checks `assets/js/projection.js`:

- a planted two-cluster dataset: the projection must recover both cliques and
  draw no edge between them.
- the privacy invariants — no node carries its category ids, no link carries
  which categories a pair shares, and people who withheld consent are
  anonymised rather than dropped (dropping them would silently change the
  network everyone else is shown).

**render.test.js** runs `network.js` headless against a fake DOM and canvas. It
cannot tell you the picture looks good, but it does prove the workshop mode
builds, re-thresholds in place, survives being revived from a hidden figure,
and paints finite, spread-out coordinates — the failure mode when a canvas is
measured at zero size is every node stacked on one point, which is invisible in
code review and obvious here.
