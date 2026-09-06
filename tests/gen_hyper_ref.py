#!/usr/bin/env python3
"""Exact hypergeometric tail probabilities, for checking projection.js.

The JS works in log space with a float log-factorial table; this works in exact
rational arithmetic with math.comb. Agreement between two implementations that
share no code is the point — see tests/README.md.
"""
import json, os, random, sys
from math import comb
from fractions import Fraction


def survival(N, K, n, x):
    """P(X >= x) for X ~ Hypergeometric(N, K, n). Exact, then rounded to float."""
    lo, hi = max(x, 0, n - (N - K)), min(K, n)
    if lo > hi:
        return 0.0
    tot = comb(N, n)
    return float(sum(Fraction(comb(K, k) * comb(N - K, n - k), tot)
                     for k in range(lo, hi + 1)))


def main():
    random.seed(11)
    cases = []
    # systematic sweep over short ballots, the realistic regime
    for N in (5, 8, 12, 20, 30):
        for K in range(1, N + 1, max(1, N // 6)):
            for n in range(1, N + 1, max(1, N // 6)):
                for x in range(0, min(K, n) + 1):
                    cases.append(dict(N=N, K=K, n=n, x=x, p=survival(N, K, n, x)))
    # larger random ones, to stress the log-space arithmetic
    for _ in range(300):
        N = random.randint(30, 150)
        K, n = random.randint(1, N), random.randint(1, N)
        x = random.randint(0, min(K, n))
        cases.append(dict(N=N, K=K, n=n, x=x, p=survival(N, K, n, x)))

    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'hyper_ref.json')
    json.dump(cases, open(out, 'w'))
    print('wrote %d reference cases -> %s' % (len(cases), out))


if __name__ == '__main__':
    main()
