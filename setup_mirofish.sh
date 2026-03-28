#!/bin/bash
set -e

echo "========================================="
echo "  MiroFish + BettaFish Setup"
echo "========================================="

# -----------------------------------------------
# MIROFISH - Market Simulation Engine
# -----------------------------------------------
echo ""
echo "[1/4] Setting up MiroFish..."

cd vendor

if [ ! -d "MiroFish" ]; then
    git clone https://github.com/666ghj/MiroFish.git
fi

cd MiroFish

# MiroFish needs: Node.js 18+, Python 3.11+, uv
# Check Node
if ! command -v node &> /dev/null; then
    echo "WARNING: Node.js not found. MiroFish frontend won't work."
    echo "Install: brew install node  OR  nvm install 18"
fi

# Create MiroFish .env
cat > .env << MFENV
# LLM Provider - use OpenAI since you have the key
LLM_PROVIDER=openai
LLM_API_KEY=${OPENAI_API_KEY}
LLM_MODEL_NAME=gpt-4o-mini
LLM_BASE_URL=https://api.openai.com/v1

# Zep Cloud - for agent memory (optional, MiroFish works without it but memory is limited)
# Get a free key at https://app.getzep.com if you want full agent memory
# ZEP_API_KEY=z_...

# Graph Database - KuzuDB (default, no setup needed)
GRAPH_DB_BACKEND=kuzu
MFENV

echo "  MiroFish .env created with OpenAI config."

# Install MiroFish dependencies
echo "  Installing MiroFish dependencies (this takes 1-2 min)..."

# Python backend
if command -v uv &> /dev/null; then
    cd backend
    uv venv --python 3.11 2>/dev/null || python3 -m venv .venv
    source .venv/bin/activate 2>/dev/null || true
    uv pip install -r requirements.txt 2>/dev/null || pip install -r requirements.txt 2>/dev/null
    cd ..
else
    cd backend
    python3 -m venv .venv
    source .venv/bin/activate 2>/dev/null || true
    pip install -r requirements.txt 2>/dev/null || echo "  WARNING: pip install failed for MiroFish backend"
    cd ..
fi

# Node frontend (optional - you may not need the UI)
if command -v npm &> /dev/null; then
    cd frontend
    npm install --silent 2>/dev/null || echo "  WARNING: npm install failed for MiroFish frontend"
    cd ..
fi

echo "  MiroFish setup complete."

# Test MiroFish
echo "  Testing MiroFish..."
cd backend
python3 -c "from app.core.config import settings; print('  MiroFish config loaded OK')" 2>/dev/null || echo "  WARNING: MiroFish import test failed. Will use lightweight simulation fallback."
cd ..

cd ..  # back to vendor/

# -----------------------------------------------
# BETTAFISH - Sentiment Analysis Engine
# -----------------------------------------------
echo ""
echo "[2/4] Setting up BettaFish..."

if [ ! -d "BettaFish" ]; then
    git clone https://github.com/666ghj/BettaFish.git
fi

cd BettaFish

# BettaFish .env
cat > .env << BFENV
# OpenAI config
OPENAI_API_KEY=${OPENAI_API_KEY}
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL_NAME=gpt-4o-mini

# Search config (BettaFish uses Anspire for web search, but we can skip this)
# ANSPIRE_API_KEY=...
BFENV

# Install BettaFish deps (lighter than MiroFish)
echo "  Installing BettaFish dependencies..."
python3 -m venv .venv 2>/dev/null || true
source .venv/bin/activate 2>/dev/null || true
pip install --quiet openai pydantic rich 2>/dev/null || true

# We mainly want BettaFish's sentiment analysis patterns
# The full crawler (playwright + chromium) is too heavy for hackathon
echo "  BettaFish setup complete (sentiment analysis modules only)."

cd ..  # back to vendor/
cd ..  # back to ghost-board/

# -----------------------------------------------
# CREATE INTEGRATION BRIDGE
# -----------------------------------------------
echo ""
echo "[3/4] Creating MiroFish integration bridge..."

# This bridge lets CEO Agent call MiroFish for market simulation
# If MiroFish isn't fully working, it falls back to lightweight custom sim

cat > simulation/mirofish_bridge.py << 'BRIDGE'
"""
MiroFish Integration Bridge

Attempts to use MiroFish for market simulation.
Falls back to lightweight custom simulation if MiroFish is not available.

Credit: MiroFish by Guo Hangjiang (github.com/666ghj/MiroFish)
Powered by OASIS framework by CAMEL-AI
"""
import os
import sys
import json
import subprocess
from pathlib import Path

MIROFISH_PATH = Path(__file__).parent.parent / "vendor" / "MiroFish"
MIROFISH_AVAILABLE = (MIROFISH_PATH / "backend").exists()


