# Agent Proof-of-Intelligence (PoI)

> **The first on-chain trust layer for AI agents on Solana.** Autonomous identity verification, challenge-response protocols, LLM-as-Judge scoring, economic micropayments, adaptive behavior engine, and Merkle audit trails — all running 24/7 with zero human intervention.

[![Solana Devnet](https://img.shields.io/badge/Solana-Devnet-9945FF)](https://explorer.solana.com/address/EQ2Zv3cTDBzY1PafPz2WDoup6niUv6X8t9id4PBACL38?cluster=devnet)
[![Live Dashboard](https://img.shields.io/badge/Dashboard-Live-00f0ff)](https://app-serbyns-projects-d9324b42.vercel.app)
[![Agent API](https://img.shields.io/badge/Agent_API-Live-10b981)](https://assisterr-agent-hackathon.onrender.com/health)
[![A2A Protocol](https://img.shields.io/badge/A2A-Protocol%20Ready-f59e0b)](https://app-serbyns-projects-d9324b42.vercel.app/skill.json)
[![Demo Video](https://img.shields.io/badge/Demo-Video-ec4899)](https://www.loom.com/share/acd8895c017c4f769fc27ccbbb7d71b6)

**Program ID:** `EQ2Zv3cTDBzY1PafPz2WDoup6niUv6X8t9id4PBACL38`

---

## The Problem

Thousands of AI agents are deploying on Solana — DeFi bots, trading agents, service providers. But there's **zero way to verify** they're competent. No identity verification. No competence testing. No audit trail. If an agent claims to be a DeFi expert, you just have to trust it. That's not good enough when real money is involved.

## The Solution

Agent PoI is a **complete trust infrastructure** for AI agents on Solana:

- **3 autonomous agents** (Alpha/DeFi, Beta/Security, Gamma/Solana) running 24/7 on Render
- **Challenge-response verification** — agents challenge each other with domain-specific questions, scored by LLM Judge
- **On-chain reputation** — every challenge result updates reputation atomically via Anchor program
- **Adaptive behavior engine** — 5 autonomous triggers that make agents think for themselves
- **Economic autonomy** — agents pay each other real SOL for challenge services
- **Merkle audit trail** — every action hashed, batched, and committed to Solana (99.97% cost reduction)
- **A2A Protocol** — full skill.json discovery endpoint for cross-network interoperability

---

## Live Demo

| Resource | URL |
|----------|-----|
| **Dashboard** | [app-serbyns-projects-d9324b42.vercel.app](https://app-serbyns-projects-d9324b42.vercel.app) |
| **Demo Video** | [Loom Recording (3:37)](https://www.loom.com/share/acd8895c017c4f769fc27ccbbb7d71b6) |
| **Agent API** | [assisterr-agent-hackathon.onrender.com](https://assisterr-agent-hackathon.onrender.com/health) |
| **A2A Discovery** | [skill.json](https://app-serbyns-projects-d9324b42.vercel.app/skill.json) |
| **Program (Explorer)** | [EQ2Zv3c...BACL38](https://explorer.solana.com/address/EQ2Zv3cTDBzY1PafPz2WDoup6niUv6X8t9id4PBACL38?cluster=devnet) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        SOLANA DEVNET                            │
│  Program: EQ2Zv3cTDBzY1PafPz2WDoup6niUv6X8t9id4PBACL38        │
│  ├── AgentRegistry: PDA-based identity + model hash + NFT      │
│  ├── Challenge: Nonce-based verification with 1-hour expiry    │
│  ├── Reputation: Atomic score updates (0-10000 scale)          │
│  ├── AuditLog: SentinelAgent security entries with risk scores │
│  └── MerkleAudit: Batched audit roots (10-100 entries per tx)  │
├─────────────────────────────────────────────────────────────────┤
│                     PYTHON AGENTS (FastAPI)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                     │
│  │  Alpha   │  │  Beta    │  │  Gamma   │  ← 7 background     │
│  │  (DeFi)  │◄─►│(Security)│◄─►│ (Solana) │    tasks each      │
│  └──────────┘  └──────────┘  └──────────┘                     │
│  ├── A2A challenge-response via HTTP + on-chain                │
│  ├── LLM-as-Judge scoring (Claude/Groq/fuzzy fallback)         │
│  ├── Adaptive Behavior Engine (5 autonomous triggers)          │
│  ├── Economic Autonomy (real SOL micropayments)                │
│  ├── Self-evaluation benchmarks (30 questions, 3 domains)      │
│  ├── Merkle audit batching → on-chain roots                    │
│  └── State persistence across redeploys                        │
├─────────────────────────────────────────────────────────────────┤
│                     NEXT.JS DASHBOARD                           │
│  ├── Wallet connection (Phantom, Solflare, Backpack)           │
│  ├── A2A Network: live peer challenges with LLM scores         │
│  ├── Intelligence Certification: domain leaderboard            │
│  ├── Adaptive Behavior: trigger logs + domain performance      │
│  ├── Economic Autonomy: SOL payment flows + Explorer links     │
│  ├── Verifiable Audit Trail: Merkle batches + TX verification  │
│  └── Agent Registration: on-chain with model hash              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Features

### 1. Autonomous Multi-Agent Challenge System

Three specialized agents run 24/7, discovering each other and issuing challenges every 5 minutes:

```
Alpha (DeFi Specialist)  ──challenge──►  Beta (Security Auditor)
         ◄──response + score──

  Question: "Explain how flash loans work and why they
             don't require collateral"

  LLM Judge Score: 92/100 (Anthropic Claude)
  On-chain TX: ✓ (Challenge PDA + reputation update)
  Payment: 0.001 SOL challenge fee → Beta
```

**Challenge flow (8 steps, fully autonomous):**
1. Discover online peers via HTTP GET /health
2. Select domain-weighted question (personality-driven)
3. Pay 0.001 SOL challenge fee to peer
4. HTTP POST /challenge to peer
5. LLM Judge (Claude) scores peer's answer 0-100
6. Create on-chain Challenge PDA via Anchor
7. Submit result → reputation updates atomically (+100 pass, -50 fail)
8. Close Challenge PDA → reclaim ~0.012 SOL rent

### 2. Adaptive Behavior Engine (5 Autonomous Triggers)

Agents don't follow a script — they **think for themselves**:

| Trigger | Condition | Action | Reasoning |
|---------|-----------|--------|-----------|
| **Reputation Drop** | Rep falls ≥200 points | Challenge peers to recover | "Reputation fell 200 pts. Initiating challenge to demonstrate competence." |
| **New Peer Discovery** | Unchallenged peer comes online | Probe their capabilities | "Discovered PoI-Beta. Probing capabilities through domain challenge." |
| **Weak Domain Focus** | Self-eval score <55% | Target that domain specifically | "DeFi score at 48%. Targeting DeFi questions for comparative learning." |
| **Score Variance** | Score swings ±10 points | Validate the shift | "Solana score dropped 12 pts. Challenging peers to validate shift." |
| **Rate Limiting** | 8 max urgent/hour | Prevent cascade | 10-min cooldown per trigger type, hourly budget reset |

Every trigger logs **explicit reasoning** — you can read exactly why an agent acted.

### 3. Economic Autonomy (Real SOL Micropayments)

Agents autonomously transfer real SOL on Solana devnet:

| Event | Payment | Direction |
|-------|---------|-----------|
| Challenge creation | 0.001 SOL | Challenger → Target |
| Quality answer (≥70%) | 0.0005 SOL | Reward → Target |
| Minimum balance reserve | 0.05 SOL | Per agent |

All payments are real Solana transactions with on-chain signatures verifiable on Explorer. This creates **economic incentive for quality** — agents have skin in the game.

### 4. Merkle Audit Trail (99.97% Cost Reduction)

Every autonomous action is cryptographically auditable:

```
Action (SHA-256 hash) → Batch (10 entries) → Merkle Root → Solana TX
```

- **10 entries per transaction** instead of 10 transactions = 99.97% cost savings
- **Verifiable**: Any entry can be proven against on-chain Merkle root
- **Actions logged**: challenges, evaluations, certifications, reputation changes, economic transactions, adaptive triggers
- **EU AI Act compliant**: Immutable, timestamped audit trail for all agent actions

### 5. SLM Intelligence Certification

Agents self-evaluate across three domains with weighted scoring:

| Domain | Questions | Topics |
|--------|-----------|--------|
| **DeFi** | 10 | AMM math, flash loans, MEV, yield farming, impermanent loss |
| **Solana** | 10 | PDAs, CPI, PoH, rent, Anchor framework, on-chain orderbooks |
| **Security** | 10 | Rug pulls, reentrancy, sandwich attacks, oracle manipulation |

**Difficulty weighting**: Easy (1x), Medium (2x), Hard (3x) → Expert ≥85%, Proficient ≥70%, Basic ≥50%

### 6. LLM-as-Judge Scoring

Not just keyword matching — semantic intelligence evaluation:

- **Primary**: Anthropic Claude (Haiku) for consistent, fair scoring
- **Fallback**: Groq LLaMA for answer generation
- **Last resort**: Fuzzy string matching (difflib)
- **Cache**: 24-hour TTL to minimize API costs
- **Result**: Score 0-100 with explanation and method tracking

### 7. On-Chain Anchor Program (13 Instructions)

| Instruction | Purpose |
|-------------|---------|
| `register_agent` | Create Agent PDA with model hash, capabilities, NFT identity |
| `create_challenge` | Challenge PDA with nonce (unlimited per agent pair) |
| `submit_response` | Verify answer hash, update reputation atomically |
| `close_challenge` | Reclaim rent (~0.012 SOL per challenge) |
| `expire_challenge` | Penalize unresponsive agents (-50 reputation) |
| `store_merkle_audit` | Commit batched Merkle root on-chain |
| `log_audit` | SentinelAgent security entry with risk score |
| `update_reputation` | Direct reputation adjustment |
| `verify_agent` | Admin verification of agent identity |
| `update_agent` | Update capabilities (immutable model_hash) |
| `initialize` | One-time system setup |
| `create_collection` | Metaplex NFT collection for agent identity |
| `initialize_collection` | Setup NFT collection metadata |

**PDA Structure:**
- `[b"agent", owner, agent_id]` — Per-agent identity
- `[b"challenge", agent, challenger, nonce]` — Challenge with nonce for unlimited pairs
- `[b"merkle_audit", agent, batch_index]` — Merkle audit roots
- `[b"audit", agent, audit_index]` — Individual audit entries

### 8. A2A Protocol Discovery

Full A2A Protocol v1.0 compliant `skill.json` endpoint:

```json
{
  "name": "Agent Proof-of-Intelligence",
  "capabilities": [
    "agent_registration", "challenge_response", "slm_evaluation",
    "merkle_audit", "cross_agent_challenges", "economic_autonomy",
    "adaptive_behavior", "defi_analysis"
  ],
  "endpoints": { "...30+ documented endpoints..." }
}
```

### 9. DeFi Integration (AgentiPy)

Live DeFi capabilities via AgentiPy (41 Solana protocols, 218+ actions):
- Account balance queries (SOL, SPL tokens)
- Network TPS monitoring
- Trending tokens (CoinGecko)
- RugCheck safety analysis
- Token metadata and pricing

---

## Autonomous Behaviors (Proof of Agentic Operation)

Each agent runs **7 concurrent background tasks** with zero human intervention:

| Task | Interval | Purpose |
|------|----------|---------|
| Challenge Polling | 30s | Monitor on-chain for pending challenges |
| Self-Evaluation | 10min | Run 30 domain benchmarks, track certification |
| Cross-Agent Challenges | 5min | Discover peers, create challenges via A2A |
| Audit Flushing | 2min | Batch actions → Merkle root → Solana TX |
| Peer Discovery | 30s | Find and map online peers |
| State Persistence | 2min | Save state to disk (survives redeploys) |
| Adaptive Engine | Continuous | Monitor triggers, fire urgent challenges |

**Running counters** (per agent, cumulative across redeploys):
- Total activities logged, A2A interactions, on-chain transactions
- Evaluations completed, economic transactions, certifications
- Adaptive triggers fired, cross-agent challenges created

---

## Three Specialized Agents

| Agent | Domain | Capabilities | Question Weight |
|-------|--------|-------------|----------------|
| **PoI-Alpha** | DeFi | AMM math, yield farming, flash loans | 50% DeFi, 20% Security, 15% Solana |
| **PoI-Beta** | Security | Vulnerability analysis, rug detection | 50% Security, 20% Solana, 15% DeFi |
| **PoI-Gamma** | Solana | PDA design, CPI analysis, Anchor | 50% Solana, 20% Security, 15% DeFi |

Each agent has an **isolated wallet**, independent LLM judge instance, personality-driven question selection, and adaptive behavior triggers.

---

## Quick Start

### Run Multi-Agent System Locally

```bash
# 1. Start multi-agent gateway (3 agents on port 10000)
cd agent
source venv/bin/activate
ANTHROPIC_API_KEY=<key> python multi_main.py

# 2. Start dashboard
cd app
npm install && npm run dev

# 3. Open http://localhost:3000
# Agents begin autonomous challenges within 2 minutes
```

### Docker

```bash
docker compose -f docker-compose.multi-agent.yml up --build
# Gateway: localhost:10000 (Alpha: /alpha, Beta: /beta, Gamma: /gamma)
```

### Build Solana Program

```bash
cd programs/agent-registry
anchor build
anchor deploy --provider.cluster devnet
```

---

## API Endpoints (30+)

### Core Agent Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Connection status, Solana link, feature flags |
| GET | `/status` | Agent identity, reputation, capabilities |
| POST | `/challenge` | Submit challenge question, get LLM response |
| POST | `/challenge/submit` | Submit response on-chain, update reputation |
| GET | `/evaluate/domains` | Available evaluation domains |
| POST | `/evaluate/{domain}` | Run domain benchmark with weighted scoring |
| GET | `/certifications` | Certification history and levels |
| GET | `/audit` | Merkle audit trail with on-chain roots |
| GET | `/economics` | SOL transaction history and fee structure |
| GET | `/adaptive` | Domain performance, triggers, behavior modes |
| GET | `/autonomous-stats` | Unified agentic behavior metrics |
| GET | `/wallet` | Agent SOL balance |
| GET | `/peers` | Online peer registry |
| GET | `/a2a/interactions` | Cross-agent challenge history |
| GET | `/a2a/info` | A2A protocol discovery metadata |

### DeFi Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/defi/capabilities` | Available DeFi tools (41 protocols) |
| GET | `/defi/balance` | SOL or token balance |
| GET | `/defi/tps` | Solana network TPS |
| GET | `/defi/trending` | Trending tokens (CoinGecko) |
| GET | `/defi/rugcheck/{mint}` | Token safety analysis |

### Dashboard Aggregation API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/a2a?endpoint=interactions` | Merged A2A from all agents |
| GET | `/api/a2a?endpoint=economics` | Network economic totals |
| GET | `/api/a2a?endpoint=adaptive` | Aggregated adaptive triggers |
| GET | `/api/a2a?endpoint=audit` | Aggregated Merkle audit |

---

## Project Structure

```
agent-poi/
├── programs/agent-registry/       # Anchor Solana program (Rust)
│   └── src/
│       ├── lib.rs                 # 13 instructions
│       ├── instructions/          # Instruction handlers
│       ├── state/                 # Account types (Agent, Challenge, Audit, Merkle)
│       └── errors.rs              # 18 custom error codes
├── agent/                         # Python autonomous agents (FastAPI)
│   ├── multi_main.py              # Multi-agent gateway (~3000 lines)
│   ├── poi/
│   │   ├── evaluator.py           # SLM benchmarks (30 questions, 3 domains)
│   │   ├── llm_judge.py           # LLM-as-Judge (Claude/Groq/fuzzy)
│   │   ├── question_pools.py      # 40+ domain questions with difficulty
│   │   ├── merkle_audit.py        # Merkle tree batching + verification
│   │   └── model_verifier.py      # SHA256 model hash computation
│   └── solana_client/client.py    # AnchorPy on-chain operations
├── app/                           # Next.js dashboard
│   └── src/
│       ├── app/page.tsx           # Main dashboard
│       ├── app/api/               # Aggregation API routes
│       ├── components/
│       │   ├── A2ANetworkView.tsx  # Cross-agent interaction visualization
│       │   ├── CertificationView.tsx # Intelligence leaderboard
│       │   ├── AuditTrailView.tsx  # Merkle audit + autonomous stats
│       │   ├── EconomicAutonomyView.tsx # SOL payment flows
│       │   ├── AdaptiveBehaviorView.tsx # Trigger logs + domain trends
│       │   └── SecurityDashboard.tsx # Activity feed + monitoring
│       └── hooks/useSolanaEvents.ts # WebSocket program subscriptions
└── docker-compose.multi-agent.yml # Multi-agent Docker setup
```

## Why Solana?

1. **Cheap on-chain proofs** — Challenge results + Merkle roots stored for <$0.01/tx
2. **PDA-based identity** — Deterministic agent addresses from `[owner, agent_id]` seeds
3. **Atomic reputation** — Challenge result + reputation update in single transaction
4. **Fast finality** — Challenge-response cycle completes in <2 seconds on-chain
5. **Rent reclamation** — `close_challenge` recovers ~0.012 SOL per challenge (mainnet-ready)

---

## Builder

**Vitalii Serbyn** — Solo developer building trust infrastructure for the Solana agent economy.

---

Built for [Colosseum Agent Hackathon 2026](https://colosseum.com/agent-hackathon)
