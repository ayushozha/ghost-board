#!/bin/bash
# Ghost Board VPS Deployment Script
# Deploys FastAPI server behind nginx on the VPS at 72.62.82.57
#
# Prerequisites:
#   - SSH key at ~/.ssh/id_ed25519 with root access to VPS
#   - rsync installed locally
#   - .env file prepared on VPS at /opt/ghost-board/.env
#
# Usage:
#   ./scripts/deploy.sh              # Full deploy (sync + deps + services)
#   ./scripts/deploy.sh sync         # Code sync only
#   ./scripts/deploy.sh restart      # Restart services only
#   ./scripts/deploy.sh status       # Check service status
#   ./scripts/deploy.sh logs         # Tail live logs

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

VPS_HOST="72.62.82.57"
VPS_USER="root"
SSH_KEY="$HOME/.ssh/id_ed25519"
SSH_CMD="ssh -i ${SSH_KEY} -o StrictHostKeyChecking=accept-new"
APP_DIR="/opt/ghost-board"
SERVICE_NAME="ghost-board"
BIND_HOST="127.0.0.1"
BIND_PORT="8000"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log()  { echo -e "${GREEN}[DEPLOY]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# ---------------------------------------------------------------------------
# Resolve project root (script lives in scripts/)
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------

preflight() {
    log "Running pre-flight checks..."

    if ! command -v rsync &>/dev/null; then
        err "rsync is not installed. Install it and retry."
        exit 1
    fi

    if [ ! -f "${SSH_KEY}" ]; then
        err "SSH key not found at ${SSH_KEY}"
        exit 1
    fi

    # Quick connectivity test
    if ! ${SSH_CMD} ${VPS_USER}@${VPS_HOST} "echo ok" &>/dev/null; then
        err "Cannot reach ${VPS_USER}@${VPS_HOST} via SSH."
        exit 1
    fi

    log "Pre-flight checks passed."
}

# ---------------------------------------------------------------------------
# 1. Sync code to VPS
# ---------------------------------------------------------------------------

sync_code() {
    log "Syncing code to ${VPS_USER}@${VPS_HOST}:${APP_DIR}/ ..."

    # Build React dashboard locally if npm is available
    if [ -d "${PROJECT_ROOT}/dashboard-react" ] && command -v npm &>/dev/null; then
        log "Building React dashboard..."
        (cd "${PROJECT_ROOT}/dashboard-react" && npm run build 2>&1) || warn "Dashboard build failed; deploying without fresh build."
    fi

    rsync -avz --delete \
        --exclude='vendor/' \
        --exclude='node_modules/' \
        --exclude='__pycache__/' \
        --exclude='.git/' \
        --exclude='outputs/' \
        --exclude='.env' \
        --exclude='.venv/' \
        --exclude='*.pyc' \
        --exclude='.pytest_cache/' \
        --exclude='dashboard-react/node_modules/' \
        -e "${SSH_CMD}" \
        "${PROJECT_ROOT}/" "${VPS_USER}@${VPS_HOST}:${APP_DIR}/"

    log "Code sync complete."
}

# ---------------------------------------------------------------------------
# 2. Install dependencies on VPS
# ---------------------------------------------------------------------------

install_deps() {
    log "Installing Python dependencies on VPS..."

    ${SSH_CMD} ${VPS_USER}@${VPS_HOST} << 'REMOTE'
set -e
cd /opt/ghost-board

# Ensure python3 + pip are available
if ! command -v python3 &>/dev/null; then
    apt-get update -qq && apt-get install -y -qq python3 python3-pip python3-venv
fi

# Create virtualenv if missing
if [ ! -d .venv ]; then
    python3 -m venv .venv
fi

source .venv/bin/activate
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt
REMOTE

    log "Dependencies installed."
}

# ---------------------------------------------------------------------------
# 3. Ensure .env exists on VPS
# ---------------------------------------------------------------------------

check_env() {
    log "Checking .env on VPS..."

    ${SSH_CMD} ${VPS_USER}@${VPS_HOST} << REMOTE
if [ ! -f ${APP_DIR}/.env ]; then
    echo "[WARN] No .env found at ${APP_DIR}/.env"
    echo "       Create it with at least:"
    echo "         OPENAI_API_KEY=sk-..."
    echo "         DATABASE_URL=postgresql+asyncpg://admin:...@localhost:5433/ghost_board"
    exit 1
fi
REMOTE

    log ".env present on VPS."
}

# ---------------------------------------------------------------------------
# 4. Create / update systemd service
# ---------------------------------------------------------------------------

setup_systemd() {
    log "Configuring systemd service: ${SERVICE_NAME} ..."

    ${SSH_CMD} ${VPS_USER}@${VPS_HOST} << REMOTE
cat > /etc/systemd/system/${SERVICE_NAME}.service << 'EOF'
[Unit]
Description=Ghost Board API Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/ghost-board
ExecStart=/opt/ghost-board/.venv/bin/uvicorn server.app:app --host ${BIND_HOST} --port ${BIND_PORT} --workers 2
Restart=always
RestartSec=5
EnvironmentFile=/opt/ghost-board/.env
Environment="PATH=/opt/ghost-board/.venv/bin:/usr/local/bin:/usr/bin:/bin"

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=ghost-board

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ${SERVICE_NAME}
systemctl restart ${SERVICE_NAME}

# Wait a moment and verify it started
sleep 2
if systemctl is-active --quiet ${SERVICE_NAME}; then
    echo "[OK] ${SERVICE_NAME} is running."
else
    echo "[FAIL] ${SERVICE_NAME} failed to start. Check: journalctl -u ${SERVICE_NAME} -n 50"
    exit 1
fi
REMOTE

    log "systemd service configured and running."
}

# ---------------------------------------------------------------------------
# 5. Setup nginx reverse proxy
# ---------------------------------------------------------------------------

setup_nginx() {
    log "Configuring nginx reverse proxy..."

    ${SSH_CMD} ${VPS_USER}@${VPS_HOST} << 'REMOTE'
set -e

# Install nginx if missing
if ! command -v nginx &>/dev/null; then
    apt-get update -qq && apt-get install -y -qq nginx
fi

cat > /etc/nginx/sites-available/ghost-board << 'NGINX_CONF'
server {
    listen 80;
    server_name _;

    # Max upload size for concept submissions
    client_max_body_size 10M;

    # Static dashboard files (React build)
    location /dashboard/ {
        alias /opt/ghost-board/dashboard-react/dist/;
        try_files $uri $uri/ /dashboard/index.html;
    }

    # Static legacy dashboard
    location /dashboard-legacy/ {
        alias /opt/ghost-board/dashboard/;
        try_files $uri $uri/ =404;
    }

    # Output artifacts
    location /outputs/ {
        alias /opt/ghost-board/outputs/;
        autoindex on;
        add_header Access-Control-Allow-Origin *;
    }

    # WebSocket endpoint
    location /ws/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }

    # API and everything else -> FastAPI
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
NGINX_CONF

# Enable site, remove default if it conflicts
ln -sf /etc/nginx/sites-available/ghost-board /etc/nginx/sites-enabled/ghost-board
rm -f /etc/nginx/sites-enabled/default

# Test and reload
nginx -t
systemctl enable nginx
systemctl reload nginx

echo "[OK] nginx configured and reloaded."
REMOTE

    log "nginx reverse proxy configured."
}

# ---------------------------------------------------------------------------
# 6. Create outputs directory + database
# ---------------------------------------------------------------------------

setup_dirs() {
    log "Ensuring output directories exist on VPS..."

    ${SSH_CMD} ${VPS_USER}@${VPS_HOST} << 'REMOTE'
mkdir -p /opt/ghost-board/outputs/{prototype,financial_model,gtm,compliance}
REMOTE

    log "Directories ready."
}

# ---------------------------------------------------------------------------
# Helper commands
# ---------------------------------------------------------------------------

show_status() {
    log "Service status on VPS:"
    ${SSH_CMD} ${VPS_USER}@${VPS_HOST} << 'REMOTE'
echo "--- ghost-board service ---"
systemctl status ghost-board --no-pager -l 2>/dev/null || echo "Service not found."
echo ""
echo "--- nginx ---"
systemctl status nginx --no-pager -l 2>/dev/null || echo "nginx not found."
echo ""
echo "--- Port check ---"
ss -tlnp | grep -E ':(8000|80|443)\s' || echo "No relevant ports listening."
REMOTE
}

show_logs() {
    log "Tailing ghost-board logs (Ctrl+C to stop)..."
    ${SSH_CMD} ${VPS_USER}@${VPS_HOST} "journalctl -u ghost-board -f --no-pager"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

CMD="${1:-deploy}"

case "${CMD}" in
    deploy)
        echo ""
        echo -e "${CYAN}=== Ghost Board VPS Deployment ===${NC}"
        echo ""
        preflight
        sync_code
        install_deps
        check_env
        setup_dirs
        setup_systemd
        setup_nginx
        echo ""
        log "Deployment complete!"
        echo ""
        echo -e "  API Server:  ${CYAN}http://${VPS_HOST}:8000${NC}"
        echo -e "  Dashboard:   ${CYAN}http://${VPS_HOST}/dashboard/${NC}"
        echo -e "  API Docs:    ${CYAN}http://${VPS_HOST}/docs${NC}"
        echo ""
        ;;
    sync)
        preflight
        sync_code
        ;;
    restart)
        ${SSH_CMD} ${VPS_USER}@${VPS_HOST} "systemctl restart ghost-board && echo 'Restarted.'"
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs
        ;;
    *)
        echo "Usage: $0 {deploy|sync|restart|status|logs}"
        exit 1
        ;;
esac
