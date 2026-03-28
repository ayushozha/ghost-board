#!/bin/bash
# Ghost Board - Ralph Loop for Claude Code
# Based on Geoffrey Huntley's Ralph Wiggum technique
#
# Usage: ./RALPH_LOOP.sh [max_iterations]
# Default: 50 iterations

MAX_ITERATIONS=${1:-50}
ITERATION=0
SLEEP_BETWEEN=5

echo "========================================="
echo "  Ghost Board Ralph Loop"
echo "  Max iterations: $MAX_ITERATIONS"
echo "  Agent: clauded"
echo "  Started: $(date)"
echo "========================================="

while [ $ITERATION -lt $MAX_ITERATIONS ]; do
    ITERATION=$((ITERATION + 1))
    echo ""
    echo "--- Iteration $ITERATION / $MAX_ITERATIONS [$(date '+%H:%M:%S')] ---"

    # Check if all tasks are done
    REMAINING=$(grep -c "^\[ \]" progress.txt 2>/dev/null || echo "0")
    if [ "$REMAINING" -eq "0" ]; then
        echo "All tasks complete! Exiting Ralph Loop."
        break
    fi
    echo "Tasks remaining: $REMAINING"

    # Run Claude Code
    clauded --print \
        "Read CLAUDE.md for full instructions. Read progress.txt and find the FIRST task marked [ ] (not done). Complete that ONE task. Write tests. Run tests with: python -m pytest tests/ -x --tb=short. Fix any failures. Mark the task [x] in progress.txt. Git add and commit. Then stop." \
        2>&1 | tee -a "logs/ralph_iteration_${ITERATION}.log"

    EXIT_CODE=$?

    if [ $EXIT_CODE -ne 0 ]; then
        echo "WARNING: clauded exited with code $EXIT_CODE"
        echo "Continuing to next iteration..."
    fi

    # Log progress
    DONE=$(grep -c "^\[x\]" progress.txt 2>/dev/null || echo "0")
    echo "Progress: $DONE done, $REMAINING remaining"

    # Brief pause to avoid rate limits
    sleep $SLEEP_BETWEEN
done

echo ""
echo "========================================="
echo "  Ralph Loop Complete"
echo "  Total iterations: $ITERATION"
echo "  Completed tasks: $(grep -c '^\[x\]' progress.txt 2>/dev/null || echo 0)"
echo "  Remaining tasks: $(grep -c '^\[ \]' progress.txt 2>/dev/null || echo 0)"
echo "  Ended: $(date)"
echo "========================================="
echo ""
echo "Next: review the code, run the demo, fix critical issues."
echo "  python main.py 'Launch Anchrix, a stablecoin payout platform for US fintechs'"