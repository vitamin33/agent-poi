"""
Multi-Agent PoI - Single Process, Three Agents
For Render free tier deployment (one service, one port).

Runs Alpha, Beta, Gamma agent instances in ONE FastAPI process.
Each agent has isolated state via AgentState dataclass and dependency injection.
Agents communicate internally via HTTP through the same process (localhost routes).

Architecture:
  - Gateway app on PORT (Render's port) mounts 3 sub-apps at /alpha, /beta, /gamma
  - Each sub-app has its own Solana wallet, personality, and background tasks
  - /network endpoint aggregates all agents' A2A interactions
  - Internal A2A uses http://localhost:{PORT}/alpha/challenge etc.

Built for Colosseum Agent Hackathon - Feb 12 deadline.
"""
import asyncio
import logging
import hashlib
import json
import os
import tempfile
import time
from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv()
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional
from dataclasses import dataclass, field

import httpx
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from poi import ChallengeHandler, compute_model_hash, generate_demo_model_hash, generate_model_identifier_hash, SLMEvaluator, EvaluationDomain, LLMJudge, QuestionSelector, AuditBatcher, ActionType, DeFiToolkit, GroqKeyRotator
from solana_client import AgentRegistryClient

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
AGENT_VERSION = "4.1.0-adaptive-live"
CHALLENGE_POLL_INTERVAL = 30
SELF_EVAL_INTERVAL = 600  # 10 min — frequent enough for live adaptation visibility
CROSS_AGENT_CHALLENGE_INTERVAL = 300

# Economic transaction constants (devnet)
CHALLENGE_FEE_LAMPORTS = 1_000_000      # 0.001 SOL - paid by challenger to target
CHALLENGE_REWARD_LAMPORTS = 500_000     # 0.0005 SOL - returned to challenger on good score
MIN_BALANCE_LAMPORTS = 50_000_000       # 0.05 SOL - minimum balance to maintain

# LLM Judge config (shared across agents)
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
LLM_JUDGE_ENABLED = os.getenv("LLM_JUDGE_ENABLED", "true").lower() in ("true", "1", "yes")
LLM_JUDGE_MODEL = os.getenv("LLM_JUDGE_MODEL", "claude-haiku-4-5-20251001")
LLM_JUDGE_PROVIDER = os.getenv("LLM_JUDGE_PROVIDER", "anthropic")
# Answer generation: prefer Groq (free) over Anthropic for cost savings
ANSWER_PROVIDER = os.getenv("ANSWER_PROVIDER", "groq" if GROQ_API_KEY else "anthropic")
ANSWER_MODEL = os.getenv("ANSWER_MODEL", "meta-llama/llama-4-maverick-17b-128e-instruct" if GROQ_API_KEY else "claude-haiku-4-5-20251001")
# Groq key rotator (singleton, shared across all agents)
GROQ_ROTATOR = GroqKeyRotator() if GROQ_API_KEY else None

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("multi_agent")

# Solana / program config (shared across agents)
SOLANA_RPC_URL = os.getenv(
    "SOLANA_RPC_URL",
    "https://thrumming-thrumming-pond.solana-devnet.quiknode.pro/d5b2a7acac061e59f4e38a8d69ec8740a8da3f47/"
)
PROGRAM_ID = os.getenv("PROGRAM_ID", "EQ2Zv3cTDBzY1PafPz2WDoup6niUv6X8t9id4PBACL38")

# IDL path resolution (same logic as config.py)
_idl_env = os.getenv("IDL_PATH", "")
if _idl_env:
    IDL_PATH = Path(_idl_env)
else:
    _legacy_idl = Path(__file__).parent / "idl" / "agent_registry_legacy.json"
    _local_idl = Path(__file__).parent.parent / "target" / "idl" / "agent_registry.json"
    _deploy_idl = Path(__file__).parent / "idl" / "agent_registry.json"
    if _legacy_idl.exists():
        IDL_PATH = _legacy_idl
    elif _local_idl.exists():
        IDL_PATH = _local_idl
    else:
        IDL_PATH = _deploy_idl

# Gateway port (Render provides PORT)
GATEWAY_PORT = int(os.getenv("PORT", os.getenv("API_PORT", "10000")))
GATEWAY_HOST = os.getenv("API_HOST", "0.0.0.0")
PUBLIC_URL = os.getenv("AGENT_PUBLIC_URL", f"http://localhost:{GATEWAY_PORT}")

# Persistent state directory (use /data on Render with persistent disk, fallback to local)
STATE_DIR = Path(os.getenv("STATE_DIR", "/data" if os.path.isdir("/data") else "agent_state"))
AUDIT_FLUSH_INTERVAL = 120  # seconds (was 300, reduced for faster on-chain visibility)


# ---------------------------------------------------------------------------
# Pydantic models (same as main.py)
# ---------------------------------------------------------------------------
class ChallengeRequest(BaseModel):
    question: str
    expected_hash: str
    challenger: str
    nonce: int = 0


class ChallengeResponseModel(BaseModel):
    answer: str
    answer_hash: str
    matches: bool


class AgentStatus(BaseModel):
    name: str
    model_hash: str
    capabilities: str
    agent_id: int
    owner: str
    reputation_score: int
    challenges_passed: int
    challenges_failed: int
    verified: bool


class EvaluationRequest(BaseModel):
    domain: str
    answers: Optional[dict] = None


class EvaluationResponse(BaseModel):
    domain: str
    questions_total: int
    questions_correct: int
    score: float
    passed: bool
    time_taken_ms: int
    breakdown: dict
    result_hash: str
    weighted_score: float = 0.0
    max_possible: int = 0
    difficulty_breakdown: Optional[dict] = None
    certification_level: str = "Uncertified"


# ---------------------------------------------------------------------------
# AgentState - isolated per-agent state
# ---------------------------------------------------------------------------
@dataclass
class AgentState:
    name: str
    slug: str  # alpha, beta, gamma
    personality: str
    capabilities: str
    wallet_path: str
    peers: list  # URLs of peer agent sub-apps
    model_provider: str = "anthropic"
    model_name: str = "claude-haiku-4-5-20251001"
    client: Optional[AgentRegistryClient] = None
    challenge_handler: Optional[ChallengeHandler] = None
    llm_judge: Optional[LLMJudge] = None
    question_selector: Optional[QuestionSelector] = None
    agent_info: Optional[dict] = None
    activity_log: list = field(default_factory=list)
    evaluation_history: list = field(default_factory=list)
    certification_history: list = field(default_factory=list)
    cross_agent_challenges: list = field(default_factory=list)
    a2a_interactions: list = field(default_factory=list)
    peer_registry: dict = field(default_factory=dict)
    startup_time: Optional[datetime] = None
    http_client: Optional[httpx.AsyncClient] = None
    tasks: list = field(default_factory=list)
    audit_batcher: Optional[AuditBatcher] = None
    defi_toolkit: Optional[DeFiToolkit] = None
    used_pda_pairs: set = field(default_factory=set)  # Track exhausted PDA slots
    _discovery_cache: list = field(default_factory=list)
    _discovery_cache_ts: float = 0.0
    # Economic tracking (agent-to-agent payments)
    economic_transactions: list = field(default_factory=list)
    total_sol_sent: int = 0       # lamports
    total_sol_received: int = 0   # lamports
    # Adaptive behavior tracking
    domain_scores: dict = field(default_factory=dict)  # domain -> [peer scores observed]
    self_domain_scores: dict = field(default_factory=dict)  # domain -> [own eval scores]
    last_reputation: int = 5000
    adaptive_triggers: list = field(default_factory=list)  # log of why actions were triggered
    # Rate limiting for adaptive triggers
    _urgent_cooldowns: dict = field(default_factory=dict)  # trigger_category -> last_fired_ts
    _hourly_challenge_count: int = 0
    _hourly_challenge_reset_ts: float = 0.0


def _log_activity(state: AgentState, action: str, status: str, details: dict = None):
    """Log an activity with timestamp and hash for audit trail."""
    activity = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "action": action,
        "status": status,
        "agent": state.name,
        "details": details or {},
    }
    activity_str = json.dumps(activity, sort_keys=True)
    activity["hash"] = hashlib.sha256(activity_str.encode()).hexdigest()[:16]
    state.activity_log.append(activity)
    if len(state.activity_log) > 200:
        state.activity_log.pop(0)
    logger.info(f"[{state.slug}][{activity['hash']}] {action}: {status}")
    return activity


# ---------------------------------------------------------------------------
# State persistence (survive redeploys)
# ---------------------------------------------------------------------------
def save_state(state: AgentState) -> None:
    """Save agent state to JSON file for persistence across redeploys."""
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    filepath = STATE_DIR / f"{state.slug}_state.json"
    data = {
        "saved_at": datetime.now(timezone.utc).isoformat(),
        "name": state.name,
        "slug": state.slug,
        "activity_log": state.activity_log[-200:],
        "evaluation_history": state.evaluation_history[-50:],
        "certification_history": state.certification_history[-20:],
        "a2a_interactions": state.a2a_interactions[-100:],
        "cross_agent_challenges": state.cross_agent_challenges[-50:],
        "economic_transactions": state.economic_transactions[-200:],
        "total_sol_sent": state.total_sol_sent,
        "total_sol_received": state.total_sol_received,
        "domain_scores": state.domain_scores,
        "self_domain_scores": state.self_domain_scores,
        "last_reputation": state.last_reputation,
        "adaptive_triggers": state.adaptive_triggers[-50:],
        "hourly_challenge_count": state._hourly_challenge_count,
        "audit_batches": [
            {k: v for k, v in b.items() if k != "entries"}
            for b in (state.audit_batcher.flushed_batches if state.audit_batcher else [])
        ],
    }
    tmp = filepath.with_suffix(".tmp")
    with open(tmp, "w") as f:
        json.dump(data, f)
    tmp.rename(filepath)
    logger.debug(f"[{state.slug}] State saved to {filepath}")


def load_state(state: AgentState) -> bool:
    """Load previously saved state. Returns True if state was restored."""
    filepath = STATE_DIR / f"{state.slug}_state.json"
    if not filepath.exists():
        return False
    try:
        with open(filepath) as f:
            data = json.load(f)
        state.activity_log = data.get("activity_log", [])
        state.evaluation_history = data.get("evaluation_history", [])
        state.certification_history = data.get("certification_history", [])
        state.a2a_interactions = data.get("a2a_interactions", [])
        state.cross_agent_challenges = data.get("cross_agent_challenges", [])
        state.economic_transactions = data.get("economic_transactions", [])
        state.total_sol_sent = data.get("total_sol_sent", 0)
        state.total_sol_received = data.get("total_sol_received", 0)
        state.domain_scores = data.get("domain_scores", {})
        state.self_domain_scores = data.get("self_domain_scores", {})
        state.last_reputation = data.get("last_reputation", 5000)
        state.adaptive_triggers = data.get("adaptive_triggers", [])
        state._hourly_challenge_count = data.get("hourly_challenge_count", 0)
        # Restore Merkle audit batches
        saved_batches = data.get("audit_batches", [])
        if saved_batches and state.audit_batcher:
            state.audit_batcher.flushed_batches = saved_batches
            state.audit_batcher.total_batches_stored = len(saved_batches)
            state.audit_batcher.total_entries_logged = sum(
                b.get("entry_count", 0) for b in saved_batches
            )
        saved_at = data.get("saved_at", "unknown")
        logger.info(
            f"[{state.slug}] State restored from {saved_at} "
            f"({len(state.a2a_interactions)} interactions, "
            f"{len(state.economic_transactions)} txs, "
            f"{len(saved_batches)} audit batches)"
        )
        return True
    except Exception as e:
        logger.warning(f"[{state.slug}] Failed to load state: {e}")
        return False


