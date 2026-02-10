# Agent Proof-of-Intelligence - Claude Code Instructions

## Project Overview

**Colosseum Agent Hackathon Submission** - On-chain AI agent identity verification with challenge-response system and SLM evaluation benchmarks on Solana.

**Deadline**: Feb 12, 2026
**Prize Target**: $50K (1st) or $5K (Most Agentic)

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                 AGENT PROOF-OF-INTELLIGENCE                    │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ANCHOR PROGRAM (Devnet)                                       │
│  Program ID: EQ2Zv3cTDBzY1PafPz2WDoup6niUv6X8t9id4PBACL38     │
│  ├─ AgentRegistry: store agent identity + model hash           │
│  ├─ Challenge: verification questions with expiration          │
│  ├─ Reputation: on-chain score based on challenge success      │
│  └─ AuditLog: SentinelAgent security layer                     │
│                                                                │
│  PYTHON AGENT (FastAPI)                                        │
│  ├─ Autonomous challenge polling                               │
│  ├─ Cross-agent discovery and challenge creation               │
│  ├─ SLM evaluation benchmarks (DeFi, Solana, Security)         │
│  └─ A2A Protocol compliant API                                 │
│                                                                │
│  NEXT.JS DASHBOARD                                             │
│  ├─ Wallet connection (Phantom, Solflare)                      │
│  ├─ Agent registration with model hash                         │
│  ├─ WebSocket live events feed                                 │
│  └─ Reputation leaderboard                                     │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
agent-poi/
├── programs/agent-registry/    # Anchor Solana program
│   └── src/
│       ├── lib.rs              # Program entry point
│       ├── instructions/       # Program instructions
│       ├── state/              # Account structures
│       └── errors.rs           # Custom errors
├── agent/                      # Python FastAPI agent
│   ├── main.py                 # Agent entry point
│   ├── config.py               # Configuration
│   ├── poi/                    # Challenge handler, evaluator
│   ├── solana_client/          # Solana RPC client (renamed from solana/)
│   └── wallets/                # Agent keypairs (gitignored)
├── app/                        # Next.js dashboard
│   └── src/
│       ├── app/                # Pages and API routes
│       ├── components/         # UI components
│       ├── hooks/              # React hooks (useSolanaEvents)
│       ├── lib/                # Utilities (program.ts)
│       └── providers/          # Wallet provider
└── scripts/                    # Utility scripts
    └── local-demo.sh           # Full local demo setup
```

## Key Files

| File | Purpose |
|------|---------|
| `programs/agent-registry/src/lib.rs` | Main program with all instructions |
| `agent/main.py` | Python agent with autonomous behaviors |
| `app/src/app/page.tsx` | Dashboard homepage |
| `app/src/hooks/useSolanaEvents.ts` | WebSocket subscription hook |
| `app/public/skill.json` | A2A Protocol discovery endpoint |

## CRITICAL: Python Virtual Environment

**ALWAYS use the venv when running Python agent code:**
```bash
cd agent
source venv/bin/activate
# Then run any python command
```

If the venv doesn't exist, create it first:
```bash
cd agent
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

**Never run agent Python code with system Python - always activate venv first.**

## Development Commands

### Build & Deploy Solana Program
```bash
cd programs/agent-registry
anchor build
anchor deploy --provider.cluster devnet
```

### Run Python Agent (Single)
```bash
cd agent
source venv/bin/activate
WALLET_PATH=wallets/alpha.json AGENT_NAME=PoI-Alpha python main.py --port 8001
```

### Run Python Agent (Multi - Preferred)
```bash
cd agent
source venv/bin/activate
ANTHROPIC_API_KEY=<key> python multi_main.py
# Runs all 3 agents on port 10000: /alpha, /beta, /gamma
```

### Run Next.js Dashboard
```bash
cd app
npm run dev   # http://localhost:3000
npm run build # Production build
```

### Full Local Demo
```bash
./scripts/local-demo.sh
```

## Testing

### API Endpoints (Python Agent)
```bash
curl http://localhost:8000/health
curl http://localhost:8000/status
curl http://localhost:8000/activity
curl http://localhost:8000/evaluate/domains
curl -X POST http://localhost:8000/challenge -H "Content-Type: application/json" \
  -d '{"question":"What blockchain?","expected_hash":"test","challenger":"PUBKEY"}'
```

### On-Chain Testing
- Use Solana Explorer: https://explorer.solana.com/?cluster=devnet
- Program ID: EQ2Zv3cTDBzY1PafPz2WDoup6niUv6X8t9id4PBACL38

## Credentials

See `CREDENTIALS.md` (gitignored) for:
- Wallet public/private keys
- SOL balances
- Environment variables

**Default wallet with SOL**: `~/.config/solana/id.json`

## Known Issues

1. **IDL Parsing** (FIXED): AnchorPy doesn't support Anchor 0.30+ IDL format natively.
   - **Solution**: Use `agent/scripts/convert_idl.py` to convert IDL to legacy format
   - The legacy IDL is stored at `agent/idl/agent_registry_legacy.json`
   - Regenerate after program changes: `cd agent && python scripts/convert_idl.py idl/agent_registry.json idl/agent_registry_legacy.json`

2. **Devnet Airdrop Rate Limits**: Use web faucets if CLI airdrop fails:
   - https://faucet.solana.com/
   - https://faucet.quicknode.com/solana/devnet

3. **Port Conflicts**: Kill existing processes before starting:
   ```bash
   lsof -ti:8000 | xargs kill -9
   lsof -ti:3000 | xargs kill -9
   ```

## Hackathon Judging Criteria

Focus on demonstrating:

1. **Agentic Behavior** (Most Agentic Prize)
   - Autonomous challenge polling and response
   - Cross-agent discovery and challenge creation
   - Self-evaluation benchmarks
   - Activity logging with cryptographic proofs

2. **Solana Integration**
   - On-chain agent registry
   - Challenge-response with reputation
   - PDA-based account structure
   - WebSocket subscription to program events

3. **A2A Protocol Compliance**
   - skill.json discovery endpoint
   - Documented API endpoints
   - Cross-agent communication

## DO NOT

- ❌ Commit wallet private keys
- ❌ Hardcode RPC URLs (use env vars)
- ❌ Skip error handling in on-chain operations
- ❌ Use mainnet without explicit confirmation
- ❌ Modify the deployed program ID

## Deployment

### Dashboard (Vercel)
- Auto-deploys on git push to main
- URL: https://agent-poi.vercel.app

### Python Agents (Render - Multi-Agent)
- Alpha (DeFi): https://agent-poi-alpha.onrender.com
- Beta (Security): https://agent-poi-beta.onrender.com
- Gamma (Solana): https://agent-poi-gamma.onrender.com
- Each agent has A2A peers configured, they challenge each other autonomously

### Local Multi-Agent Demo
```bash
./scripts/generate-agent-wallets.sh  # Generate 3 wallets
docker compose -f docker-compose.multi-agent.yml up --build
# Alpha: localhost:8001, Beta: localhost:8002, Gamma: localhost:8003
```

## Quick Reference

| Resource | URL/Value |
|----------|-----------|
| Dashboard | https://agent-poi.vercel.app |
| skill.json | https://agent-poi.vercel.app/skill.json |
| Program ID | EQ2Zv3cTDBzY1PafPz2WDoup6niUv6X8t9id4PBACL38 |
| GitHub | https://github.com/vitamin33/agent-poi |
| Solana Explorer | https://explorer.solana.com/address/EQ2Zv3cTDBzY1PafPz2WDoup6niUv6X8t9id4PBACL38?cluster=devnet |
