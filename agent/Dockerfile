# Agent Proof-of-Intelligence - Python Agent
# Autonomous AI agent that proves its identity on Solana

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

# Expose API port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:8000/health')" || exit 1

# Run the agent (Render provides PORT env var)
CMD python main.py --host 0.0.0.0 --port ${PORT:-8000}