# ---------------------------------------------------------------------------
# Background tasks (take AgentState, not globals)
# ---------------------------------------------------------------------------
async def _poll_challenges(state: AgentState):
    """Background: poll for pending challenges."""
    _log_activity(state, "challenge_polling", "started", {"interval": CHALLENGE_POLL_INTERVAL})
    while True:
        try:
            await asyncio.sleep(CHALLENGE_POLL_INTERVAL)
            if state.client is None or state.agent_info is None or state.agent_info.get("agent_id", -1) < 0:
                continue
            _log_activity(state, "poll_challenges", "monitoring", {
                "reputation": state.agent_info.get("reputation_score", 0),
                "uptime": (datetime.now(timezone.utc) - state.startup_time).total_seconds()
                    if state.startup_time else 0,
            })
        except asyncio.CancelledError:
            break
        except Exception as e:
            _log_activity(state, "poll_challenges", "error", {"error": str(e)[:100]})


async def _self_evaluation(state: AgentState):
    """Background: periodic SLM benchmarks."""
    # Stagger start by agent slug to avoid Groq rate-limit bursts
    # alpha=60s, beta=180s, gamma=300s  (120s between each agent's eval burst)
    stagger_offsets = {"alpha": 60, "beta": 180, "gamma": 300}
    initial_delay = stagger_offsets.get(state.slug, 60)
    _log_activity(state, "self_evaluation", "started", {"interval": SELF_EVAL_INTERVAL, "initial_delay": initial_delay})
    await asyncio.sleep(initial_delay)
    while True:
        try:
            domains = [EvaluationDomain.DEFI, EvaluationDomain.SOLANA, EvaluationDomain.SECURITY]
            for domain in domains:
                _log_activity(state, "self_evaluation", "running", {"domain": domain.value})
                logger.info(f"[{state.slug}] eval START domain={domain.value} (running in thread pool)")

                def agent_respond(q: str) -> str:
                    return state.challenge_handler.respond_to_challenge(q).answer

                evaluator = SLMEvaluator(
                    agent_response_fn=agent_respond,
                    llm_judge=state.llm_judge,
                    agent_slug=state.slug,
                )
                # Run in thread pool to avoid blocking the event loop
                # (sync LLM calls would block health endpoint responses)
                t0 = time.monotonic()
                result = await asyncio.to_thread(evaluator.evaluate, domain)
                elapsed = time.monotonic() - t0
                logger.info(f"[{state.slug}] eval DONE domain={domain.value} score={result.score:.1f}% elapsed={elapsed:.1f}s")

                eval_record = {
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "domain": result.domain,
                    "score": result.score,
                    "passed": result.passed,
                    "questions_correct": result.questions_correct,
                    "questions_total": result.questions_total,
                    "result_hash": result.result_hash,
                    "judge_scores": result.judge_scores,
                }
                state.evaluation_history.append(eval_record)
                if len(state.evaluation_history) > 50:
                    state.evaluation_history.pop(0)

                # Track SELF domain scores for adaptive behavior decisions
                domain_key = result.domain
                if domain_key not in state.self_domain_scores:
                    state.self_domain_scores[domain_key] = []
                state.self_domain_scores[domain_key].append(result.score)
                if len(state.self_domain_scores[domain_key]) > 20:
                    state.self_domain_scores[domain_key].pop(0)

                _log_activity(state, "self_evaluation", "completed", {
                    "domain": result.domain, "score": result.score, "passed": result.passed,
                    "trend": _score_trend(state.self_domain_scores.get(domain_key, [])),
                })
                if state.audit_batcher:
                    state.audit_batcher.log(ActionType.EVALUATION_COMPLETED, {
                        "domain": result.domain, "score": result.score,
                        "passed": result.passed, "hash": result.result_hash,
                    })
                await asyncio.sleep(5)

            await asyncio.sleep(SELF_EVAL_INTERVAL)
        except asyncio.CancelledError:
            break
        except Exception as e:
            _log_activity(state, "self_evaluation", "error", {"error": str(e)[:100]})
            await asyncio.sleep(60)


async def _discover_peers(state: AgentState):
    """Discover peers via HTTP A2A protocol."""
    if not state.http_client or not state.peers:
        return
    for peer_url in state.peers:
        peer_url = peer_url.rstrip("/")
        try:
            resp = await state.http_client.get(f"{peer_url}/health", timeout=10.0)
            if resp.status_code == 200:
                health = resp.json()
                peer_name = health.get("agent_name", "unknown")
                status_resp = await state.http_client.get(f"{peer_url}/status", timeout=10.0)
                status = status_resp.json() if status_resp.status_code == 200 else {}
                state.peer_registry[peer_url] = {
                    "name": peer_name, "url": peer_url, "status": "online",
                    "last_seen": datetime.now(timezone.utc).isoformat(),
                    "agent_id": status.get("agent_id", -1),
                    "owner": status.get("owner", ""),
                    "reputation": status.get("reputation_score", 0),
                    "verified": status.get("verified", False),
                    "version": health.get("agent_version", "unknown"),
                    "capabilities": status.get("capabilities", ""),
                    "personality": health.get("personality", ""),
                    "model": health.get("agentic_features", {}).get("llm_judge", {}).get("model", ""),
                }
                _log_activity(state, "peer_discovery", "found", {
                    "peer": peer_name, "url": peer_url,
                })
            else:
                state.peer_registry[peer_url] = {
                    **state.peer_registry.get(peer_url, {}),
                    "status": "unreachable",
                    "last_seen": datetime.now(timezone.utc).isoformat(),
                }
        except Exception as e:
            state.peer_registry[peer_url] = {
                **state.peer_registry.get(peer_url, {}),
                "url": peer_url, "status": "error",
                "error": str(e)[:100],
                "last_seen": datetime.now(timezone.utc).isoformat(),
            }


