#!/bin/bash
set -e

# Tool Quality Loop — continuous quality scan.
# Each iteration invokes opencode with the tool-quality-scan skill,
# which scans the tool codebase, fixes the most impactful issue,
# verifies with tests, commits, and signals DONE.
#
# The loop terminates when:
#   - The skill outputs <promise>ALL_DONE</promise> (nothing left to fix)
#   - The iteration cap is reached
#
# Usage:
#   ./scripts/tool-loop.sh          # Default cap: 25 iterations
#   ./scripts/tool-loop.sh 10       # Override cap
#   ./scripts/tool-loop.sh --dry-run  # Show info and exit

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ITER=0
MAX=25

cd "$PROJECT_DIR"

# Parse args
if [ "$1" = "--dry-run" ]; then
  echo "Tool Quality Loop — dry run"
  echo "Project: $PROJECT_DIR"
  echo "Skill: .agents/skills/tool-quality-loop/SKILL.md"
  echo "Max iterations: ${2:-$MAX}"
  exit 0
fi

if [[ "$1" =~ ^[0-9]+$ ]]; then
  MAX=$1
fi

# Ensure opencode is available
if ! command -v opencode &>/dev/null; then
  echo "Error: opencode not found. This loop requires opencode."
  exit 1
fi

# Branch guard — refuse to run on deploy branches
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
for blocked in master develop main; do
  if [ "$BRANCH" = "$blocked" ]; then
    echo "Error: refusing to run on $BRANCH (auto-deploys). Create a feature branch."
    exit 1
  fi
done

echo "Tool Quality Loop — starting (max: $MAX, branch: $BRANCH)"
echo ""

while [ "$ITER" -lt "$MAX" ]; do
  ITER=$((ITER + 1))
  echo "=== Iteration $ITER/$MAX ==="

  # Run opencode with the scan skill
  OUTPUT=$(opencode --skill tool-quality-loop 2>&1) || true

  # Check termination signal
  if echo "$OUTPUT" | grep -q "ALL_DONE"; then
    echo "No fixable issues found. Loop complete."
    break
  fi

  echo ""
done

echo ""
echo "=== Tool Quality Loop finished ($ITER iterations) ==="
