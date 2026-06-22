#!/bin/bash
#
# Ralph Loop for Claude Code
#
# Based on Geoffrey Huntley's Ralph Wiggum methodology:
# https://github.com/ghuntley/how-to-ralph-wiggum
#
# Combined with SpecKit-style specifications.
#
# Key principles:
# - Each iteration picks ONE task/spec to work on
# - Agent works until acceptance criteria are met
# - Only outputs <promise>DONE</promise> when truly complete
# - Bash loop checks for magic phrase before continuing
# - Fresh context window each iteration
#
# Work sources (in priority order):
# 1. IMPLEMENTATION_PLAN.md (if exists) - pick highest priority task
# 2. specs/ folder - pick highest priority incomplete spec
#
# Safety (hardened):
# - DEFAULT iteration cap (20) so the loop can NEVER run unbounded.
#   Override per-run with a number arg, MAX_ITERATIONS env, or --unlimited.
# - Branch guard: refuses to run on master/develop/main (they auto-deploy).
# - Circuit breaker + per-spec NR_OF_TRIES halt the loop when it stops making
#   progress, instead of looping forever on a verification it can't satisfy.
# - Runnable acceptance: a spec may carry a `Verify: <cmd>` line; the loop runs
#   it and treats exit 0 as authoritative (overrides screenshot self-judgment).
#
# Usage:
#   ./scripts/ralph-loop.sh              # Build mode (default cap: 25 iterations)
#   ./scripts/ralph-loop.sh 20           # Build mode (max 20 iterations)
#   ./scripts/ralph-loop.sh --unlimited  # Build mode, no cap (dangerous)
#   ./scripts/ralph-loop.sh plan         # Planning mode (creates IMPLEMENTATION_PLAN.md)
#   ./scripts/ralph-loop.sh --dry-run    # Print startup checks + work plan, then exit
#   ./scripts/ralph-loop.sh --reset-circuit  # Reset persisted circuit-breaker state, exit
#

set -e
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_DIR/logs"
CONSTITUTION="$PROJECT_DIR/.specify/memory/constitution.md"

# Configuration
MAX_ITERATIONS="${MAX_ITERATIONS:-20}"   # default cap; 0 = unlimited (requires --unlimited)
MODE="build"
CLAUDE_CMD="${CLAUDE_CMD:-claude}"
CLAUDE_MODEL="${CLAUDE_MODEL:-claude-opus-4-7}"
YOLO_FLAG="--dangerously-skip-permissions"
TAIL_LINES=5
TAIL_RENDERED_LINES=0
ROLLING_OUTPUT_LINES=5
ROLLING_OUTPUT_INTERVAL=10
ROLLING_RENDERED_LINES=0

# Flags
ALLOW_DEPLOY_BRANCH=false
DRY_RUN=false

# Branches the loop must NEVER run on (they auto-deploy, or are the stub default).
BLOCKED_BRANCHES="master develop main"

# Exit codes
EXIT_OK=0
EXIT_ERROR=1
EXIT_CAP=2
EXIT_HALTED=3   # circuit breaker opened or spec stuck

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

mkdir -p "$LOG_DIR"

# Source helpers
source "$SCRIPT_DIR/lib/spec_queue.sh"
source "$SCRIPT_DIR/lib/circuit_breaker.sh"
source "$SCRIPT_DIR/lib/nr_of_tries.sh"

# Check constitution for YOLO setting
YOLO_ENABLED=true
if [[ -f "$CONSTITUTION" ]]; then
    if grep -q "YOLO Mode.*DISABLED" "$CONSTITUTION" 2>/dev/null; then
        YOLO_ENABLED=false
    fi
fi