async def _cross_agent_challenges(state: AgentState):
    """
    Background: autonomous cross-agent A2A challenges with domain questions,
    LLM judge scoring, and on-chain reputation updates.
    """
    # Stagger start by agent slug to avoid RPC burst at startup
    stagger_offsets = {"alpha": 90, "beta": 120, "gamma": 150}
    initial_delay = stagger_offsets.get(state.slug, 90)
    _log_activity(state, "a2a_challenges", "started", {
        "interval": CROSS_AGENT_CHALLENGE_INTERVAL,
        "peers": state.peers,
        "mode": "adaptive",
        "initial_delay": initial_delay,
    })
    await asyncio.sleep(initial_delay)
    idx = 0
    while True:
        try:
            if state.client is None or state.agent_info is None or state.agent_info.get("agent_id", -1) < 0:
                await asyncio.sleep(CROSS_AGENT_CHALLENGE_INTERVAL)
                continue

            # -- ADAPTIVE BEHAVIOR: Check if urgent challenge needed --
            urgent, trigger_reason = _should_challenge_urgently(state)
            if urgent:
                state.adaptive_triggers.append({
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "trigger": trigger_reason,
                    "action": "immediate_challenge",
                })
                if len(state.adaptive_triggers) > 100:
                    state.adaptive_triggers.pop(0)
                _log_activity(state, "adaptive_trigger", "urgent_challenge", {
                    "reason": trigger_reason,
                })
                if state.audit_batcher:
                    state.audit_batcher.log(ActionType.CROSS_AGENT_CHALLENGE, {
                        "type": "adaptive_trigger",
                        "reason": trigger_reason,
                    })

            # Track reputation changes for adaptive behavior
            current_rep = state.agent_info.get("reputation_score", 5000) if state.agent_info else 5000
            state.last_reputation = current_rep

            await _discover_peers(state)

            online_peers = [p for p in state.peer_registry.values() if p.get("status") == "online"]

            if not online_peers:
                _log_activity(state, "a2a_challenge", "no_http_peers", {
                    "configured": len(state.peers),
                })
                await asyncio.sleep(CROSS_AGENT_CHALLENGE_INTERVAL)
                continue

            # -- ADAPTIVE: Target weakest domain's expert peer, or round-robin --
            peer = online_peers[idx % len(online_peers)]
            peer_url = peer["url"]
            idx += 1

            # Select domain-specific question via QuestionSelector
            # ADAPTIVE: prefer weakest domain for self-improvement
            weakest = _get_weakest_domain(state)
            selected_q = state.question_selector.select_question(
                peer["name"],
                preferred_domain=weakest,
            )
            question = selected_q.question

            interaction = {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "challenger": state.name,
                "target": peer["name"],
                "target_url": peer_url,
                "question": question,
                "question_domain": selected_q.domain,
                "question_difficulty": selected_q.difficulty,
                "adaptive_trigger": trigger_reason if urgent else None,
                "steps": [],
            }

            _log_activity(state, "a2a_challenge", "targeting_peer", {
                "peer": peer["name"],
                "question": question[:60],
                "domain": selected_q.domain,
                "adaptive": urgent,
            })

            # -- ECONOMIC: Pay challenge fee to peer before asking --
            challenge_payment_tx = None
            peer_owner = peer.get("owner", "")
            if peer_owner and state.client:
                challenge_payment_tx = await _pay_peer(
                    state, peer_owner, CHALLENGE_FEE_LAMPORTS,
                    f"challenge_fee:{peer['name']}:{selected_q.domain}",
                )
                if challenge_payment_tx:
                    interaction["steps"].append({
                        "step": "economic_challenge_fee", "status": "paid",
                        "lamports": CHALLENGE_FEE_LAMPORTS,
                        "sol": CHALLENGE_FEE_LAMPORTS / 1_000_000_000,
                        "tx": challenge_payment_tx,
                    })

            # HTTP POST /challenge to peer
            dummy_hash = hashlib.sha256(b"challenge_probe").hexdigest()
            peer_answer = None
            peer_answer_hash = None
            try:
                payload = {
                    "question": question,
                    "expected_hash": dummy_hash,
                    "challenger": str(state.client.keypair.pubkey()),
                }
                resp = await state.http_client.post(
                    f"{peer_url}/challenge", json=payload, timeout=15.0,
                )
                if resp.status_code == 200:
                    result = resp.json()
                    peer_answer = result.get("answer", "")
                    peer_answer_hash = result.get("answer_hash", "")
                    interaction["steps"].append({
                        "step": "a2a_http_challenge", "status": "success",
                        "peer_answer_preview": peer_answer,
                        "peer_answer_hash": peer_answer_hash[:16] + "...",
                    })
                    _log_activity(state, "a2a_challenge", "peer_responded", {
                        "peer": peer["name"], "answer_preview": peer_answer[:60],
                    })
                else:
                    interaction["steps"].append({
                        "step": "a2a_http_challenge", "status": "failed",
                        "http_status": resp.status_code,
                    })
            except Exception as e:
                interaction["steps"].append({
                    "step": "a2a_http_challenge", "status": "error",
                    "error": str(e)[:100],
                })

            # LLM Judge scores peer's answer
            judge_result = None
            if peer_answer and state.llm_judge:
                try:
                    judge_result = await state.llm_judge.ajudge(
                        question=question,
                        expected=selected_q.reference_answer,
                        answer=peer_answer,
                    )
                    interaction["steps"].append({
                        "step": "llm_judge_scoring", "status": "scored",
                        "score": judge_result.score,
                        "explanation": judge_result.explanation,
                        "method": judge_result.method,
                    })
                    _log_activity(state, "a2a_challenge", "judge_scored", {
                        "peer": peer["name"], "score": judge_result.score,
                        "method": judge_result.method,
                    })
                except Exception as e:
                    interaction["steps"].append({
                        "step": "llm_judge_scoring", "status": "error",
                        "error": str(e)[:100],
                    })

            # -- ADAPTIVE: Track domain scores for future adaptive decisions --
            if judge_result:
                domain_key = selected_q.domain
                if domain_key not in state.domain_scores:
                    state.domain_scores[domain_key] = []
                state.domain_scores[domain_key].append(judge_result.score)
                if len(state.domain_scores[domain_key]) > 20:
                    state.domain_scores[domain_key].pop(0)

            # -- ECONOMIC: Reward peer if they scored well (>=70%) --
            reward_tx = None
            if judge_result and judge_result.score >= 70 and peer_owner and state.client:
                reward_tx = await _pay_peer(
                    state, peer_owner, CHALLENGE_REWARD_LAMPORTS,
                    f"quality_reward:{peer['name']}:score={judge_result.score}",
                )
                if reward_tx:
                    interaction["steps"].append({
                        "step": "economic_quality_reward", "status": "paid",
                        "lamports": CHALLENGE_REWARD_LAMPORTS,
                        "sol": CHALLENGE_REWARD_LAMPORTS / 1_000_000_000,
                        "tx": reward_tx,
                        "reason": f"score={judge_result.score}>=70",
                    })

            # On-chain challenge + submit
            on_chain_tx = None
            submit_tx = None
            if peer_answer_hash:
                try:
                    known_owners = [
                        p["owner"] for p in state.peer_registry.values()
                        if p.get("owner") and p.get("status") == "online"
                    ]
                    # Use discovery cache (5-min TTL) to avoid excessive RPC calls
                    cache_age = time.monotonic() - state._discovery_cache_ts
                    if state._discovery_cache and cache_age < 300:
                        discovered = state._discovery_cache
                        logger.debug(f"[{state.slug}] Using discovery cache ({len(discovered)} agents, {cache_age:.0f}s old)")
                    else:
                        discovered = await state.client.discover_agents(max_agents=20, known_owners=known_owners)
                        state._discovery_cache = discovered
                        state._discovery_cache_ts = time.monotonic()
                    target_on_chain = None
                    for a in discovered:
                        if a["name"] == peer["name"]:
                            target_on_chain = a
                            break

                    if target_on_chain:
                        from solders.pubkey import Pubkey
                        target_pda = Pubkey.from_string(target_on_chain["pda"])

                        # Create on-chain challenge with unique nonce (timestamp-based)
                        challenge_nonce = 0
                        try:
                            logger.info(
                                f"[{state.slug}] Creating on-chain challenge: "
                                f"target_pda={target_on_chain['pda']}, "
                                f"target_name={target_on_chain.get('name')}, "
                                f"target_owner={target_on_chain.get('owner', 'unknown')[:20]}, "
                                f"challenger={state.client.keypair.pubkey()}"
                            )
                            on_chain_tx, challenge_nonce = await state.client.create_challenge_for_agent(
                                target_agent_pda=target_pda,
                                question=question,
                                expected_hash=peer_answer_hash,
                            )
                            interaction["steps"].append({
                                "step": "on_chain_challenge", "status": "created",
                                "tx": on_chain_tx, "target_pda": target_on_chain["pda"],
                                "nonce": challenge_nonce,
                            })
                            _log_activity(state, "a2a_challenge", "on_chain_created", {
                                "peer": peer["name"],
                                "tx": on_chain_tx[:16] + "...",
                                "nonce": challenge_nonce,
                            })
                        except Exception as e:
                            err_str = str(e)
                            logger.warning(
                                f"[{state.slug}] On-chain challenge FAILED: "
                                f"{type(e).__name__}: {err_str[:200]}"
                            )
                            interaction["steps"].append({
                                "step": "on_chain_challenge", "status": "failed",
                                "error": err_str[:100],
                            })

                        # POST to peer's /challenge/submit -> reputation changes
                        if on_chain_tx:
                            try:
                                submit_payload = {
                                    "question": question,
                                    "expected_hash": peer_answer_hash,
                                    "challenger": str(state.client.keypair.pubkey()),
                                    "nonce": challenge_nonce,
                                }
                                submit_resp = await state.http_client.post(
                                    f"{peer_url}/challenge/submit",
                                    json=submit_payload,
                                    timeout=30.0,
                                )
                                if submit_resp.status_code == 200:
                                    submit_result = submit_resp.json()
                                    submit_tx = submit_result.get("tx", "")
                                    new_rep = submit_result.get("new_reputation", 0)

                                    interaction["steps"].append({
                                        "step": "on_chain_submit", "status": "success",
                                        "tx": submit_tx,
                                        "peer_new_reputation": new_rep,
                                    })
                                    _log_activity(state, "a2a_challenge", "on_chain_submit_success", {
                                        "peer": peer["name"],
                                        "tx": submit_tx[:16] + "..." if submit_tx else "none",
                                        "new_reputation": new_rep,
                                    })

                                    # Refresh our agent info
                                    try:
                                        state.agent_info = await state.client.get_agent(
                                            state.client.keypair.pubkey(),
                                            state.agent_info["agent_id"]
                                        )
                                    except Exception:
                                        pass

                                    # Close challenge PDA to reclaim rent (~0.012 SOL)
                                    # Critical mainnet optimization: 1000x cost reduction
                                    # Wait for submit TX to confirm before closing
                                    await asyncio.sleep(3)
                                    close_attempts = 0
                                    for _close_try in range(3):
                                        try:
                                            close_tx = await state.client.close_challenge(
                                                target_agent_pda=target_pda,
                                                nonce=challenge_nonce,
                                            )
                                            interaction["steps"].append({
                                                "step": "close_challenge", "status": "rent_reclaimed",
                                                "tx": close_tx,
                                            })
                                            _log_activity(state, "a2a_challenge", "rent_reclaimed", {
                                                "tx": close_tx[:16] + "..." if close_tx else "",
                                                "nonce": challenge_nonce,
                                            })
                                            break
                                        except Exception as e:
                                            close_attempts += 1
                                            if close_attempts < 3:
                                                await asyncio.sleep(2)
                                            else:
                                                logger.warning(f"[{state.slug}] Could not close challenge PDA after 3 tries: {repr(e)}")
                                else:
                                    interaction["steps"].append({
                                        "step": "on_chain_submit", "status": "failed",
                                        "http_status": submit_resp.status_code,
                                        "error": submit_resp.text[:100],
                                    })
                            except Exception as e:
                                interaction["steps"].append({
                                    "step": "on_chain_submit", "status": "error",
                                    "error": str(e)[:100],
                                })
                    else:
                        interaction["steps"].append({
                            "step": "on_chain_challenge", "status": "skipped",
                            "reason": "peer_not_found_on_chain",
                        })
                except Exception as e:
                    interaction["steps"].append({
                        "step": "on_chain_challenge", "status": "error",
                        "error": str(e)[:100],
                    })

            interaction["completed_at"] = datetime.now(timezone.utc).isoformat()
            interaction["on_chain_tx"] = on_chain_tx
            interaction["submit_tx"] = submit_tx
            interaction["judge_score"] = judge_result.score if judge_result else None
            interaction["economic"] = {
                "challenge_fee_tx": challenge_payment_tx,
                "reward_tx": reward_tx,
                "fee_lamports": CHALLENGE_FEE_LAMPORTS if challenge_payment_tx else 0,
                "reward_lamports": CHALLENGE_REWARD_LAMPORTS if reward_tx else 0,
            }
            state.a2a_interactions.append(interaction)

            # Merkle audit: log cross-agent challenge
            if state.audit_batcher:
                state.audit_batcher.log(ActionType.CROSS_AGENT_CHALLENGE, {
                    "target": peer["name"],
                    "question_domain": selected_q.domain,
                    "judge_score": judge_result.score if judge_result else None,
                    "on_chain": on_chain_tx is not None,
                    "tx": on_chain_tx[:16] if on_chain_tx else None,
                })
            if len(state.a2a_interactions) > 100:
                state.a2a_interactions.pop(0)

            state.cross_agent_challenges.append({
                "timestamp": interaction["timestamp"],
                "target_agent": peer["name"],
                "target_url": peer_url,
                "question": question,
                "domain": selected_q.domain,
                "tx": on_chain_tx or "http_only",
                "submit_tx": submit_tx,
                "judge_score": judge_result.score if judge_result else None,
                "status": "completed" if peer_answer else "failed",
                "a2a_http": True,
                "economic_fee_tx": challenge_payment_tx,
                "economic_reward_tx": reward_tx,
            })
            if len(state.cross_agent_challenges) > 50:
                state.cross_agent_challenges.pop(0)

            # ADAPTIVE: Shorter interval if urgent, normal otherwise
            if urgent:
                await asyncio.sleep(180)  # 3-min follow-up (rate-limited by cooldowns)
            else:
                await asyncio.sleep(CROSS_AGENT_CHALLENGE_INTERVAL)

        except asyncio.CancelledError:
            break
        except Exception as e:
            _log_activity(state, "a2a_challenges", "error", {"error": str(e)[:100]})
            await asyncio.sleep(60)


# ---------------------------------------------------------------------------
# Economic transaction helper
# ---------------------------------------------------------------------------
async def _pay_peer(state: AgentState, peer_pubkey_str: str, lamports: int, reason: str) -> Optional[str]:
    """Send SOL micropayment to a peer agent. Returns tx signature or None."""
    if not state.client:
        return None
    try:
        # Check balance first
        balance = await state.client.get_sol_balance()
        if balance < lamports + MIN_BALANCE_LAMPORTS:
            logger.warning(f"[{state.slug}] Insufficient balance for payment: {balance} < {lamports + MIN_BALANCE_LAMPORTS}")
            return None
        from solders.pubkey import Pubkey
        to_pubkey = Pubkey.from_string(peer_pubkey_str)
        tx_sig = await state.client.transfer_sol(to_pubkey, lamports)
        now_iso = datetime.now(timezone.utc).isoformat()
        sender_pubkey = str(state.client.keypair.pubkey())
        txn_record = {
            "timestamp": now_iso,
            "direction": "sent",
            "counterparty": peer_pubkey_str[:12] + "...",
            "lamports": lamports,
            "sol": lamports / 1_000_000_000,
            "reason": reason,
            "tx": tx_sig,
        }
        state.economic_transactions.append(txn_record)
        if len(state.economic_transactions) > 200:
            state.economic_transactions.pop(0)
        state.total_sol_sent += lamports

        # Record the RECEIVED side on the peer agent (if running in same process)
        for peer_state in all_states:
            peer_owner = peer_state.peer_registry.get(peer_state.name, {}).get("owner", "")
            # Match by pubkey
            if peer_state is not state and peer_state.client:
                peer_pub = str(peer_state.client.keypair.pubkey())
                if peer_pub == peer_pubkey_str:
                    recv_record = {
                        "timestamp": now_iso,
                        "direction": "received",
                        "counterparty": sender_pubkey[:12] + "...",
                        "lamports": lamports,
                        "sol": lamports / 1_000_000_000,
                        "reason": reason,
                        "tx": tx_sig,
                    }
                    peer_state.economic_transactions.append(recv_record)
                    if len(peer_state.economic_transactions) > 200:
                        peer_state.economic_transactions.pop(0)
                    peer_state.total_sol_received += lamports
                    break

        _log_activity(state, "economic_payment", "sent", {
            "to": peer_pubkey_str[:12], "lamports": lamports, "reason": reason, "tx": tx_sig[:16],
        })
        if state.audit_batcher:
            state.audit_batcher.log(ActionType.CROSS_AGENT_CHALLENGE, {
                "type": "economic_payment",
                "direction": "sent",
                "lamports": lamports,
                "reason": reason,
                "tx": tx_sig[:16],
            })
        return tx_sig
    except Exception as e:
        logger.warning(f"[{state.slug}] Payment failed: {e}")
        return None


# ---------------------------------------------------------------------------
# Adaptive behavior engine
# ---------------------------------------------------------------------------
def _get_weakest_domain(state: AgentState) -> Optional[str]:
    """Find the domain with the lowest average SELF-evaluation score."""
    # Prefer self scores (own performance) over peer scores (observed peer quality)
    source = state.self_domain_scores if state.self_domain_scores else state.domain_scores
    if not source:
        return None
    avg_scores = {}
    for domain, scores in source.items():
        if scores:
            avg_scores[domain] = sum(scores[-5:]) / len(scores[-5:])  # Last 5 scores
    if not avg_scores:
        return None
    return min(avg_scores, key=avg_scores.get)