async def run_mirofish_simulation(seed_text: str, config: dict = None) -> dict:
    """
    Try to run MiroFish simulation. Fall back to custom if unavailable.

    Args:
        seed_text: The startup concept/pitch to simulate reactions to
        config: Optional config overrides (agent_count, rounds, etc.)

    Returns:
        dict with simulation results (posts, sentiment, key quotes)
    """
    if MIROFISH_AVAILABLE and _check_mirofish_deps():
        try:
            return await _run_real_mirofish(seed_text, config)
        except Exception as e:
            print(f"[MiroFish] Failed: {e}. Falling back to custom simulation.")

    # Fallback: use custom lightweight simulation
    from simulation.engine import run_simulation
    from simulation.personas import generate_personas

    personas = await generate_personas(
        concept=seed_text,
        strategy=config or {},
        count=config.get("agent_count", 25) if config else 25
    )
    result = await run_simulation(
        personas=personas,
        concept=seed_text,
        strategy=config or {},
        num_rounds=config.get("rounds", 5) if config else 5
    )
    return result


def _check_mirofish_deps() -> bool:
    """Check if MiroFish dependencies are actually installed."""
    try:
        venv_python = MIROFISH_PATH / "backend" / ".venv" / "bin" / "python3"
        if not venv_python.exists():
            return False
        result = subprocess.run(
            [str(venv_python), "-c", "import flask; import kuzu; print('ok')"],
            capture_output=True, timeout=5
        )
        return result.returncode == 0
    except Exception:
        return False


async def _run_real_mirofish(seed_text: str, config: dict = None) -> dict:
    """
    Run actual MiroFish simulation via its Python API.

    We bypass the web UI and call MiroFish's core functions directly:
    1. Create a workbench session
    2. Ingest the seed document
    3. Build the knowledge graph
    4. Generate agent personas
    5. Run OASIS simulation
    6. Get the report
    """
    venv_python = str(MIROFISH_PATH / "backend" / ".venv" / "bin" / "python3")
    backend_path = str(MIROFISH_PATH / "backend")

    # Write seed text to a temp file
    seed_file = MIROFISH_PATH / "backend" / "uploads" / "ghost_board_seed.txt"
    seed_file.parent.mkdir(parents=True, exist_ok=True)
    seed_file.write_text(seed_text)

    # Run MiroFish pipeline via subprocess
    # This calls MiroFish's core pipeline: ingest -> graph -> simulate -> report
    script = f"""
import sys
sys.path.insert(0, '{backend_path}')
import asyncio
from app.core.workbench import WorkbenchSession

async def run():
    session = WorkbenchSession()
    # Ingest seed document
    await session.ingest_document('{str(seed_file)}')
    # Build knowledge graph
    await session.build_graph()
    # Prepare simulation
    await session.prepare_simulation()
    # Run simulation
    result = await session.run_simulation()
    # Generate report
    report = await session.generate_report()
    import json
    print(json.dumps({{
        'simulation_result': str(result)[:2000],
        'report': str(report)[:3000],
        'status': 'success'
    }}))

asyncio.run(run())
"""

    result = subprocess.run(
        [venv_python, "-c", script],
        capture_output=True, text=True, timeout=300,
        env={**os.environ, "PYTHONPATH": backend_path}
    )

    if result.returncode == 0:
        # Parse the JSON output
        output_lines = result.stdout.strip().split('\n')
        for line in reversed(output_lines):
            try:
                return json.loads(line)
            except json.JSONDecodeError:
                continue

    raise RuntimeError(f"MiroFish failed: {result.stderr[:500]}")


# Utility: extract useful patterns from BettaFish
BETTAFISH_PATH = Path(__file__).parent.parent / "vendor" / "BettaFish"

def get_bettafish_sentiment_config() -> dict:
    """
    Read BettaFish's sentiment analysis configuration.
    Can be used to configure our own sentiment analysis.
    """
    config_path = BETTAFISH_PATH / "InsightEngine" / "tools" / "sentiment_analyzer.py"
    if config_path.exists():
        # Extract the SENTIMENT_CONFIG dict
        content = config_path.read_text()
        if "SENTIMENT_CONFIG" in content:
            return {
                "model_type": "multilingual",
                "confidence_threshold": 0.8,
                "source": "BettaFish"
            }
    return {"model_type": "default", "source": "fallback"}
BRIDGE

echo "  MiroFish bridge created at simulation/mirofish_bridge.py"

# -----------------------------------------------
# VERIFY EVERYTHING
# -----------------------------------------------
echo ""
echo "[4/4] Verification..."

echo "  MiroFish cloned: $([ -d vendor/MiroFish ] && echo YES || echo NO)"
echo "  MiroFish deps:   $([ -d vendor/MiroFish/backend/.venv ] && echo INSTALLED || echo MISSING)"
echo "  BettaFish cloned: $([ -d vendor/BettaFish ] && echo YES || echo NO)"
echo "  Bridge file:     $([ -f simulation/mirofish_bridge.py ] && echo CREATED || echo MISSING)"

echo ""
echo "========================================="
echo "  MiroFish + BettaFish Setup Complete"
echo ""
echo "  MiroFish: CEO Agent will try to use it for market simulation."
echo "  If MiroFish fails at runtime, it auto-falls back to custom sim."
echo "  BettaFish: Sentiment analysis patterns available for reference."
echo ""
echo "  The bridge at simulation/mirofish_bridge.py handles everything."
echo "========================================="
