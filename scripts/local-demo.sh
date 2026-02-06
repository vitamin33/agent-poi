#!/bin/bash
# =============================================================================
# Agent Proof-of-Intelligence - Local Demo Setup
# =============================================================================
# This script sets up a full local demo environment with:
# - Next.js frontend dashboard
# - Multiple Python agents that communicate with each other
# - Automatic SOL airdrop for devnet testing
# =============================================================================

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENT_DIR="$PROJECT_ROOT/agent"
APP_DIR="$PROJECT_ROOT/app"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log() { echo -e "${GREEN}[DEMO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }
info() { echo -e "${CYAN}[INFO]${NC} $1"; }

# Cleanup function
cleanup() {
    log "Cleaning up..."
    # Kill all background processes
    jobs -p | xargs -r kill 2>/dev/null || true
    rm -f /tmp/agent*.pid
    log "Done!"
}

trap cleanup EXIT

# =============================================================================
# Check Prerequisites
# =============================================================================
check_prerequisites() {
    log "Checking prerequisites..."

    # Check Node.js
    if ! command -v node &> /dev/null; then
        error "Node.js is required but not installed"
        exit 1
    fi
    info "Node.js: $(node -v)"

    # Check Python
    if ! command -v python3 &> /dev/null; then
        error "Python 3 is required but not installed"
        exit 1
    fi
    info "Python: $(python3 --version)"

    # Check Solana CLI
    if ! command -v solana &> /dev/null; then
        error "Solana CLI is required but not installed"
        exit 1
    fi
    info "Solana: $(solana --version | head -1)"

    # Set to devnet
    solana config set --url devnet &> /dev/null
    info "Network: devnet"

    log "Prerequisites OK!"
}

# =============================================================================
# Setup Wallets and Airdrop
# =============================================================================
setup_wallets() {
    log "Setting up agent wallets..."

    WALLETS_DIR="$AGENT_DIR/wallets"
    mkdir -p "$WALLETS_DIR"

    # Create wallets if they don't exist
    for i in 1 2 3; do
        WALLET="$WALLETS_DIR/agent$i.json"
        if [ ! -f "$WALLET" ]; then
            log "Creating wallet for Agent $i..."
            solana-keygen new --outfile "$WALLET" --no-bip39-passphrase --force &> /dev/null
        fi

        PUBKEY=$(solana-keygen pubkey "$WALLET")
        info "Agent $i wallet: $PUBKEY"

        # Check balance and airdrop if needed
        BALANCE=$(solana balance "$PUBKEY" 2>/dev/null | grep -oE '[0-9.]+' | head -1 || echo "0")
        if (( $(echo "$BALANCE < 1" | bc -l) )); then
            log "Airdropping SOL to Agent $i..."
            solana airdrop 2 "$PUBKEY" &> /dev/null || warn "Airdrop failed (rate limit?)"
            sleep 2  # Avoid rate limiting
        else
            info "Agent $i balance: $BALANCE SOL"
        fi
    done

    log "Wallets ready!"
}

# =============================================================================
# Start Frontend
# =============================================================================
start_frontend() {
    log "Starting Next.js frontend..."

    cd "$APP_DIR"

    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        log "Installing frontend dependencies..."
        npm install &> /dev/null
    fi

    # Start dev server in background
    npm run dev &> /tmp/frontend.log &
    echo $! > /tmp/frontend.pid

    # Wait for it to start
    log "Waiting for frontend to start..."
    for i in {1..30}; do
        if curl -s http://localhost:3000 > /dev/null 2>&1; then
            info "Frontend running at http://localhost:3000"
            return 0
        fi
        sleep 1
    done

    error "Frontend failed to start. Check /tmp/frontend.log"
    return 1
}

# =============================================================================
# Start Agent
# =============================================================================
start_agent() {
    local agent_num=$1
    local port=$((8000 + agent_num - 1))
    local wallet="$AGENT_DIR/wallets/agent$agent_num.json"
    local name="DemoAgent$agent_num"

    log "Starting Agent $agent_num ($name) on port $port..."

    cd "$AGENT_DIR"

    # Activate virtual environment
    if [ ! -d "venv" ]; then
        log "Creating Python virtual environment..."
        python3 -m venv venv
        source venv/bin/activate
        pip install -q -r requirements.txt
    else
        source venv/bin/activate
    fi

    # Start agent with environment variables
    AGENT_NAME="$name" \
    WALLET_PATH="$wallet" \
    API_PORT="$port" \
    ENABLE_CROSS_AGENT_CHALLENGES=true \
    CROSS_AGENT_CHALLENGE_INTERVAL=60 \
    python main.py --port "$port" &> "/tmp/agent$agent_num.log" &

    echo $! > "/tmp/agent$agent_num.pid"

    # Wait for it to start
    for i in {1..20}; do
        if curl -s "http://localhost:$port/health" > /dev/null 2>&1; then
            info "Agent $agent_num running at http://localhost:$port"
            return 0
        fi
        sleep 1
    done

    warn "Agent $agent_num may have failed to start. Check /tmp/agent$agent_num.log"
    return 1
}

# =============================================================================
# Show Status
# =============================================================================
show_status() {
    echo ""
    echo "============================================================"
    echo -e "${GREEN}  AGENT PROOF-OF-INTELLIGENCE - LOCAL DEMO${NC}"
    echo "============================================================"
    echo ""
    echo -e "${CYAN}Frontend Dashboard:${NC}"
    echo "  → http://localhost:3000"
    echo ""
    echo -e "${CYAN}Agent API Endpoints:${NC}"
    echo "  → Agent 1: http://localhost:8000"
    echo "  → Agent 2: http://localhost:8001"
    echo "  → Agent 3: http://localhost:8002"
    echo ""
    echo -e "${CYAN}Useful URLs:${NC}"
    echo "  → Health Check: http://localhost:8000/health"
    echo "  → Agent Status: http://localhost:8000/status"
    echo "  → Activity Log: http://localhost:8000/activity"
    echo "  → Cross-Agent: http://localhost:8000/cross-agent-challenges"
    echo "  → Evaluations: http://localhost:8000/evaluations"
    echo ""
    echo -e "${CYAN}View Logs:${NC}"
    echo "  → tail -f /tmp/frontend.log"
    echo "  → tail -f /tmp/agent1.log"
    echo "  → tail -f /tmp/agent2.log"
    echo "  → tail -f /tmp/agent3.log"
    echo ""
    echo "============================================================"
    echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
    echo "============================================================"
    echo ""
}

# =============================================================================
# Main
# =============================================================================
main() {
    echo ""
    log "Starting Agent Proof-of-Intelligence Demo..."
    echo ""

    check_prerequisites
    setup_wallets

    # Start services
    start_frontend

    # Start multiple agents
    start_agent 1
    sleep 2
    start_agent 2
    sleep 2
    start_agent 3

    # Show status
    show_status

    # Wait for interrupt
    while true; do
        sleep 10

        # Check if services are still running
        for pid_file in /tmp/frontend.pid /tmp/agent1.pid /tmp/agent2.pid /tmp/agent3.pid; do
            if [ -f "$pid_file" ]; then
                pid=$(cat "$pid_file")
                if ! kill -0 "$pid" 2>/dev/null; then
                    warn "Process $(basename $pid_file .pid) died"
                fi
            fi
        done
    done
}

# Run
main "$@"