URGENT_COOLDOWN_SECONDS = 600  # 10-minute cooldown per trigger category
MAX_URGENT_PER_HOUR = 8  # Max urgent challenges per agent per hour


def _should_challenge_urgently(state: AgentState) -> tuple[bool, str]:
    """
    Determine if an urgent challenge should be triggered (adaptive behavior).
    Returns (should_trigger, reason_with_reasoning).

    Rate-limited: each trigger category has a 10-minute cooldown, and there's
    a global budget of MAX_URGENT_PER_HOUR urgent challenges per hour.
    """
    now = time.monotonic()

    # Reset hourly budget if needed
    if now - state._hourly_challenge_reset_ts >= 3600:
        state._hourly_challenge_count = 0
        state._hourly_challenge_reset_ts = now

    # Check hourly budget
    if state._hourly_challenge_count >= MAX_URGENT_PER_HOUR:
        return False, ""

    def _check_cooldown(category: str) -> bool:
        """Return True if this category is off cooldown."""
        last_fired = state._urgent_cooldowns.get(category, 0.0)
        return (now - last_fired) >= URGENT_COOLDOWN_SECONDS

    def _fire_trigger(category: str, reason: str) -> tuple[bool, str]:
        """Mark trigger as fired and consume budget."""
        state._urgent_cooldowns[category] = now
        state._hourly_challenge_count += 1
        return True, reason

    # Trigger 1: Reputation dropped significantly
    current_rep = state.agent_info.get("reputation_score", 5000) if state.agent_info else 5000
    if state.last_reputation - current_rep >= 200 and _check_cooldown("reputation_drop"):
        reason = (
            f"reputation_drop:{state.last_reputation}->{current_rep} | "
            f"Reasoning: Reputation fell by {state.last_reputation - current_rep} points. "
            f"Initiating challenge to demonstrate competence and recover standing."
        )
        return _fire_trigger("reputation_drop", reason)

    # Trigger 2: New peer came online that we haven't challenged yet
    if _check_cooldown("new_peer"):
        challenged_peers = set(c.get("target_agent", "") for c in state.cross_agent_challenges[-20:])
        for peer_info in state.peer_registry.values():
            if peer_info.get("status") == "online" and peer_info.get("name") not in challenged_peers:
                peer_name = peer_info.get("name", "unknown")
                reason = (
                    f"new_peer:{peer_name} | "
                    f"Reasoning: Discovered new peer '{peer_name}' on network. "
                    f"Probing capabilities through domain challenge for network intelligence."
                )
                return _fire_trigger("new_peer", reason)

    # Trigger 3: Own domain score below threshold (use SELF scores, not peer scores)
    # Only trigger if we have enough self-eval data to be meaningful
    LOW_SCORE_THRESHOLD = 55  # triggers adaptation when score dips below this
    for domain, scores in state.self_domain_scores.items():
        category = f"low_self_score:{domain}"
        if scores and len(scores) >= 2 and scores[-1] < LOW_SCORE_THRESHOLD and _check_cooldown(category):
            reason = (
                f"low_self_score:{domain}={scores[-1]:.0f}% | "
                f"Reasoning: Self-evaluation in {domain} at {scores[-1]:.0f}% (below {LOW_SCORE_THRESHOLD}% threshold). "
                f"Targeting {domain} questions to peers for comparative learning. "
                f"Trend: {_score_trend(scores)}"
            )
            return _fire_trigger(category, reason)

    # Trigger 4: Score variance detected (score changed significantly from last run)
    for domain, scores in state.self_domain_scores.items():
        category = f"score_variance:{domain}"
        if len(scores) >= 3 and _check_cooldown(category):
            recent_delta = abs(scores[-1] - scores[-2])
            if recent_delta >= 10:  # 10+ point swing between runs
                direction = "improved" if scores[-1] > scores[-2] else "dropped"
                reason = (
                    f"score_variance:{domain}={recent_delta:.0f}pt swing | "
                    f"Reasoning: {domain} score {direction} by {recent_delta:.0f} points "
                    f"({scores[-2]:.0f}% -> {scores[-1]:.0f}%). "
                    f"Challenging peers to validate performance shift. "
                    f"Trend: {_score_trend(scores)}"
                )
                return _fire_trigger(category, reason)

    return False, ""


def _score_trend(scores: list) -> str:
    """Describe the trend of recent scores."""
    if len(scores) < 2:
        return "insufficient data"
    recent = scores[-3:] if len(scores) >= 3 else scores
    if recent[-1] > recent[0] + 5:
        return f"improving ({recent[0]:.0f}% -> {recent[-1]:.0f}%)"
    elif recent[-1] < recent[0] - 5:
        return f"declining ({recent[0]:.0f}% -> {recent[-1]:.0f}%)"
    return f"stable (~{recent[-1]:.0f}%)"


def _get_adaptive_difficulty(state: AgentState, domain: str) -> str:
    """Choose difficulty based on own past performance in this domain."""
    # Prefer self-eval scores; fall back to peer-observed scores
    scores = state.self_domain_scores.get(domain) or state.domain_scores.get(domain, [])
    if not scores:
        return "medium"
    avg = sum(scores[-3:]) / len(scores[-3:])
    if avg >= 85:
        return "hard"
    elif avg >= 60:
        return "medium"
    return "easy"


async def _flush_audit(state: AgentState):
    """Background: periodically flush Merkle audit batches to chain."""
    _log_activity(state, "audit_flush", "started", {"interval": AUDIT_FLUSH_INTERVAL})
    await asyncio.sleep(60)  # Wait 1 min for first flush
    while True:
        try:
            if state.audit_batcher:
                # First, retry any previously failed batches (e.g. from low balance)
                pending = len(state.audit_batcher.pending_entries)
                failed = sum(1 for b in state.audit_batcher.flushed_batches if b.get("tx_signature") is None)
                logger.info(
                    f"[{state.slug}] Audit cycle: {pending} pending entries, "
                    f"{failed} failed batches, {state.audit_batcher.total_batches_stored} total"
                )
                retried = await state.audit_batcher.retry_failed_batches()
                if retried > 0:
                    logger.info(f"[{state.slug}] Retried {retried} failed Merkle batches")

                batch = await state.audit_batcher.flush(force=True)
                if batch:
                    flush_detail = {
                        "batch_index": batch["batch_index"],
                        "entries": batch["entries_count"],
                        "merkle_root": batch["merkle_root"][:16] + "...",
                        "tx": batch.get("tx_signature", "")[:16] + "..." if batch.get("tx_signature") else "local_only",
                    }
                    if batch.get("store_error"):
                        flush_detail["error"] = batch["store_error"][:200]
                    _log_activity(state, "audit_flush", "flushed", flush_detail)
                    logger.info(f"[{state.slug}] Flush result: on_chain={batch.get('on_chain')}, tx={batch.get('tx_signature', 'None')[:20]}, error={batch.get('store_error', 'None')[:100]}")
            # Save state to disk after each flush cycle
            save_state(state)
            await asyncio.sleep(AUDIT_FLUSH_INTERVAL)
        except asyncio.CancelledError:
            save_state(state)  # Save on shutdown too
            break
        except Exception as e:
            _log_activity(state, "audit_flush", "error", {"error": str(e)[:100]})
            await asyncio.sleep(60)


# ---------------------------------------------------------------------------
# Wallet helper
# ---------------------------------------------------------------------------
def _resolve_wallet_path(slug: str) -> str:
    """Resolve wallet path: env var JSON string > file in wallets/ dir."""
    env_key = f"WALLET_JSON_{slug.upper()}"
    wallet_json = os.getenv(env_key, "")
    if wallet_json:
        tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False)
        json.dump(json.loads(wallet_json), tmp)
        tmp.close()
        return tmp.name
    # Fallback to local wallet files
    local = Path(__file__).parent / "wallets" / f"{slug}.json"
    if local.exists():
        return str(local)
    # Last resort: default Solana wallet
    return str(Path.home() / ".config" / "solana" / "id.json")


# ---------------------------------------------------------------------------
# Solana registration logic (shared)
# ---------------------------------------------------------------------------
async def _register_on_chain(state: AgentState, model_hash: str):
    """Register agent on Solana. Mirrors main.py lifespan logic."""
    try:
        state.client = AgentRegistryClient(
            rpc_url=SOLANA_RPC_URL,
            program_id=PROGRAM_ID,
            idl_path=IDL_PATH,
            wallet_path=Path(state.wallet_path),
        )
        await state.client.connect()

        # Scan for existing registration
        try:
            registry_state = await state.client.get_registry_state()
            scan_range = registry_state["total_agents"] + 1
        except Exception:
            scan_range = 20

        state.agent_info = None
        for try_id in range(scan_range):
            try:
                existing = await state.client.get_agent(state.client.keypair.pubkey(), try_id)
                if existing:
                    logger.info(f"[{state.slug}] Found existing registration (ID: {try_id})")
                    state.agent_info = existing
                    break
            except Exception:
                continue

        if state.agent_info is None:
            try:
                result = await state.client.register_agent(
                    name=state.name,
                    model_hash=model_hash,
                    capabilities=state.capabilities,
                )
                logger.info(f"[{state.slug}] Registered on-chain: {result['agent_pda']}")
                for attempt in range(5):
                    await asyncio.sleep(3)
                    try:
                        state.agent_info = await state.client.get_agent(
                            state.client.keypair.pubkey(), result["agent_id"]
                        )
                        break
                    except Exception:
                        pass
                if state.agent_info is None:
                    state.agent_info = {
                        "name": state.name, "model_hash": model_hash,
                        "capabilities": state.capabilities,
                        "agent_id": result["agent_id"],
                        "reputation_score": 5000,
                        "challenges_passed": 0, "challenges_failed": 0,
                        "verified": False,
                    }
            except Exception as e:
                logger.error(f"[{state.slug}] Registration failed: {e}")
                state.agent_info = {
                    "name": state.name, "model_hash": model_hash,
                    "capabilities": state.capabilities,
                    "agent_id": -1,
                    "reputation_score": 5000,
                    "challenges_passed": 0, "challenges_failed": 0,
                    "verified": False,
                }
    except Exception as e:
        logger.error(f"[{state.slug}] Solana connection failed: {e}")
        state.agent_info = {
            "name": state.name, "model_hash": model_hash,
            "capabilities": state.capabilities,
            "agent_id": -1,
            "reputation_score": 5000,
            "challenges_passed": 0, "challenges_failed": 0,
            "verified": False,
        }


