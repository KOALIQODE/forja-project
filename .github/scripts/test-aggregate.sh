#!/usr/bin/env bash
set -euo pipefail
DIR=$(mktemp -d)
cat > "$DIR/summary-node.json" <<'JSON'
{"ecosystem":"node","counts":{"critical":1,"high":0,"total":1}}
JSON
node .github/scripts/aggregate-security.js "$DIR" && { echo "Expected failure but got success"; exit 2; } || echo "Aggregator correctly failed on critical=1"
cat > "$DIR/summary-node.json" <<'JSON'
{"ecosystem":"node","counts":{"critical":0,"high":0,"total":0}}
JSON
node .github/scripts/aggregate-security.js "$DIR" && echo "Aggregator passed as expected" || { echo "Aggregator unexpectedly failed"; exit 3; }
rm -rf "$DIR"