show_help() {
    cat <<EOF
Ralph Loop for Claude Code

Based on Geoffrey Huntley's Ralph Wiggum methodology + SpecKit specs.
https://github.com/ghuntley/how-to-ralph-wiggum

Usage:
  ./scripts/ralph-loop.sh              # Build mode, default cap (20 iterations)
  ./scripts/ralph-loop.sh 20           # Build mode, max 20 iterations
  ./scripts/ralph-loop.sh --unlimited  # Build mode, NO cap (dangerous)
  ./scripts/ralph-loop.sh plan         # Planning mode (creates IMPLEMENTATION_PLAN.md)
  ./scripts/ralph-loop.sh --dry-run    # Show checks + work plan, then exit (no Claude)
  ./scripts/ralph-loop.sh --reset-circuit  # Reset circuit-breaker state, then exit

Modes:
  build (default)  Pick spec/task and implement
  plan             Create IMPLEMENTATION_PLAN.md from specs (OPTIONAL)

Safety:
  - Default iteration cap is 20. The loop ALWAYS stops (cap, circuit breaker,
    or per-spec NR_OF_TRIES). Use --unlimited to remove the cap.
  - Refuses to run on master/develop/main. Override with --allow-deploy-branch
    (you almost certainly do not want this).

Work Sources (checked in order):
  1. IMPLEMENTATION_PLAN.md - If exists, pick highest priority task
  2. specs/ folder - Otherwise, pick highest priority incomplete spec

Acceptance:
  - A spec may carry a \`Verify: <cmd>\` line. The loop runs that command each
    iteration and treats exit 0 as authoritative acceptance. A spec whose
    acceptance can't be checked by a command risks stalling (see --dry-run).

How it works:
  1. Each iteration feeds PROMPT.md to Claude via stdin
  2. Claude picks the HIGHEST PRIORITY incomplete spec/task
  3. Claude implements, tests, and verifies acceptance criteria
  4. Claude outputs <promise>DONE</promise> ONLY if criteria are met
  5. Bash loop checks for the magic phrase AND runs the spec's Verify: command
  6. Progress is measured: a commit landed, the incomplete-spec count dropped,
     or Verify passed. No progress for several loops => circuit opens => halt.

EOF
}

print_latest_output() {
    local log_file="$1"
    local label="${2:-Claude}"
    local target="/dev/tty"

    [ -f "$log_file" ] || return 0

    if [ ! -w "$target" ]; then
        target="/dev/stdout"
    fi

    if [ "$target" = "/dev/tty" ] && [ "$TAIL_RENDERED_LINES" -gt 0 ]; then
        printf "\033[%dA\033[J" "$TAIL_RENDERED_LINES" > "$target"
    fi

    {
        echo "Latest ${label} output (last ${TAIL_LINES} lines):"
        tail -n "$TAIL_LINES" "$log_file"
    } > "$target"

    if [ "$target" = "/dev/tty" ]; then
        TAIL_RENDERED_LINES=$((TAIL_LINES + 1))
    fi
}

watch_latest_output() {
    local log_file="$1"
    local label="${2:-Claude}"
    local target="/dev/tty"
    local use_tty=false
    local use_tput=false

    [ -f "$log_file" ] || return 0

    if [ ! -w "$target" ]; then
        target="/dev/stdout"
    else
        use_tty=true
        if command -v tput &>/dev/null; then
            use_tput=true
        fi
    fi

    if [ "$use_tty" = true ]; then
        if [ "$use_tput" = true ]; then
            tput cr > "$target"
            tput sc > "$target"
        else
            printf "\r\0337" > "$target"
        fi
    fi

    while true; do
        local timestamp
        timestamp=$(date '+%Y-%m-%d %H:%M:%S')

        if [ "$use_tty" = true ]; then
            if [ "$use_tput" = true ]; then
                tput rc > "$target"
                tput ed > "$target"
                tput cr > "$target"
            else
                printf "\0338\033[J\r" > "$target"
            fi
        fi

        {
            echo -e "${CYAN}[$timestamp] Latest ${label} output (last ${ROLLING_OUTPUT_LINES} lines):${NC}"
            if [ ! -s "$log_file" ]; then
                echo "(no output yet)"
            else
                tail -n "$ROLLING_OUTPUT_LINES" "$log_file" 2>/dev/null || true
            fi
            echo ""
        } > "$target"

        sleep "$ROLLING_OUTPUT_INTERVAL"
    done
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        plan)
            MODE="plan"
            if [[ "${2:-}" =~ ^[0-9]+$ ]]; then
                MAX_ITERATIONS="$2"
                shift 2
            else
                MAX_ITERATIONS=1
                shift
            fi
            ;;
        --unlimited)
            MAX_ITERATIONS=0
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --allow-deploy-branch)
            ALLOW_DEPLOY_BRANCH=true
            shift
            ;;
        --reset-circuit)
            init_circuit_breaker
            reset_circuit_breaker "manual --reset-circuit"
            exit "$EXIT_OK"
            ;;
        -h|--help)
            show_help
            exit "$EXIT_OK"
            ;;
        [0-9]*)
            MODE="build"
            MAX_ITERATIONS="$1"
            shift
            ;;
        *)
            echo -e "${RED}Unknown argument: $1${NC}"
            show_help
            exit "$EXIT_ERROR"
            ;;
    esac
done

cd "$PROJECT_DIR"

# Session log (captures ALL output)
SESSION_LOG="$LOG_DIR/ralph_${MODE}_session_$(date '+%Y%m%d_%H%M%S').log"
exec > >(tee -a "$SESSION_LOG") 2>&1

# Check if Claude CLI is available (skip in dry-run)
if [ "$DRY_RUN" = false ] && ! command -v "$CLAUDE_CMD" &> /dev/null; then
    echo -e "${RED}Error: Claude CLI not found${NC}"
    echo ""
    echo "Install Claude Code CLI and authenticate first."
    echo "https://claude.ai/code"
    exit "$EXIT_ERROR"
fi

# Determine which prompt to use based on mode and available files
if [ "$MODE" = "plan" ]; then
    PROMPT_FILE="PROMPT_plan.md"
else
    PROMPT_FILE="PROMPT_build.md"
fi

# Generate minimal PROMPT files — constitution.md already contains the full workflow
cat > "PROMPT_build.md" << 'BUILDEOF'
# Ralph Loop — Build Mode

You are running inside a Ralph Wiggum autonomous loop (Context A).

Read `.specify/memory/constitution.md` — it contains all project principles, workflow
instructions, work sources, and completion signal requirements.

Find the highest-priority incomplete work item, implement it completely, verify all
acceptance criteria, commit and push, then output `<promise>DONE</promise>`.

If the spec has a `Verify:` line, make sure that command passes before signaling done.
BUILDEOF

cat > "PROMPT_plan.md" << 'PLANEOF'
# Ralph Loop — Planning Mode

You are running inside a Ralph Wiggum autonomous loop in planning mode.

Read `.specify/memory/constitution.md` for project principles.

Study `specs/` and compare against the current codebase (gap analysis).
Create or update `IMPLEMENTATION_PLAN.md` with a prioritized task breakdown.
Do NOT implement anything.

When the plan is complete, output `<promise>DONE</promise>`.
PLANEOF

# Check prompt file exists
if [ ! -f "$PROMPT_FILE" ]; then
    echo -e "${RED}Error: $PROMPT_FILE not found${NC}"
    exit "$EXIT_ERROR"
fi

# Build Claude flags
CLAUDE_FLAGS="-p --model $CLAUDE_MODEL"
if [ "$YOLO_ENABLED" = true ]; then
    CLAUDE_FLAGS="$CLAUDE_FLAGS $YOLO_FLAG"
fi

# Get current branch
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "main")

# ── Branch guard ───────────────────────────────────────────────────────────
# ralph-loop.sh pushes unconditionally after every iteration; master/develop
# auto-deploy. Refuse to run there unless explicitly overridden.
if [ "$ALLOW_DEPLOY_BRANCH" = false ]; then
    for blocked in $BLOCKED_BRANCHES; do
        if [ "$CURRENT_BRANCH" = "$blocked" ]; then
            echo -e "${RED}╔══════════════════════════════════════════════════════════════╗${NC}"
            echo -e "${RED}║  REFUSING TO RUN on branch '$CURRENT_BRANCH'                  ║${NC}"
            echo -e "${RED}╚══════════════════════════════════════════════════════════════╝${NC}"
            echo ""
            echo -e "${RED}This branch auto-deploys, and the loop runs 'git push' after every${NC}"
            echo -e "${RED}iteration. Create a feature branch first:  git checkout -b feat/<spec>${NC}"
            echo ""
            echo -e "${YELLOW}To override (NOT recommended): --allow-deploy-branch${NC}"
            exit "$EXIT_HALTED"
        fi
    done
fi

# ── Fresh circuit-breaker state for each invocation ────────────────────────
init_circuit_breaker
reset_circuit_breaker "fresh run on $CURRENT_BRANCH"

# Check for work sources
HAS_PLAN=false
HAS_SPECS=false
SPEC_COUNT=0
INCOMPLETE_SPEC_COUNT=0
FIRST_INCOMPLETE_SPEC=""
[ -f "IMPLEMENTATION_PLAN.md" ] && HAS_PLAN=true
if [ -d "specs" ]; then
    SPEC_COUNT=$(count_root_specs "specs")
    INCOMPLETE_SPEC_COUNT=$(count_incomplete_root_specs "specs")
    [ "$SPEC_COUNT" -gt 0 ] && HAS_SPECS=true
    if [ "$INCOMPLETE_SPEC_COUNT" -gt 0 ]; then
        FIRST_INCOMPLETE_SPEC=$(get_first_incomplete_root_spec "specs")
    fi
fi

# Snapshot incomplete count at run start (for the end-of-run summary)
INCOMPLETE_BEFORE="$INCOMPLETE_SPEC_COUNT"

CAP_LABEL="unlimited"
[ "$MAX_ITERATIONS" -gt 0 ] && CAP_LABEL="$MAX_ITERATIONS iterations"

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}              RALPH LOOP (Claude Code) STARTING              ${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BLUE}Mode:${NC}     $MODE"
echo -e "${BLUE}Model:${NC}    $CLAUDE_MODEL"
echo -e "${BLUE}Prompt:${NC}   $PROMPT_FILE"
echo -e "${BLUE}Branch:${NC}   $CURRENT_BRANCH"
echo -e "${BLUE}Cap:${NC}      $CAP_LABEL"
echo -e "${YELLOW}YOLO:${NC}     $([ "$YOLO_ENABLED" = true ] && echo "ENABLED" || echo "DISABLED")"
[ -n "$SESSION_LOG" ] && echo -e "${BLUE}Log:${NC}      $SESSION_LOG"
echo ""
echo -e "${BLUE}Work source:${NC}"
if [ "$HAS_PLAN" = true ]; then
    echo -e "  ${GREEN}✓${NC} IMPLEMENTATION_PLAN.md (will use this)"
else
    echo -e "  ${YELLOW}○${NC} IMPLEMENTATION_PLAN.md (not found, that's OK)"
fi
if [ "$HAS_SPECS" = true ]; then
    echo -e "  ${GREEN}✓${NC} specs/ folder ($SPEC_COUNT specs, $INCOMPLETE_SPEC_COUNT incomplete)"
    if [ "$HAS_PLAN" = false ] && [ "$INCOMPLETE_SPEC_COUNT" -gt 0 ]; then
        echo -e "    ${CYAN}Next incomplete:${NC} $FIRST_INCOMPLETE_SPEC"
        local_verify=$(get_spec_verify_command "$FIRST_INCOMPLETE_SPEC")
        if [ -n "$local_verify" ]; then
            echo -e "    ${CYAN}Verify:${NC} $local_verify"
        else
            echo -e "    ${YELLOW}Verify:${NC} (none — acceptance relies on the agent's judgment)"
        fi
    fi
else
    echo -e "  ${RED}✗${NC} specs/ folder (no .md files found)"
fi
echo ""

# Exit early if all specs are complete and no plan
if [ "$MODE" = "build" ] && [ "$HAS_PLAN" = false ] && [ "$HAS_SPECS" = true ] && [ "$INCOMPLETE_SPEC_COUNT" -eq 0 ]; then
    echo -e "${GREEN}All $SPEC_COUNT specs are COMPLETE. Nothing to do.${NC}"
    echo -e "${CYAN}To add more work, create a new spec in specs/ without 'Status: COMPLETE'.${NC}"
    exit "$EXIT_OK"
fi

echo -e "${CYAN}Acceptance: <promise>DONE</promise> from the agent AND the spec's Verify:${NC}"
echo -e "${CYAN}command (if any) must pass. No progress for several loops => halt.${NC}"
echo ""

# ── Dry run: show the plan and exit without invoking Claude ────────────────
if [ "$DRY_RUN" = true ]; then
    echo -e "${GREEN}── Dry run complete — no Claude invocation, no pushes. ──${NC}"
    exit "$EXIT_OK"
fi

echo -e "${YELLOW}Press Ctrl+C to stop the loop${NC}"
echo ""

ITERATION=0
EXIT_REASON=""

while true; do
    # Re-anchor to repo root every iteration. A Verify: command may legitimately
    # `cd` (e.g. `cd frontend && npm test`); belt-and-suspenders with the subshell
    # around verify, this keeps relative `specs/` + `PROMPT_*` lookups correct.
    cd "$PROJECT_DIR" || { echo -e "${RED}ERROR: could not cd to $PROJECT_DIR${NC}"; exit "$EXIT_ERROR"; }

    # Check max iterations
    if [ "$MAX_ITERATIONS" -gt 0 ] && [ "$ITERATION" -ge "$MAX_ITERATIONS" ]; then
        echo -e "${GREEN}Reached cap: $MAX_ITERATIONS iterations${NC}"
        EXIT_REASON="cap"
        break
    fi

    # Circuit breaker: halt if a prior run left it OPEN (shouldn't happen — we
    # reset at startup — but be defensive) or if it opened mid-run.
    if ! can_execute; then
        echo -e "${RED}🚨 Circuit breaker is OPEN — halting to avoid a runaway loop.${NC}"
        show_circuit_status
        EXIT_REASON="circuit"
        break
    fi

    ITERATION=$((ITERATION + 1))
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

    echo ""
    echo -e "${PURPLE}══════════════════════ LOOP $ITERATION ════════════════════${NC}"
    echo -e "${BLUE}[$TIMESTAMP]${NC} Starting iteration $ITERATION"
    echo ""

    # Snapshot state BEFORE Claude runs, to measure real progress afterward.
    PREV_HEAD=$(git rev-parse HEAD 2>/dev/null || echo "")
    WORKED_SPEC=$(get_first_incomplete_root_spec "specs")
    INCOMPLETE_AT_START=$(count_incomplete_root_specs "specs")
    VERIFY_CMD=""
    [ -n "$WORKED_SPEC" ] && VERIFY_CMD=$(get_spec_verify_command "$WORKED_SPEC")

    # Log file for this iteration
    LOG_FILE="$LOG_DIR/ralph_${MODE}_iter_${ITERATION}_$(date '+%Y%m%d_%H%M%S').log"
    : > "$LOG_FILE"
    WATCH_PID=""

    if [ "$ROLLING_OUTPUT_INTERVAL" -gt 0 ] && [ "$ROLLING_OUTPUT_LINES" -gt 0 ] && [ -t 1 ] && [ -w /dev/tty ]; then
        watch_latest_output "$LOG_FILE" "Claude" &
        WATCH_PID=$!
    fi

    # Run Claude with prompt via stdin, capture output
    CLAUDE_OUTPUT=""
    CLAUDE_OK=false
    if CLAUDE_OUTPUT=$(cat "$PROJECT_DIR/$PROMPT_FILE" | "$CLAUDE_CMD" $CLAUDE_FLAGS 2>&1 | tee "$LOG_FILE"); then
        CLAUDE_OK=true
    fi

    if [ -n "$WATCH_PID" ]; then
        kill "$WATCH_PID" 2>/dev/null || true
        wait "$WATCH_PID" 2>/dev/null || true
    fi
    echo ""

    if [ "$CLAUDE_OK" = true ]; then
        echo -e "${GREEN}✓ Claude execution completed${NC}"
    else
        echo -e "${RED}✗ Claude execution failed${NC}"
        echo -e "${YELLOW}Check log: $LOG_FILE${NC}"
        print_latest_output "$LOG_FILE" "Claude"
        # Count as an error, then fall through to progress/circuit bookkeeping.
        record_loop_result "$ITERATION" 0 true >/dev/null 2>&1 || true
        if [ -n "$WORKED_SPEC" ] && [ "$INCOMPLETE_AT_START" -gt 0 ]; then
            increment_nr_of_tries "$WORKED_SPEC" >/dev/null 2>&1 || true
        fi
        # Push any partial changes, then continue.
        git push origin "$CURRENT_BRANCH" 2>/dev/null || true
        continue
    fi

    # ── Measure progress ──────────────────────────────────────────────────
    INCOMPLETE_AFTER=$(count_incomplete_root_specs "specs")
    COMMITS=0
    if [ -n "$PREV_HEAD" ]; then
        COMMITS=$(git rev-list --count "${PREV_HEAD}..HEAD" 2>/dev/null || echo 0)
    fi

    # ── Runnable acceptance: run the spec's Verify: command if present ─────
    VERIFY_RAN=false
    VERIFY_PASS=false
    if [ -n "$VERIFY_CMD" ]; then
        VERIFY_RAN=true
        echo -e "${CYAN}▶ Verify: $VERIFY_CMD${NC}"
        # Run Verify in a SUBHELL so a command that legitimately `cd`s (e.g.
        # `cd frontend && npm test`) cannot leak into the loop's cwd — that leak
        # breaks the next iteration's relative `PROMPT_*` and `specs/` lookups.
        if ( eval "$VERIFY_CMD" ) >>"$LOG_FILE" 2>&1; then
            VERIFY_PASS=true
            echo -e "${GREEN}✓ Verify passed${NC}"
        else
            echo -e "${RED}✗ Verify FAILED — acceptance not met${NC}"
        fi
    fi

    # ── Completion signal from the agent ──────────────────────────────────
    DONE_DETECTED=false
    if echo "$CLAUDE_OUTPUT" | grep -qE "<promise>(ALL_)?DONE</promise>"; then
        DONE_DETECTED=true
        DETECTED_SIGNAL=$(echo "$CLAUDE_OUTPUT" | grep -oE "<promise>(ALL_)?DONE</promise>" | tail -1)
        echo -e "${GREEN}✓ Completion signal detected: ${DETECTED_SIGNAL}${NC}"
    fi

    # If the agent claimed DONE but its Verify failed, do NOT accept it.
    if [ "$DONE_DETECTED" = true ] && [ "$VERIFY_RAN" = true ] && [ "$VERIFY_PASS" = false ]; then
        echo -e "${RED}⚠ Agent emitted DONE but Verify failed — rejecting.${NC}"
        DONE_DETECTED=false
    fi

    # Progress = a commit landed, a spec completed, or Verify passed.
    PROGRESS=0
    if [ "$COMMITS" -gt 0 ] || [ "$INCOMPLETE_AFTER" -lt "$INCOMPLETE_AT_START" ] || [ "$VERIFY_PASS" = true ]; then
        PROGRESS=1
    fi

    HAS_ERRORS=false
    if [ "$DONE_DETECTED" = false ] && [ "$PROGRESS" -eq 0 ]; then HAS_ERRORS=true; fi
    if [ "$VERIFY_RAN" = true ] && [ "$VERIFY_PASS" = false ]; then HAS_ERRORS=true; fi

    if [ "$DONE_DETECTED" = true ]; then
        echo -e "${GREEN}✓ Task accepted${NC}"
    else
        echo -e "${YELLOW}⚠ Not accepted this iteration (no DONE, or Verify failed).${NC}"
        print_latest_output "$LOG_FILE" "Claude"
    fi

    # ── Feed the circuit breaker (halts via can_execute next loop if OPEN) ─
    if ! record_loop_result "$ITERATION" "$PROGRESS" "$HAS_ERRORS" >/dev/null 2>&1; then
        echo -e "${RED}🚨 Circuit breaker OPENED — no progress in too many loops.${NC}"
        EXIT_REASON="circuit"
        break
    fi

    # ── Per-spec NR_OF_TRIES (split the spec if it keeps failing) ──────────
    if [ -n "$WORKED_SPEC" ]; then
        if is_root_spec_complete "$WORKED_SPEC"; then
            reset_nr_of_tries "$WORKED_SPEC" 2>/dev/null || true
        elif [ "$PROGRESS" -eq 0 ]; then
            TRIES=$(increment_nr_of_tries "$WORKED_SPEC" 2>/dev/null || echo 0)
            if is_spec_stuck "$WORKED_SPEC"; then
                echo -e "${RED}🚨 Spec stuck (≥ ${MAX_NR_OF_TRIES} attempts): $WORKED_SPEC${NC}"
                echo -e "${RED}  Split it into smaller specs before continuing.${NC}"
                EXIT_REASON="stuck"
                break
            fi
        fi
    fi

    # For planning mode, stop after one successful plan.
    if [ "$MODE" = "plan" ] && [ "$DONE_DETECTED" = true ]; then
        echo ""
        echo -e "${GREEN}Planning complete!${NC}"
        echo -e "${CYAN}Run './scripts/ralph-loop.sh' to start building.${NC}"
        echo -e "${CYAN}Or delete IMPLEMENTATION_PLAN.md to work directly from specs.${NC}"
        break
    fi

    # Push changes after each iteration (if any)
    git push origin "$CURRENT_BRANCH" 2>/dev/null || {
        if git log "origin/$CURRENT_BRANCH..HEAD" --oneline 2>/dev/null | grep -q .; then
            echo -e "${YELLOW}Push failed, creating remote branch...${NC}"
            git push -u origin "$CURRENT_BRANCH" 2>/dev/null || true
        fi
    }

    # Brief pause between iterations
    echo ""
    echo -e "${BLUE}Waiting 2s before next iteration...${NC}"
    sleep 2
done

# ── Summary + exit code ─────────────────────────────────────────────────────
INCOMPLETE_FINAL=$(count_incomplete_root_specs "specs" 2>/dev/null || echo "$INCOMPLETE_BEFORE")
if [ "$INCOMPLETE_FINAL" -lt "$INCOMPLETE_BEFORE" ]; then
    SPECS_DONE=$((INCOMPLETE_BEFORE - INCOMPLETE_FINAL))
else
    SPECS_DONE=0
fi

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}         RALPH LOOP FINISHED ($ITERATION iterations)         ${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Specs completed this run:${NC} $SPECS_DONE"
echo -e "${BLUE}Specs still incomplete:${NC}  $INCOMPLETE_FINAL"
if [ -z "$EXIT_REASON" ]; then
    if [ "$INCOMPLETE_FINAL" -eq 0 ]; then
        EXIT_REASON="complete"
    else
        EXIT_REASON="unknown"
    fi
fi
echo -e "${BLUE}Reason:${NC} $EXIT_REASON"

case "$EXIT_REASON" in
    complete) exit "$EXIT_OK" ;;
    cap)      exit "$EXIT_CAP" ;;
    circuit|stuck) exit "$EXIT_HALTED" ;;
    *)        exit "$EXIT_ERROR" ;;
esac