# ---------------------------------------------------------------------------
# Factory: create one agent sub-app
# ---------------------------------------------------------------------------
def create_agent_app(
    name: str,
    slug: str,
    personality: str,
    capabilities: str,
    wallet_path: str,
    peers: list[str],
    model_provider: str = "anthropic",
    model_name: str = "claude-haiku-4-5-20251001",
    answer_provider: str = "",
    answer_model: str = "",
) -> tuple[FastAPI, AgentState]:
    """
    Create a FastAPI sub-app for one agent instance.
    Returns (app, state) so the gateway can track state for /network.
    """
    state = AgentState(
        name=name,
        slug=slug,
        personality=personality,
        capabilities=capabilities,
        wallet_path=wallet_path,
        peers=peers,
        model_provider=model_provider,
        model_name=model_name,
    )

    async def _init_agent():
        """Initialize agent state (called from gateway lifespan)."""
        state.startup_time = datetime.now(timezone.utc)
        state.http_client = httpx.AsyncClient(
            headers={"User-Agent": f"AgentPoI/{AGENT_VERSION} ({state.name})"},
            follow_redirects=True,
        )

        logger.info(f"[{slug}] Starting agent: {name} (personality={personality})")

        # Initialize LLM instances
        # 1. Answer LLM: per-agent model (Groq free tier preferred)
        # 2. Judge LLM: Anthropic for consistent, fair scoring across all agents
        _agent_answer_provider = answer_provider or ANSWER_PROVIDER
        _agent_answer_model = answer_model or ANSWER_MODEL

        # Pick the right API key for the answer provider
        _answer_key_map = {"groq": GROQ_API_KEY, "anthropic": ANTHROPIC_API_KEY, "openai": OPENAI_API_KEY}
        _answer_key = _answer_key_map.get(_agent_answer_provider) or ANTHROPIC_API_KEY or OPENAI_API_KEY or None
        # Fallback to Anthropic if Groq key not available
        if _agent_answer_provider == "groq" and not GROQ_API_KEY:
            _agent_answer_provider = "anthropic"
            _agent_answer_model = state.model_name
            _answer_key = ANTHROPIC_API_KEY or OPENAI_API_KEY or None

        answer_llm = LLMJudge(
            api_key=_answer_key,
            model=_agent_answer_model,
            enabled=LLM_JUDGE_ENABLED,
            provider=_agent_answer_provider,
            key_rotator=GROQ_ROTATOR if _agent_answer_provider == "groq" else None,
        )
        _judge_key = ANTHROPIC_API_KEY or OPENAI_API_KEY or None
        state.llm_judge = LLMJudge(
            api_key=_judge_key,
            model=LLM_JUDGE_MODEL,
            enabled=LLM_JUDGE_ENABLED,
            provider=LLM_JUDGE_PROVIDER,
            key_rotator=GROQ_ROTATOR if LLM_JUDGE_PROVIDER == "groq" else None,
        )
        answer_mode = f"{_agent_answer_provider}/{_agent_answer_model}" if answer_llm.is_llm_available else "fuzzy"
        judge_mode = f"{LLM_JUDGE_PROVIDER}/{LLM_JUDGE_MODEL}" if state.llm_judge.is_llm_available else "fuzzy"
        logger.info(f"[{slug}] Answer LLM: {answer_mode} | Judge LLM: {judge_mode}")

        # Update state to reflect actual answer model (shown in API responses)
        state.model_provider = _agent_answer_provider
        state.model_name = _agent_answer_model

        # Challenge handler uses agent-specific model for answer generation
        state.challenge_handler = ChallengeHandler(
            model_name=name,
            llm_judge=answer_llm,
            personality=personality,
        )

        # Question selector for domain-specific challenges
        state.question_selector = QuestionSelector(
            personality=personality,
            llm_judge=state.llm_judge,
        )
        logger.info(f"[{slug}] QuestionSelector: {state.question_selector.get_stats()['total_questions']} questions")

        # Model hash (real model identifier)
        model_hash = generate_model_identifier_hash(state.model_provider, state.model_name)
        logger.info(f"[{slug}] Model: {state.model_provider}/{state.model_name}")

        # Solana registration
        await _register_on_chain(state, model_hash)

        _log_activity(state, "agent_startup", "initializing", {"version": AGENT_VERSION})

        # Initialize Merkle Audit Batcher (verifiable on-chain proof of autonomy)
        if state.client and state.agent_info and state.agent_info.get("agent_id", -1) >= 0:
            try:
                agent_pda_str = str(state.client._get_agent_pda(
                    state.client.keypair.pubkey(), state.agent_info["agent_id"]
                )[0])
                state.audit_batcher = AuditBatcher(
                    solana_client=state.client,
                    agent_pda=agent_pda_str,
                    batch_size=10,
                    storage_path=Path(f"audit_logs/{slug}"),
                )
                state.audit_batcher.log(ActionType.AGENT_REGISTERED, {
                    "name": name, "agent_id": state.agent_info["agent_id"],
                    "personality": personality,
                })
                logger.info(f"[{slug}] Merkle Audit Batcher initialized (batch_size=10)")
            except Exception as e:
                logger.warning(f"[{slug}] Audit batcher init failed: {e}")

        # Initialize AgentiPy DeFi Toolkit (live Solana DeFi capabilities)
        try:
            state.defi_toolkit = DeFiToolkit(
                wallet_path=wallet_path,
                rpc_url=SOLANA_RPC_URL,
                coingecko_api_key=os.getenv("COINGECKO_API_KEY", ""),
            )
            defi_ok = await state.defi_toolkit.initialize()
            if defi_ok:
                logger.info(f"[{slug}] AgentiPy DeFi toolkit initialized OK")
            else:
                logger.warning(f"[{slug}] AgentiPy DeFi toolkit failed: {state.defi_toolkit._init_error}")
        except Exception as e:
            logger.warning(f"[{slug}] AgentiPy DeFi toolkit init error: {e}")
            state.defi_toolkit = None

        # Restore persisted state from previous run (survives redeploys)
        if load_state(state):
            _log_activity(state, "state_restored", "success", {
                "interactions": len(state.a2a_interactions),
                "transactions": len(state.economic_transactions),
            })

        # Background tasks
        state.tasks.append(asyncio.create_task(_poll_challenges(state)))
        state.tasks.append(asyncio.create_task(_self_evaluation(state)))
        state.tasks.append(asyncio.create_task(_cross_agent_challenges(state)))
        state.tasks.append(asyncio.create_task(_flush_audit(state)))

        logger.info(f"[{slug}] Agent ready: {name} | peers={peers}")
        _log_activity(state, "agent_startup", "complete", {
            "peers": peers, "personality": personality,
        })

    async def _shutdown_agent():
        """Shutdown agent state (called from gateway lifespan)."""
        _log_activity(state, "agent_shutdown", "starting", {})
        for t in state.tasks:
            t.cancel()
            try:
                await t
            except asyncio.CancelledError:
                pass
        if state.http_client:
            await state.http_client.aclose()
        if state.client:
            await state.client.disconnect()

    # Store init/shutdown callables on state so gateway can call them
    state._init = _init_agent
    state._shutdown = _shutdown_agent

    sub_app = FastAPI(
        title=f"Agent PoI - {name}",
        description=f"Autonomous AI agent ({personality} specialist)",
        version=AGENT_VERSION,
    )

    # -- Endpoints (all use `state` from closure, no globals) --

    @sub_app.get("/")
    async def root():
        return {
            "message": f"Agent Proof-of-Intelligence - {name}",
            "status": "running",
            "agent": name,
            "personality": personality,
            "slug": slug,
        }

    @sub_app.get("/health")
    async def health():
        uptime = (datetime.now(timezone.utc) - state.startup_time).total_seconds() if state.startup_time else 0
        return {
            "status": "healthy",
            "agent_name": name,
            "agent_version": AGENT_VERSION,
            "personality": personality,
            "uptime_seconds": uptime,
            "solana": {
                "connected": state.client is not None,
                "network": SOLANA_RPC_URL,
                "program_id": PROGRAM_ID,
                "registered": state.agent_info is not None and state.agent_info.get("agent_id", -1) >= 0,
                "agent_id": state.agent_info.get("agent_id", -1) if state.agent_info else -1,
            },
            "agentic_features": {
                "challenge_polling": True,
                "self_evaluation": True,
                "cross_agent_challenges": True,
                "activity_logging": True,
                "merkle_audit_trail": state.audit_batcher is not None,
                "llm_judge": {
                    "enabled": state.llm_judge.is_llm_available if state.llm_judge else False,
                    "answer_model": f"{state.model_provider}/{state.model_name}",
                    "judge_model": f"{LLM_JUDGE_PROVIDER}/{LLM_JUDGE_MODEL}" if (state.llm_judge and state.llm_judge.is_llm_available) else "fuzzy",
                },
                "question_pool": state.question_selector.get_stats() if state.question_selector else None,
            },
            "stats": {
                "activities_logged": len(state.activity_log),
                "evaluations_run": len(state.evaluation_history),
                "reputation": state.agent_info.get("reputation_score", 0) if state.agent_info else 0,
                "challenges_passed": state.agent_info.get("challenges_passed", 0) if state.agent_info else 0,
                "challenges_failed": state.agent_info.get("challenges_failed", 0) if state.agent_info else 0,
            },
            "defi_toolkit": {
                "available": state.defi_toolkit.available if state.defi_toolkit else False,
                "powered_by": "AgentiPy (41 Solana protocols, 218+ actions)",
                "capabilities": state.defi_toolkit.get_capabilities() if state.defi_toolkit else {},
                "stats": state.defi_toolkit.get_stats() if state.defi_toolkit else {},
            },
            "a2a": {
                "configured_peers": len(state.peers),
                "online_peers": sum(1 for p in state.peer_registry.values() if p.get("status") == "online"),
                "total_a2a_interactions": len(state.a2a_interactions),
                "endpoints": ["/status", "/health", "/activity", "/evaluations",
                              "/challenge", "/evaluate/{domain}", "/peers",
                              "/a2a/interactions", "/a2a/info", "/audit",
                              "/autonomous-stats", "/certify", "/certifications",
                              "/economics", "/adaptive", "/wallet",
                              "/defi/capabilities", "/defi/balance", "/defi/tps",
                              "/defi/trending", "/defi/price/{token_id}",
                              "/defi/rugcheck/{token_mint}", "/defi/token/{token_mint}"],
            },
        }

    @sub_app.get("/status", response_model=AgentStatus)
    async def get_status():
        if state.agent_info is None:
            raise HTTPException(status_code=503, detail="Agent not initialized")
        return AgentStatus(
            name=state.agent_info["name"],
            model_hash=state.agent_info["model_hash"],
            capabilities=state.agent_info["capabilities"],
            agent_id=state.agent_info["agent_id"],
            owner=state.agent_info.get("owner",
                str(state.client.keypair.pubkey()) if state.client else "unknown"),
            reputation_score=state.agent_info["reputation_score"],
            challenges_passed=state.agent_info["challenges_passed"],
            challenges_failed=state.agent_info["challenges_failed"],
            verified=state.agent_info["verified"],
        )

    @sub_app.get("/activity")
    async def get_activity():
        return {
            "agent_name": name,
            "agent_version": AGENT_VERSION,
            "startup_time": state.startup_time.isoformat() if state.startup_time else None,
            "uptime_seconds": (datetime.now(timezone.utc) - state.startup_time).total_seconds()
                if state.startup_time else 0,
            "total_activities": len(state.activity_log),
            "recent_activities": state.activity_log[-30:],
        }

    @sub_app.get("/evaluations")
    async def get_evaluations():
        if state.evaluation_history:
            total = len(state.evaluation_history)
            passed = sum(1 for e in state.evaluation_history if e["passed"])
            avg_score = sum(e["score"] for e in state.evaluation_history) / total
            domain_stats = {}
            for d in ["defi", "solana", "security"]:
                de = [e for e in state.evaluation_history if e["domain"] == d]
                if de:
                    domain_stats[d] = {
                        "count": len(de),
                        "avg_score": sum(e["score"] for e in de) / len(de),
                        "pass_rate": sum(1 for e in de if e["passed"]) / len(de) * 100,
                    }
        else:
            total = passed = 0
            avg_score = 0
            domain_stats = {}
        return {
            "agent_name": name,
            "summary": {
                "total_evaluations": total,
                "passed_evaluations": passed,
                "pass_rate": (passed / total * 100) if total > 0 else 0,
                "average_score": avg_score,
            },
            "domain_stats": domain_stats,
            "recent_evaluations": state.evaluation_history[-10:],
        }

    @sub_app.post("/challenge", response_model=ChallengeResponseModel)
    async def respond_to_challenge(request: ChallengeRequest):
        if state.challenge_handler is None:
            raise HTTPException(status_code=503, detail="Challenge handler not initialized")
        response = state.challenge_handler.respond_to_challenge(request.question)
        matches = response.answer_hash == request.expected_hash
        return ChallengeResponseModel(
            answer=response.answer,
            answer_hash=response.answer_hash,
            matches=matches,
        )

    @sub_app.post("/challenge/submit")
    async def submit_challenge(request: ChallengeRequest):
        if state.client is None or state.agent_info is None:
            raise HTTPException(status_code=503, detail="Solana client not initialized")
        if state.agent_info["agent_id"] < 0:
            raise HTTPException(status_code=503, detail="Agent not registered on-chain")
        response = state.challenge_handler.respond_to_challenge(request.question)
        try:
            from solders.pubkey import Pubkey
            challenger_pubkey = Pubkey.from_string(request.challenger)
            tx = await state.client.submit_challenge_response(
                agent_id=state.agent_info["agent_id"],
                challenger=challenger_pubkey,
                response_hash=response.answer_hash,
                nonce=request.nonce,
            )
            state.agent_info = await state.client.get_agent(
                state.client.keypair.pubkey(), state.agent_info["agent_id"]
            )
            return {
                "answer": response.answer,
                "answer_hash": response.answer_hash,
                "tx": tx,
                "new_reputation": state.agent_info["reputation_score"],
            }
        except Exception as e:
            logger.error(f"[{state.slug}] challenge/submit error: {repr(e)}")
            raise HTTPException(status_code=500, detail=repr(e)[:200])

    @sub_app.get("/peers")
    async def get_peers():
        # Refresh peer discovery on every request (stale cache causes "Unknown" peers)
        await _discover_peers(state)
        online = sum(1 for p in state.peer_registry.values() if p.get("status") == "online")
        return {
            "agent_name": name,
            "configured_peers": state.peers,
            "discovered_peers": len(state.peer_registry),
            "online_peers": online,
            "peers": list(state.peer_registry.values()),
        }

    @sub_app.get("/cross-agent-challenges")
    async def get_cross_challenges():
        total = len(state.cross_agent_challenges)
        pending = sum(1 for c in state.cross_agent_challenges if c["status"] == "pending")
        return {
            "agent_name": name,
            "summary": {
                "total_challenges_created": total,
                "pending": pending,
                "completed": total - pending,
            },
            "recent_challenges": state.cross_agent_challenges[-20:],
        }

    @sub_app.get("/a2a/interactions")
    async def get_a2a():
        total = len(state.a2a_interactions)
        successful = sum(1 for i in state.a2a_interactions if i.get("on_chain_tx"))
        http_only = total - successful
        return {
            "agent_name": name,
            "a2a_protocol": True,
            "summary": {
                "total_interactions": total,
                "successful_on_chain": successful,
                "http_only": http_only,
                "unique_peers": len(set(i["target"] for i in state.a2a_interactions)) if state.a2a_interactions else 0,
            },
            "recent_interactions": state.a2a_interactions[-20:],
        }

    @sub_app.get("/a2a/info")
    async def get_a2a_info():
        return {
            "name": name,
            "version": AGENT_VERSION,
            "personality": personality,
            "public_url": f"{PUBLIC_URL}/{slug}",
            "capabilities": capabilities.split(","),
            "solana": {
                "program_id": PROGRAM_ID,
                "network": "devnet",
                "agent_id": state.agent_info.get("agent_id", -1) if state.agent_info else -1,
                "reputation": state.agent_info.get("reputation_score", 0) if state.agent_info else 0,
                "verified": state.agent_info.get("verified", False) if state.agent_info else False,
            },
            "a2a_endpoints": {
                "challenge": f"POST /{slug}/challenge",
                "status": f"GET /{slug}/status",
                "health": f"GET /{slug}/health",
                "evaluate": f"POST /{slug}/evaluate/{{domain}}",
                "peers": f"GET /{slug}/peers",
                "interactions": f"GET /{slug}/a2a/interactions",
            },
            "known_peers": len(state.peer_registry),
            "online_peers": sum(1 for p in state.peer_registry.values() if p.get("status") == "online"),
        }

    @sub_app.post("/refresh")
    async def refresh_agent_info():
        """Re-read agent info from on-chain (picks up verified status, etc)."""
        if state.client and state.agent_info and state.agent_info.get("agent_id", -1) >= 0:
            try:
                state.agent_info = await state.client.get_agent(
                    state.client.keypair.pubkey(), state.agent_info["agent_id"]
                )
                return {"status": "refreshed", "verified": state.agent_info.get("verified", False)}
            except Exception as e:
                return {"status": "error", "detail": str(e)[:200]}
        return {"status": "no_client"}

    @sub_app.post("/merkle-test")
    async def merkle_test():
        """Diagnostic: try to store a test Merkle root on-chain and return result."""
        import hashlib
        info = {
            "rpc_url": SOLANA_RPC_URL,
            "has_client": state.client is not None,
            "has_batcher": state.audit_batcher is not None,
            "agent_pda": state.audit_batcher.agent_pda if state.audit_batcher else None,
        }
        if state.audit_batcher and state.audit_batcher.solana_client:
            try:
                test_root = hashlib.sha256(f"test-{time.time()}".encode()).hexdigest()
                tx = await state.audit_batcher._store_root_on_chain(test_root, 1)
                info["test_store"] = "SUCCESS"
                info["tx"] = tx
            except Exception as e:
                info["test_store"] = "FAILED"
                info["error"] = repr(e)[:500]
        return info

    @sub_app.post("/merkle-flush-test")
    async def merkle_flush_test():
        """Diagnostic: add a test entry and force-flush to test full flush() path."""
        if not state.audit_batcher:
            return {"error": "no audit batcher"}
        # Log a test entry
        entry = state.audit_batcher.log(ActionType.EVALUATION_COMPLETED, {
            "test": True, "timestamp": time.time(), "purpose": "flush_diagnostic"
        })
        # Force flush
        batch = await state.audit_batcher.flush(force=True)
        if batch:
            return {
                "status": "flushed",
                "on_chain": batch.get("on_chain", False),
                "tx_signature": batch.get("tx_signature"),
                "store_error": batch.get("store_error"),
                "batch_index": batch["batch_index"],
                "entries_count": batch["entries_count"],
            }
        return {"status": "no_batch_returned"}

    @sub_app.get("/evaluate/domains")
    async def list_domains():
        return {
            "domains": [d.value for d in EvaluationDomain],
            "passing_score": 60.0,
            "questions_per_domain": 10,
            "certification_levels": ["Expert (>=85)", "Proficient (>=70)", "Basic (>=50)", "Uncertified (<50)"],
        }

    @sub_app.get("/evaluate/{domain}/questions")
    async def get_questions(domain: str):
        try:
            eval_domain = EvaluationDomain(domain.lower())
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid domain. Valid: {[d.value for d in EvaluationDomain]}")
        evaluator = SLMEvaluator()
        return {"domain": domain, "questions": evaluator.get_questions(eval_domain), "passing_score": 60.0}

    @sub_app.post("/evaluate/{domain}", response_model=EvaluationResponse)
    async def run_evaluation(domain: str, request: EvaluationRequest):
        try:
            eval_domain = EvaluationDomain(domain.lower())
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid domain. Valid: {[d.value for d in EvaluationDomain]}")

        def agent_respond(q: str) -> str:
            return state.challenge_handler.respond_to_challenge(q).answer

        evaluator = SLMEvaluator(
            agent_response_fn=agent_respond if request.answers is None else None,
            llm_judge=state.llm_judge,
            agent_slug=slug,
        )
        result = await asyncio.to_thread(evaluator.evaluate, eval_domain, request.answers)
        return EvaluationResponse(
            domain=result.domain,
            questions_total=result.questions_total,
            questions_correct=result.questions_correct,
            score=result.score,
            passed=result.passed,
            time_taken_ms=result.time_taken_ms,
            breakdown=result.breakdown,
            result_hash=result.result_hash,
            weighted_score=result.weighted_score,
            max_possible=result.max_possible,
            difficulty_breakdown=result.difficulty_breakdown,
            certification_level=result.certification_level,
        )

    # -- Certification Endpoints --

    @sub_app.post("/certify")
    async def run_certification():
        """Run full intelligence certification across ALL domains."""
        if state.challenge_handler is None:
            raise HTTPException(status_code=503, detail="Agent not initialized")

        _log_activity(state, "certification", "started", {"domains": ["defi", "solana", "security"]})

        domain_results = {}
        for domain in EvaluationDomain:
            def agent_respond(q: str) -> str:
                return state.challenge_handler.respond_to_challenge(q).answer

            evaluator = SLMEvaluator(agent_response_fn=agent_respond, llm_judge=state.llm_judge, agent_slug=slug)
            result = await asyncio.to_thread(evaluator.evaluate, domain)
            domain_results[domain.value] = {
                "weighted_score": result.weighted_score,
                "certification_level": result.certification_level,
                "questions_correct": result.questions_correct,
                "questions_total": result.questions_total,
                "difficulty_breakdown": result.difficulty_breakdown,
                "time_taken_ms": result.time_taken_ms,
                "result_hash": result.result_hash,
            }

        domain_scores = [r["weighted_score"] for r in domain_results.values()]
        avg_score = sum(domain_scores) / len(domain_scores) if domain_scores else 0

        if avg_score >= 85:
            overall_level = "Expert"
        elif avg_score >= 70:
            overall_level = "Proficient"
        elif avg_score >= 50:
            overall_level = "Basic"
        else:
            overall_level = "Uncertified"

        cert_data = json.dumps({
            "agent": name,
            "model": f"{state.model_provider}/{state.model_name}",
            "model_hash": state.agent_info.get("model_hash", "") if state.agent_info else "",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "overall_score": round(avg_score, 2),
            "overall_level": overall_level,
            "domains": domain_results,
        }, sort_keys=True)
        cert_hash = hashlib.sha256(cert_data.encode()).hexdigest()

        # Store on-chain via audit system
        on_chain_tx = None
        if state.client and state.agent_info and state.agent_info.get("agent_id", -1) >= 0:
            try:
                on_chain_tx = await state.client.log_audit(
                    agent_id=state.agent_info["agent_id"],
                    action_type=9,  # Custom (certification audit)
                    context_risk=0,
                    details_hash=cert_hash,
                )
            except Exception as e:
                logger.warning(f"[{state.slug}] Failed to store certification on-chain: {e}")

        cert_record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "agent": name,
            "model": f"{state.model_provider}/{state.model_name}",
            "model_hash": state.agent_info.get("model_hash", "") if state.agent_info else "",
            "overall_score": round(avg_score, 2),
            "overall_level": overall_level,
            "domain_scores": domain_results,
            "cert_hash": cert_hash,
            "on_chain_tx": on_chain_tx,
        }

        state.certification_history.append(cert_record)
        if len(state.certification_history) > 20:
            state.certification_history.pop(0)

        _log_activity(state, "certification", "completed", {
            "overall_score": round(avg_score, 2),
            "level": overall_level,
        })

        # Merkle audit: log certification
        if state.audit_batcher:
            state.audit_batcher.log(ActionType.EVALUATION_COMPLETED, {
                "type": "certification",
                "overall_score": round(avg_score, 2),
                "level": overall_level,
                "cert_hash": cert_hash[:16],
                "on_chain_tx": on_chain_tx[:16] if on_chain_tx else None,
            })

        return cert_record

    @sub_app.get("/certifications")
    async def get_certifications():
        """Get intelligence certification history."""
        latest = state.certification_history[-1] if state.certification_history else None
        return {
            "agent_name": name,
            "model": f"{state.model_provider}/{state.model_name}",
            "model_hash": state.agent_info.get("model_hash", "") if state.agent_info else "",
            "total_certifications": len(state.certification_history),
            "latest_certification": latest,
            "certification_history": state.certification_history,
        }

    @sub_app.get("/audit")
    async def get_audit():
        """Get Merkle audit trail — cryptographic proof of autonomous activity."""
        if not state.audit_batcher:
            return {
                "agent_name": name,
                "status": "not_initialized",
                "message": "Audit batcher not yet initialized",
            }
        stats = state.audit_batcher.get_stats()
        recent_batches = state.audit_batcher.flushed_batches[-5:] if state.audit_batcher.flushed_batches else []
        # Summarize batches (don't return full entry data)
        batch_summaries = [{
            "batch_index": b["batch_index"],
            "merkle_root": b["merkle_root"],
            "entries_count": b["entries_count"],
            "timestamp": b["timestamp"],
            "tx_signature": b.get("tx_signature"),
            "on_chain": b.get("tx_signature") is not None,
            "store_error": b.get("store_error"),
        } for b in recent_batches]
        return {
            "agent_name": name,
            "audit_stats": stats,
            "recent_batches": batch_summaries,
            "pending_entries": [e.to_dict() for e in state.audit_batcher.pending_entries[-5:]],
            "verification": {
                "merkle_tree": True,
                "sha256_hashes": True,
                "on_chain_roots": stats["total_batches_stored"],
                "verifiable": True,
                "description": "Each autonomous action is SHA256-hashed, batched into a Merkle tree, and the root is stored on Solana. Any entry can be verified against its on-chain root.",
            },
        }

    @sub_app.get("/autonomous-stats")
    async def get_autonomous_stats():
        """Unified autonomous behavior statistics — key endpoint for 'Most Agentic' judging."""
        uptime = (datetime.now(timezone.utc) - state.startup_time).total_seconds() if state.startup_time else 0
        audit_stats = state.audit_batcher.get_stats() if state.audit_batcher else {}
        on_chain_challenges = sum(1 for i in state.a2a_interactions if i.get("on_chain_tx"))
        return {
            "agent_name": name,
            "model": f"{state.model_provider}/{state.model_name}",
            "uptime_hours": round(uptime / 3600, 2),
            "autonomous_behaviors": {
                "challenges_auto_responded": state.agent_info.get("challenges_passed", 0) + state.agent_info.get("challenges_failed", 0) if state.agent_info else 0,
                "challenges_created_for_others": len(state.cross_agent_challenges),
                "on_chain_challenges": on_chain_challenges,
                "self_evaluations_completed": len(state.evaluation_history),
                "certifications_completed": len(state.certification_history),
                "merkle_batches_flushed": audit_stats.get("total_batches_stored", 0),
                "merkle_entries_logged": audit_stats.get("total_entries_logged", 0),
                "total_activities_logged": len(state.activity_log),
                "total_on_chain_transactions": on_chain_challenges + audit_stats.get("total_batches_stored", 0),
            },
            "background_tasks": {
                "challenge_polling": {"status": "running", "interval": f"{CHALLENGE_POLL_INTERVAL}s"},
                "self_evaluation": {"status": "running", "interval": f"{SELF_EVAL_INTERVAL}s"},
                "cross_agent_challenges": {"status": "running", "interval": f"{CROSS_AGENT_CHALLENGE_INTERVAL}s"},
                "audit_flushing": {"status": "running", "interval": f"{AUDIT_FLUSH_INTERVAL}s"},
            },
            "proof_of_autonomy": {
                "total_activities_logged": len(state.activity_log),
                "merkle_roots_on_chain": audit_stats.get("total_batches_stored", 0),
                "verifiable_audit_trail": state.audit_batcher is not None,
                "cryptographic_hashing": "SHA256",
                "on_chain_verification": "Solana devnet",
            },
            "economic_autonomy": {
                "description": "Agents pay each other SOL for challenge services",
                "total_sol_sent": state.total_sol_sent / 1_000_000_000,
                "total_sol_received": state.total_sol_received / 1_000_000_000,
                "total_transactions": len(state.economic_transactions),
                "challenge_fee": f"{CHALLENGE_FEE_LAMPORTS / 1_000_000_000} SOL",
                "quality_reward": f"{CHALLENGE_REWARD_LAMPORTS / 1_000_000_000} SOL",
                "recent_transactions": state.economic_transactions[-5:],
            },
            "adaptive_behavior": {
                "description": "Agents adapt strategy based on self-evaluation with rate-limited triggers and reasoning",
                "total_adaptive_triggers": len(state.adaptive_triggers),
                "self_domain_scores": {d: round(sum(s[-3:])/len(s[-3:]), 1) if s else 0 for d, s in state.self_domain_scores.items()},
                "peer_observed_scores": {d: round(sum(s[-3:])/len(s[-3:]), 1) if s else 0 for d, s in state.domain_scores.items()},
                "weakest_domain": _get_weakest_domain(state),
                "challenge_budget": {
                    "used_this_hour": state._hourly_challenge_count,
                    "max_per_hour": MAX_URGENT_PER_HOUR,
                    "cooldown_per_category": f"{URGENT_COOLDOWN_SECONDS}s",
                },
                "recent_triggers": state.adaptive_triggers[-5:],
            },
            "defi_toolkit": {
                "powered_by": "AgentiPy",
                "available": state.defi_toolkit.available if state.defi_toolkit else False,
                "protocols_accessible": 41,
                "actions_available": "218+",
                "stats": state.defi_toolkit.get_stats() if state.defi_toolkit else {},
            },
        }

    # -- DeFi endpoints (powered by AgentiPy) --

    @sub_app.get("/defi/capabilities")
    async def defi_capabilities():
        """List available DeFi tools and their status."""
        if not state.defi_toolkit:
            return {"available": False, "error": "DeFi toolkit not initialized"}
        return {
            "agent": name,
            "personality": personality,
            **state.defi_toolkit.get_capabilities(),
            "stats": state.defi_toolkit.get_stats(),
        }

    @sub_app.get("/defi/balance")
    async def defi_balance(token: Optional[str] = None):
        """Get agent's SOL or SPL token balance via AgentiPy."""
        if not state.defi_toolkit or not state.defi_toolkit.available:
            raise HTTPException(status_code=503, detail="DeFi toolkit not available")
        result = await state.defi_toolkit.get_balance(token)
        if state.audit_batcher:
            state.audit_batcher.log(ActionType.EVALUATION_COMPLETED, {
                "tool": "agentipy_balance", "success": result.success,
            })
        return {"agent": name, **result.__dict__}

    @sub_app.get("/defi/tps")
    async def defi_tps():
        """Get current Solana network TPS."""
        if not state.defi_toolkit or not state.defi_toolkit.available:
            raise HTTPException(status_code=503, detail="DeFi toolkit not available")
        result = await state.defi_toolkit.get_tps()
        return {"agent": name, **result.__dict__}

    @sub_app.get("/defi/trending")
    async def defi_trending():
        """Get trending tokens from CoinGecko via AgentiPy."""
        if not state.defi_toolkit or not state.defi_toolkit.available:
            raise HTTPException(status_code=503, detail="DeFi toolkit not available")
        result = await state.defi_toolkit.get_trending_tokens()
        return {"agent": name, **result.__dict__}

    @sub_app.get("/defi/price/{token_id}")
    async def defi_price(token_id: str):
        """Get token price data via CoinGecko."""
        if not state.defi_toolkit or not state.defi_toolkit.available:
            raise HTTPException(status_code=503, detail="DeFi toolkit not available")
        result = await state.defi_toolkit.get_token_price(token_id)
        return {"agent": name, **result.__dict__}

    @sub_app.get("/defi/rugcheck/{token_mint}")
    async def defi_rugcheck(token_mint: str):
        """Run RugCheck safety analysis on a token via AgentiPy."""
        if not state.defi_toolkit or not state.defi_toolkit.available:
            raise HTTPException(status_code=503, detail="DeFi toolkit not available")
        result = await state.defi_toolkit.rugcheck(token_mint)
        if state.audit_batcher:
            state.audit_batcher.log(ActionType.EVALUATION_COMPLETED, {
                "tool": "agentipy_rugcheck", "token": token_mint[:20],
                "success": result.success,
            })
        return {"agent": name, **result.__dict__}

    @sub_app.get("/defi/token/{token_mint}")
    async def defi_token_data(token_mint: str):
        """Get token metadata and information via AgentiPy."""
        if not state.defi_toolkit or not state.defi_toolkit.available:
            raise HTTPException(status_code=503, detail="DeFi toolkit not available")
        result = await state.defi_toolkit.get_token_data(token_mint)
        return {"agent": name, **result.__dict__}

    @sub_app.get("/defi/stats")
    async def defi_stats():
        """Get DeFi toolkit usage statistics."""
        if not state.defi_toolkit:
            return {"available": False}
        return {
            "agent": name,
            "stats": state.defi_toolkit.get_stats(),
            "recent_operations": state.defi_toolkit.operation_history[-10:],
        }

    # -- Economic Autonomy Endpoints --

    @sub_app.get("/economics")
    async def get_economics():
        """Agent-to-agent economic transaction history — proof of economic autonomy."""
        sent_count = sum(1 for t in state.economic_transactions if t["direction"] == "sent")
        received_count = sum(1 for t in state.economic_transactions if t["direction"] == "received")
        return {
            "agent_name": name,
            "description": "Agents autonomously pay each other SOL for challenge services",
            "summary": {
                "total_transactions": len(state.economic_transactions),
                "total_sol_sent": round(state.total_sol_sent / 1_000_000_000, 6),
                "total_sol_received": round(state.total_sol_received / 1_000_000_000, 6),
                "net_sol": round((state.total_sol_received - state.total_sol_sent) / 1_000_000_000, 6),
                "sent_count": sent_count,
                "received_count": received_count,
            },
            "fee_structure": {
                "challenge_fee": f"{CHALLENGE_FEE_LAMPORTS / 1_000_000_000} SOL",
                "quality_reward_threshold": "score >= 70%",
                "quality_reward": f"{CHALLENGE_REWARD_LAMPORTS / 1_000_000_000} SOL",
            },
            "recent_transactions": state.economic_transactions[-20:],
        }

    @sub_app.get("/adaptive")
    async def get_adaptive():
        """Adaptive behavior status — proof agent makes strategic decisions."""
        return {
            "agent_name": name,
            "description": "Agent adapts strategy based on self-evaluation performance with rate-limited triggers",
            "self_performance": {
                d: {
                    "avg_score": round(sum(s[-5:])/len(s[-5:]), 1) if s else 0,
                    "trend": _score_trend(s),
                    "total_evaluations": len(s),
                    "adaptive_difficulty": _get_adaptive_difficulty(state, d),
                }
                for d, s in state.self_domain_scores.items()
            } if state.self_domain_scores else {},
            "peer_observed_quality": {
                d: {
                    "avg_score": round(sum(s[-5:])/len(s[-5:]), 1) if s else 0,
                    "total_observations": len(s),
                }
                for d, s in state.domain_scores.items()
            },
            "weakest_domain": _get_weakest_domain(state),
            "rate_limiting": {
                "cooldown_seconds": URGENT_COOLDOWN_SECONDS,
                "max_urgent_per_hour": MAX_URGENT_PER_HOUR,
                "urgent_challenges_this_hour": state._hourly_challenge_count,
                "budget_remaining": MAX_URGENT_PER_HOUR - state._hourly_challenge_count,
                "active_cooldowns": {
                    cat: f"{URGENT_COOLDOWN_SECONDS - (time.monotonic() - ts):.0f}s remaining"
                    for cat, ts in state._urgent_cooldowns.items()
                    if time.monotonic() - ts < URGENT_COOLDOWN_SECONDS
                },
            },
            "adaptive_triggers": {
                "total": len(state.adaptive_triggers),
                "recent": state.adaptive_triggers[-10:],
            },
            "behavior_modes": {
                "reputation_drop_detection": "Active — triggers if reputation drops >=200 points (10-min cooldown)",
                "new_peer_detection": "Active — probes new peers upon discovery (10-min cooldown)",
                "weak_domain_focus": "Active — targets weakest self-eval domain for improvement (10-min cooldown per domain)",
                "difficulty_scaling": "Active — auto-adjusts question difficulty based on self-eval trends",
                "challenge_budget": f"Active — max {MAX_URGENT_PER_HOUR} urgent challenges/hour, {URGENT_COOLDOWN_SECONDS}s cooldown per category",
            },
        }

    @sub_app.get("/wallet")
    async def get_wallet_info():
        """Agent wallet information and balance."""
        balance = 0
        pubkey = "unknown"
        if state.client:
            try:
                balance = await state.client.get_sol_balance()
                pubkey = str(state.client.keypair.pubkey())
            except Exception:
                pass
        return {
            "agent_name": name,
            "pubkey": pubkey,
            "balance_lamports": balance,
            "balance_sol": round(balance / 1_000_000_000, 6),
            "network": "devnet",
        }

    return sub_app, state


