# Agent Proof-of-Intelligence - Python Agent
# Autonomous AI agent that proves its identity on Solana
# Supports single-agent (main.py) or multi-agent (multi_main.py) mode

FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Environment variables (override in deployment)
ENV SOLANA_RPC_URL=https://api.devnet.solana.com
ENV PROGRAM_ID=EQ2Zv3cTDBzY1PafPz2WDoup6niUv6X8t9id4PBACL38
ENV AGENT_NAME="PoI Demo Agent"
ENV AGENT_CAPABILITIES="challenge-response,slm-evaluation,cross-agent-discovery"
ENV API_HOST=0.0.0.0
ENV API_PORT=8000

# Multi-agent mode: set MULTI_AGENT=true to run 3 agents in one process
ENV MULTI_AGENT=false

# Expose API port (Render uses PORT env var, default 10000)
EXPOSE 8000 10000

# Health check - works for both modes
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD python -c "import os, httpx; port=os.getenv('PORT', os.getenv('API_PORT','8000')); httpx.get(f'http://localhost:{port}/health')" || exit 1

# Entrypoint script: choose single or multi-agent mode
CMD if [ "$MULTI_AGENT" = "true" ]; then \
        echo "Starting MULTI-AGENT mode (Alpha, Beta, Gamma on single port)"; \
        python multi_main.py --host 0.0.0.0 --port ${PORT:-10000}; \
    else \
        echo "Starting SINGLE-AGENT mode"; \
        python main.py --host 0.0.0.0 --port ${PORT:-8000}; \
    fi
