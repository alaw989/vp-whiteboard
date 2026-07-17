#!/bin/bash
set -e

# Tool Quality Loop — drives opencode through the specs/tools/ backlog.
# Usage:
#   ./scripts/tool-loop.sh          # Default cap: 25 iterations
#   ./scripts/tool-loop.sh 10       # Override cap
#   ./scripts/tool-loop.sh --dry-run  # Print info and exit

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ITER=0
MAX=${1:-25}

cd "$PROJECT_DIR"

# Dry run
if [ "$1" = "--dry-run" ]; then
  echo "Tool Quality Loop — dry run"
  echo "Project: $PROJECT_DIR"
  echo "Specs:"
  for f in specs/tools/*.md; do
    name=$(basename "$f" .md)
    status=$(grep "^## Status:" "$f" | head -1 | sed 's/## Status: //')
    echo "  $name: $status"
  done
  incomplete=$(grep -l "Status: INCOMPLETE" specs/tools/*.md 2>/dev/null | wc -l)
  echo "Incomplete: $incomplete / $(ls specs/tools/*.md 2>/dev/null | wc -l) total"
  echo "Max iterations: $MAX"
  exit 0
fi

# Ensure opencode is available
if ! command -v opencode &>/dev/null; then
  echo "Error: opencode not found. This loop requires opencode to run."
  exit 1
fi

# Ensure we're on a non-deploy branch
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
for blocked in master develop main; do
  if [ "$BRANCH" = "$blocked" ]; then
    echo "Error: refusing to run on $BRANCH (auto-deploys). Create a feature branch."
    exit 1
  fi
done

echo "Tool Quality Loop — starting (cap: $MAX iterations, branch: $BRANCH)"
echo ""

while [ "$ITER" -lt "$MAX" ]; do
  ITER=$((ITER + 1))

  # Check remaining incomplete specs
  INCOMPLETE=$(grep -l "Status: INCOMPLETE" specs/tools/*.md 2>/dev/null | wc -l)
  echo "=== Iteration $ITER/$MAX — $INCOMPLETE specs remaining ==="

  if [ "$INCOMPLETE" -eq 0 ]; then
    echo "All specs complete!"
    break
  fi

  # Run opencode with the tool-quality-loop skill
  # The skill handles: read spec → implement → verify → update status → commit → DONE
  if ! opencode --skill tool-quality-loop; then
    echo "Warning: opencode exited with an error. Continuing to next iteration."
  fi

  echo ""
done

echo ""
echo "=== Tool Quality Loop finished ($ITER iterations) ==="
INCOMPLETE=$(grep -l "Status: INCOMPLETE" specs/tools/*.md 2>/dev/null | wc -l)
echo "Remaining incomplete: $INCOMPLETE"