# ---------------------------------------------------------------------------
# Agent configurations
# ---------------------------------------------------------------------------
AGENT_CONFIGS = [
    {
        "name": "PoI-Alpha",
        "slug": "alpha",
        "personality": "defi",
        "capabilities": "defi-analysis,yield-farming,amm-math,cross-agent-discovery,agentipy-defi",
        # Answer model: Groq Llama 3.3 70B (proven reliable, best balance)
        # Judge: Anthropic (shared, fair scoring)
        "model_provider": "anthropic",
        "model_name": "claude-haiku-4-5-20251001",
        "answer_provider": "groq",
        "answer_model": "llama-3.3-70b-versatile",
    },
    {
        "name": "PoI-Beta",
        "slug": "beta",
        "personality": "security",
        "capabilities": "security-audit,vulnerability-scan,threat-detection,cross-agent-discovery,agentipy-defi",
        # Answer model: Llama 4 Maverick 17B MoE (128 experts, cutting-edge accuracy)
        "model_provider": "anthropic",
        "model_name": "claude-haiku-4-5-20251001",
        "answer_provider": "groq",
        "answer_model": "meta-llama/llama-4-maverick-17b-128e-instruct",
    },
    {
        "name": "PoI-Gamma",
        "slug": "gamma",
        "personality": "solana",
        "capabilities": "solana-dev,pda-analysis,anchor-expert,cross-agent-discovery,agentipy-defi",
        # Answer model: GPT-OSS 120B (largest open model available, highest quality)
        "model_provider": "anthropic",
        "model_name": "claude-haiku-4-5-20251001",
        "answer_provider": "groq",
        "answer_model": "openai/gpt-oss-120b",
    },
]


