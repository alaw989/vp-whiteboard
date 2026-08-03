#!/bin/bash
# Tool Quality Loop
#
# Usage in opencode:
#   1. Run:  skill tool-quality-loop
#   2. The agent scans tools/, fixes one issue, verifies, commits
#   3. Re-run the skill to fix the next issue
#   4. Stop when the agent outputs ALL_DONE
#
# This is NOT a CLI automation — opencode is interactive.
# The skill lives at ~/.config/opencode/skills/tool-quality-loop/SKILL.md
# and is loaded within opencode via the `skill` tool.

echo "Tool Quality Loop — opencode skill"
echo ""
echo "To run inside opencode:"
echo "  skill tool-quality-loop"
echo ""
echo "This loads the scan checklist. The agent will:"
echo "  1. Check typecheck errors"
echo "  2. Check test failures"
echo "  3. Check TOOL_AUDIT.md gaps"
echo "  4. Scan tools/ for common bug patterns"
echo "  5. Fix the most severe issue found"
echo "  6. Verify with tests"
echo "  7. Commit"
echo ""
echo "Re-run 'skill tool-quality-loop' to continue."
echo "Stop when the agent outputs: ALL_DONE"
