# Agent Proof-of-Intelligence - Python Agent
# Autonomous AI agent that proves its identity on Solana
# Supports single-agent (main.py) or multi-agent (multi_main.py) mode

FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install core deps first (fast, no backtracking)
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Install agentipy WITHOUT transitive deps (avoids 10+ min pip backtracking)
# Our requirements.txt already provides the deps we actually use
RUN pip install --no-cache-dir --no-deps agentipy>=2.1.0

# Copy application code
COPY . .

# Environment variables (override in deployment)
ENV SOLANA_RPC_URL=https://thrumming-thrumming-pond.solana-devnet.quiknode.pro/d5b2a7acac061e59f4e38a8d69ec8740a8da3f47/
ENV PROGRAM_ID=EQ2Zv3cTDBzY1PafPz2WDoup6niUv6X8t9id4PBACL38
ENV AGENT_NAME="PoI Demo Agent"
ENV AGENT_CAPABILITIES="challenge-response,slm-evaluation,cross-agent-discovery"
ENV API_HOST=0.0.0.0
ENV API_PORT=8000

# Multi-agent mode: set MULTI_AGENT=true to run 3 agents in one process
ENV MULTI_AGENT=false

# Expose API port (Render uses PORT env var, default 10000)
EXPOSE 8000 10000

# Render handles health checks via healthCheckPath; no Docker HEALTHCHECK needed
# (Docker HEALTHCHECK restarts container when sync LLM calls block event loop)

# Entrypoint script: choose single or multi-agent mode
CMD if [ "$MULTI_AGENT" = "true" ]; then \
        echo "Starting MULTI-AGENT mode (Alpha, Beta, Gamma on single port)"; \
        python multi_main.py --host 0.0.0.0 --port ${PORT:-10000}; \
    else \
        echo "Starting SINGLE-AGENT mode"; \
        python main.py --host 0.0.0.0 --port ${PORT:-8000}; \
    fi