# ---------------------------------------------------------------------------
# Build the multi-agent gateway
# ---------------------------------------------------------------------------
all_states: list[AgentState] = []


def _build_peer_list(slug: str) -> list[str]:
    """Build peer URLs for internal A2A communication (same process)."""
    base = f"http://localhost:{GATEWAY_PORT}"
    return [f"{base}/{s['slug']}" for s in AGENT_CONFIGS if s["slug"] != slug]


@asynccontextmanager
async def gateway_lifespan(app: FastAPI):
    """Gateway lifespan - initializes all agent sub-apps."""
    logger.info("=" * 70)
    logger.info("  MULTI-AGENT PoI GATEWAY")
    logger.info("=" * 70)
    logger.info(f"  Port: {GATEWAY_PORT}")
    logger.info(f"  Agents: {', '.join(c['name'] for c in AGENT_CONFIGS)}")
    logger.info(f"  Routes: /alpha, /beta, /gamma, /network")
    logger.info("=" * 70)

    # Initialize all agents (sub-app lifespans don't auto-run when mounted)
    for i, s in enumerate(all_states):
        logger.info(f"Initializing agent {i+1}/{len(all_states)}: {s.name}")
        await s._init()
        logger.info(f"Agent {s.name} initialized OK")

    logger.info(f"All {len(all_states)} agents initialized - gateway READY to serve HTTP")
    yield

    # Shutdown all agents
    logger.info("Multi-agent gateway shutting down")
    for s in all_states:
        await s._shutdown()


