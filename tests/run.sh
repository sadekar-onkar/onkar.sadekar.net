#!/usr/bin/env bash
# Run the workshop test suite. No dependencies: macOS ships the JavaScriptCore
# shell, which is enough to run the site's plain browser scripts.
#
#   ./tests/run.sh
set -u
cd "$(dirname "$0")/.."

JSC=${JSC:-/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc}
if [ ! -x "$JSC" ]; then
  echo "No JavaScriptCore shell at $JSC" >&2
  echo "On Linux, set JSC to a 'node'-like runner that provides print/readFile/load," >&2
  echo "or install jsc. Skipping." >&2
  exit 127
fi

# jsc exits 0 even when a test prints FAIL, so judge by the output, not the
# status — otherwise the whole suite is green no matter what breaks.
fail=0
run() {
  echo; echo "=== $1 ==="
  out=$("$JSC" "$2" ${3:+-- $3} 2>&1); status=$?
  echo "$out"
  if [ $status -ne 0 ] || printf '%s' "$out" | grep -qE '^FAIL|FAILURE|Exception'; then
    fail=1
  fi
}

# 1. every browser script must at least parse
run "parse" tests/parse.test.js "assets/js/projection.js assets/js/network.js \
assets/js/store.js assets/js/vote.js assets/js/wsadmin.js assets/js/workshop.js \
assets/js/site.js assets/js/particles.js"

# 2. the projection maths, against exact values from Python
[ -f tests/hyper_ref.json ] || python3 tests/gen_hyper_ref.py
run "projection" tests/projection.test.js

# 3. the rendering path, headless
run "render" tests/render.test.js

echo
[ $fail -eq 0 ] && echo "ALL SUITES PASSED" || echo "SOME SUITES FAILED"
exit $fail
