#!/bin/bash
set -e

echo "========================================="
echo "  Ghost Board - Autonomous Setup"
echo "========================================="

# --- Step 1: Check prerequisites ---
echo ""
echo "[1/8] Checking prerequisites..."

if ! command -v python3 &> /dev/null; then
    echo "ERROR: python3 not found. Install Python 3.11+"
    exit 1
fi

if ! command -v git &> /dev/null; then
    echo "ERROR: git not found."
    exit 1
fi

if ! command -v claude &> /dev/null; then
    echo "WARNING: Claude Code CLI not found. Install with: npm install -g @anthropic-ai/claude-code"
fi

echo "  python3: $(python3 --version)"
echo "  git: $(git --version)"

# --- Step 2: Check API keys ---
echo ""
echo "[2/8] Checking API keys..."

if [ -z "$OPENAI_API_KEY" ]; then
    echo "ERROR: OPENAI_API_KEY not set."
    echo "Run: export OPENAI_API_KEY='sk-...'"
    exit 1
fi

if [ -z "$WANDB_API_KEY" ]; then
    echo "WARNING: WANDB_API_KEY not set. W&B logging will be disabled."
    echo "Run: export WANDB_API_KEY='...'"
fi

if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "WARNING: ANTHROPIC_API_KEY not set. Needed for Claude Code."
    echo "Run: export ANTHROPIC_API_KEY='sk-ant-...'"
fi

echo "  OPENAI_API_KEY: set"
echo "  WANDB_API_KEY: ${WANDB_API_KEY:+set}${WANDB_API_KEY:-NOT SET}"

# --- Step 3: Init repo ---
echo ""
echo "[3/8] Initializing ghost-board repo..."

if [ ! -d ".git" ]; then
    git init
fi

# --- Step 4: Create directory structure ---
echo ""
echo "[4/8] Creating directory structure..."

mkdir -p agents coordination simulation outputs/prototype outputs/financial_model outputs/gtm outputs/compliance demo tests

touch agents/__init__.py coordination/__init__.py simulation/__init__.py

# --- Step 5: Install Python dependencies ---
echo ""
echo "[5/8] Installing Python dependencies..."

python3 -m venv venv 2>/dev/null || true
source venv/bin/activate 2>/dev/null || true

pip install --quiet openai wandb pydantic rich click aiohttp python-dotenv 2>/dev/null
pip install --quiet pytest pytest-asyncio 2>/dev/null

echo "  Dependencies installed."

# --- Step 6: Clone MiroFish (for reference/integration) ---
echo ""
echo "[6/8] Cloning MiroFish for reference..."

if [ ! -d "vendor/MiroFish" ]; then
    mkdir -p vendor
    git clone --depth 1 https://github.com/666ghj/MiroFish.git vendor/MiroFish 2>/dev/null || echo "  MiroFish clone failed (network?). Continuing without it."
fi

if [ ! -d "vendor/BettaFish" ]; then
    git clone --depth 1 https://github.com/666ghj/BettaFish.git vendor/BettaFish 2>/dev/null || echo "  BettaFish clone failed (network?). Continuing without it."
fi

echo "  Vendor repos cloned (for reference, not direct dependency)."

# --- Step 7: Create .env ---
echo ""
echo "[7/8] Creating .env file..."

cat > .env << 'ENVEOF'
OPENAI_API_KEY=${OPENAI_API_KEY}
WANDB_API_KEY=${WANDB_API_KEY}
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
WANDB_PROJECT=ghost-board
ENVEOF

# Substitute actual values
envsubst < .env > .env.tmp && mv .env.tmp .env

# --- Step 8: Initial commit ---
echo ""
echo "[8/8] Making initial commit..."

git add -A
git commit -m "ghost-board: initial project structure" --allow-empty 2>/dev/null || true

echo ""
echo "========================================="
echo "  Setup complete!"
echo ""
echo "  Next steps:"
echo "  1. Review CLAUDE.md (agent instructions)"
echo "  2. Review progress.txt (task tracker)"
echo "  3. Run: ./RALPH_LOOP.sh"
echo "========================================="