gateway = FastAPI(
    title="Agent PoI - Multi-Agent Network",
    description="Three autonomous AI agents in a single process, communicating via A2A HTTP protocol on Solana devnet.",
    version=AGENT_VERSION,
    lifespan=gateway_lifespan,
)

gateway.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create and mount sub-apps
for cfg in AGENT_CONFIGS:
    wallet = _resolve_wallet_path(cfg["slug"])
    peers = _build_peer_list(cfg["slug"])
    sub_app, state = create_agent_app(
        name=cfg["name"],
        slug=cfg["slug"],
        personality=cfg["personality"],
        capabilities=cfg["capabilities"],
        wallet_path=wallet,
        peers=peers,
        model_provider=cfg.get("model_provider", "anthropic"),
        model_name=cfg.get("model_name", "claude-haiku-4-5-20251001"),
        answer_provider=cfg.get("answer_provider", ""),
        answer_model=cfg.get("answer_model", ""),
    )
    all_states.append(state)
    gateway.mount(f"/{cfg['slug']}", sub_app)


# ---------------------------------------------------------------------------
# Gateway endpoints
# ---------------------------------------------------------------------------
@gateway.get("/")
async def gateway_root():
    """Multi-agent network overview."""
    agents = []
    for st in all_states:
        agents.append({
            "name": st.name,
            "slug": st.slug,
            "personality": st.personality,
            "url": f"/{st.slug}",
            "status": "running" if st.startup_time else "starting",
            "agent_id": st.agent_info.get("agent_id", -1) if st.agent_info else -1,
            "reputation": st.agent_info.get("reputation_score", 0) if st.agent_info else 0,
            "activities": len(st.activity_log),
            "evaluations": len(st.evaluation_history),
            "a2a_interactions": len(st.a2a_interactions),
            "online_peers": sum(1 for p in st.peer_registry.values() if p.get("status") == "online"),
        })
    return {
        "title": "Agent PoI - Multi-Agent Network",
        "version": AGENT_VERSION,
        "description": "Three autonomous AI agents proving intelligence on Solana",
        "solana": {
            "network": "devnet",
            "program_id": PROGRAM_ID,
            "rpc": SOLANA_RPC_URL,
        },
        "agents": agents,
        "endpoints": {
            "network": "GET /network",
            "alpha": "GET /alpha/health",
            "beta": "GET /beta/health",
            "gamma": "GET /gamma/health",
        },
    }


_health_check_count = 0

@gateway.get("/health")
async def gateway_health():
    """Gateway health check - aggregates all agents."""
    global _health_check_count
    _health_check_count += 1
    agent_health = []
    all_healthy = True
    for st in all_states:
        healthy = st.startup_time is not None and st.challenge_handler is not None
        if not healthy:
            all_healthy = False
        agent_health.append({
            "name": st.name,
            "slug": st.slug,
            "healthy": healthy,
            "agent_id": st.agent_info.get("agent_id", -1) if st.agent_info else -1,
        })
    status = "healthy" if all_healthy else "degraded"
    # Log every health check for debugging 502 issues
    if _health_check_count <= 5 or _health_check_count % 10 == 0:
        logger.info(f"Health check #{_health_check_count}: status={status} agents={[a['slug'] + '=' + str(a['healthy']) for a in agent_health]}")
    return {
        "status": status,
        "gateway_version": AGENT_VERSION,
        "agents": agent_health,
        "health_check_count": _health_check_count,
    }


@gateway.get("/network")
async def network_overview():
    """
    Aggregated network view of all A2A interactions across all agents.
    This is the KEY endpoint for hackathon demo - shows the living agent network.
    """
    total_interactions = 0
    total_on_chain = 0
    total_evaluations = 0
    all_interactions = []
    agent_summaries = []

    for st in all_states:
        n_interactions = len(st.a2a_interactions)
        n_on_chain_challenges = sum(1 for i in st.a2a_interactions if i.get("on_chain_tx"))
        n_merkle_batches = st.audit_batcher.total_batches_stored if st.audit_batcher else 0
        n_on_chain = n_on_chain_challenges + n_merkle_batches
        n_evals = len(st.evaluation_history)
        total_interactions += n_interactions
        total_on_chain += n_on_chain
        total_evaluations += n_evals

        # Collect recent interactions with source agent tag
        for interaction in st.a2a_interactions[-10:]:
            tagged = {**interaction, "source_agent": st.name}
            all_interactions.append(tagged)

        # Per-agent summary
        avg_score = 0
        if st.evaluation_history:
            avg_score = sum(e["score"] for e in st.evaluation_history) / len(st.evaluation_history)

        latest_cert = st.certification_history[-1] if st.certification_history else None
        agent_summaries.append({
            "name": st.name,
            "slug": st.slug,
            "personality": st.personality,
            "model": f"{st.model_provider}/{st.model_name}",
            "agent_id": st.agent_info.get("agent_id", -1) if st.agent_info else -1,
            "reputation": st.agent_info.get("reputation_score", 0) if st.agent_info else 0,
            "verified": st.agent_info.get("verified", False) if st.agent_info else False,
            "a2a_interactions": n_interactions,
            "on_chain_txs": n_on_chain,
            "merkle_batches": n_merkle_batches,
            "evaluations": n_evals,
            "avg_eval_score": round(avg_score, 1),
            "certifications": len(st.certification_history),
            "latest_certification": {
                "level": latest_cert["overall_level"],
                "score": latest_cert["overall_score"],
                "timestamp": latest_cert["timestamp"],
            } if latest_cert else None,
            "online_peers": sum(1 for p in st.peer_registry.values() if p.get("status") == "online"),
            "uptime_seconds": (datetime.now(timezone.utc) - st.startup_time).total_seconds()
                if st.startup_time else 0,
            "economic": {
                "sol_sent": round(st.total_sol_sent / 1_000_000_000, 6),
                "sol_received": round(st.total_sol_received / 1_000_000_000, 6),
                "transactions": len(st.economic_transactions),
            },
            "adaptive": {
                "triggers": len(st.adaptive_triggers),
                "weakest_domain": _get_weakest_domain(st),
                "budget_used": st._hourly_challenge_count,
                "budget_max": MAX_URGENT_PER_HOUR,
            },
        })

    # Sort interactions by timestamp (most recent first)
    all_interactions.sort(key=lambda x: x.get("timestamp", ""), reverse=True)

    total_economic_txs = sum(len(st.economic_transactions) for st in all_states)
    total_sol_flow = sum(st.total_sol_sent for st in all_states)
    total_adaptive = sum(len(st.adaptive_triggers) for st in all_states)

    return {
        "title": "Multi-Agent PoI Network",
        "version": AGENT_VERSION,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "network_summary": {
            "total_agents": len(all_states),
            "total_a2a_interactions": total_interactions,
            "total_on_chain_txs": total_on_chain,
            "total_evaluations": total_evaluations,
            "agents_registered": sum(
                1 for s in all_states
                if s.agent_info and s.agent_info.get("agent_id", -1) >= 0
            ),
            "economic_transactions": total_economic_txs,
            "total_sol_flow": round(total_sol_flow / 1_000_000_000, 6),
            "adaptive_triggers": total_adaptive,
        },
        "agents": agent_summaries,
        "recent_interactions": all_interactions[:30],
        "protocol": {
            "name": "Agent-to-Agent Proof-of-Intelligence",
            "version": "1.0",
            "solana_program": PROGRAM_ID,
            "network": "devnet",
            "a2a_communication": "HTTP + on-chain",
        },
    }


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import sys

    port = GATEWAY_PORT
    host = GATEWAY_HOST

    # Simple arg parsing (no click dependency needed for multi mode)
    args = sys.argv[1:]
    for i, arg in enumerate(args):
        if arg == "--port" and i + 1 < len(args):
            port = int(args[i + 1])
        elif arg == "--host" and i + 1 < len(args):
            host = args[i + 1]

    logger.info(f"Starting multi-agent gateway on {host}:{port}")
    uvicorn.run(gateway, host=host, port=port)
