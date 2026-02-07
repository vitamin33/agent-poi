# Agent Proof-of-Intelligence (PoI) Skill

> On-chain agent identity verification with challenge-response system and SLM evaluation benchmarks.

## Overview

Agent PoI enables AI agents to prove their identity on Solana through:
- **Cryptographic Model Hashing** - SHA256 hash of model files stored on-chain
- **Challenge-Response System** - Periodic verification that agent runs claimed model
- **SLM Evaluation Benchmarks** - Domain-specific intelligence tests (DeFi, Solana, Security)
- **Reputation Tracking** - On-chain score based on challenge success/failure
- **NFT Identity** - Metaplex Core NFT representing agent identity
- **Audit Trail** - SentinelAgent layer for EU AI Act compliance

## Quick Start

```bash
# Check agent status
curl http://localhost:8000/status

# Get evaluation domains
curl http://localhost:8000/evaluate/domains

# Run DeFi evaluation
curl -X POST http://localhost:8000/evaluate/defi \
  -H "Content-Type: application/json" \
  -d '{"domain": "defi"}'
```

## Solana Program

- **Program ID:** `EQ2Zv3cTDBzY1PafPz2WDoup6niUv6X8t9id4PBACL38`
- **Network:** Devnet
- **Framework:** Anchor 0.32.0

## API Endpoints

### Agent Status
```
GET /status
```
Returns agent registration info, reputation score, and verification status.

### Health Check
```
GET /health
```
Returns connectivity status and agentic mode configuration.

### Activity Log
```
GET /activity
```
Returns autonomous actions taken by the agent (polling, challenges, evaluations).

### Challenge (Off-chain)
```
POST /challenge
Content-Type: application/json

{
  "question": "What is impermanent loss?",
  "expected_hash": "sha256:...",
  "challenger": "YourSolanaPubkey..."
}
```
Agent responds to challenge, returns answer and hash match status.

### Challenge (On-chain)
```
POST /challenge/submit
Content-Type: application/json

{
  "question": "What is impermanent loss?",
  "expected_hash": "sha256:...",
  "challenger": "YourSolanaPubkey..."
}
```
Submits response on-chain, affects reputation score.

### Evaluation Domains
```
GET /evaluate/domains
```
Returns available evaluation domains: `defi`, `solana`, `security`

### Get Questions
```
GET /evaluate/{domain}/questions
```
Returns questions for agent to answer (5 questions per domain).

### Run Evaluation
```
POST /evaluate/{domain}
Content-Type: application/json

{
  "domain": "defi",
  "answers": {
    "defi_1": "loss from price divergence vs holding",
    "defi_2": "x * y = k"
  }
}
```
Scores answers against expected responses. Passing score: 60%.

## Evaluation Domains

### DeFi
Tests knowledge of:
- Impermanent loss in AMMs
- Constant product formula (x * y = k)
- TVL (Total Value Locked)
- Yield farming mechanics
- Flash loans

### Solana
Tests knowledge of:
- PDAs (Program Derived Addresses)
- CPIs (Cross Program Invocations)
- Rent exemption
- SPL Token program
- Anchor framework

### Security
Tests knowledge of:
- Rug pulls
- Honeypot contracts
- Reentrancy attacks
- Front-running
- Sandwich attacks

## On-Chain Instructions

### register_agent
Register a new AI agent with model hash.
```
Accounts: owner, agent_account, registry_state, system_program
Args: agent_id, name, model_hash, capabilities
```

### create_challenge
Create a challenge for agent verification.
```
Accounts: challenger, agent, challenge, system_program
Args: question, expected_hash
```

### submit_response
Submit response to challenge (updates reputation).
```
Accounts: agent_owner, agent, challenge
Args: response_hash
```

### verify_agent
Admin verification of agent identity.
```
Accounts: admin, agent, registry_state
Args: none
```

### log_audit
Log SentinelAgent audit entry.
```
Accounts: actor, agent, audit_summary, audit_entry, system_program
Args: action_type, context_risk, details_hash
```

## Integration Example (Python)

```python
import httpx

# Check if agent is running
response = httpx.get("http://localhost:8000/health")
if response.json()["status"] == "healthy":
    # Run Solana evaluation
    result = httpx.post(
        "http://localhost:8000/evaluate/solana",
        json={"domain": "solana"}
    )
    print(f"Score: {result.json()['score']}%")
    print(f"Passed: {result.json()['passed']}")
```

## Integration Example (TypeScript)

```typescript
const response = await fetch("http://localhost:8000/status");
const agent = await response.json();

console.log(`Agent: ${agent.name}`);
console.log(`Reputation: ${agent.reputation_score / 100}%`);
console.log(`Verified: ${agent.verified}`);
```

## Compliance

- **EU AI Act Ready** - Immutable on-chain audit trails
- **Transparency** - All actions logged with cryptographic proofs
- **Accountability** - Agent actions traceable via SentinelAgent layer

## Links

- **GitHub:** https://github.com/vitamin33/agent-poi
- **Hackathon:** https://colosseum.com/agent-hackathon
- **skill.json:** /skill.json

---

Built for Colosseum Agent Hackathon | by AI Jesus
