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
from contextlib import asynccontextmanager
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional
from dataclasses import dataclass, field

import httpx
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from poi import ChallengeHandler, compute_model_hash, generate_demo_model_hash, SLMEvaluator, EvaluationDomain
from solana_client import AgentRegistryClient

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
AGENT_VERSION = "2.0.0-multi"
CHALLENGE_POLL_INTERVAL = 30
SELF_EVAL_INTERVAL = 300
CROSS_AGENT_CHALLENGE_INTERVAL = 120

CROSS_AGENT_QUESTIONS = [
    {"question": "What blockchain are you registered on?", "expected": "solana"},
    {"question": "Are you an AI agent?", "expected": "yes"},
    {"question": "What is 2 + 2?", "expected": "4"},
    {"question": "What is your primary function?", "expected": "agent"},
    {"question": "Can you prove your identity on-chain?", "expected": "yes"},
]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("multi_agent")

# Solana / program config (shared across agents)
SOLANA_RPC_URL = os.getenv("SOLANA_RPC_URL", "https://api.devnet.solana.com")
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


# ---------------------------------------------------------------------------
# Pydantic models (same as main.py)
# ---------------------------------------------------------------------------
class ChallengeRequest(BaseModel):
    question: str
    expected_hash: str
    challenger: str


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
    client: Optional[AgentRegistryClient] = None
    challenge_handler: Optional[ChallengeHandler] = None
    agent_info: Optional[dict] = None
    activity_log: list = field(default_factory=list)
    evaluation_history: list = field(default_factory=list)
    cross_agent_challenges: list = field(default_factory=list)
    a2a_interactions: list = field(default_factory=list)
    peer_registry: dict = field(default_factory=dict)
    startup_time: Optional[datetime] = None
    http_client: Optional[httpx.AsyncClient] = None
    tasks: list = field(default_factory=list)


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
    _log_activity(state, "self_evaluation", "started", {"interval": SELF_EVAL_INTERVAL})
    await asyncio.sleep(60)
    while True:
        try:
            domains = [EvaluationDomain.DEFI, EvaluationDomain.SOLANA, EvaluationDomain.SECURITY]
            for domain in domains:
                _log_activity(state, "self_evaluation", "running", {"domain": domain.value})

                def agent_respond(q: str) -> str:
                    return state.challenge_handler.respond_to_challenge(q).answer

                evaluator = SLMEvaluator(agent_response_fn=agent_respond)
                result = evaluator.evaluate(domain)

                eval_record = {
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "domain": result.domain,
                    "score": result.score,
                    "passed": result.passed,
                    "questions_correct": result.questions_correct,
                    "questions_total": result.questions_total,
                    "result_hash": result.result_hash,
                }
                state.evaluation_history.append(eval_record)
                if len(state.evaluation_history) > 50:
                    state.evaluation_history.pop(0)

                _log_activity(state, "self_evaluation", "completed", {
                    "domain": result.domain, "score": result.score, "passed": result.passed,
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
    """Background: autonomous cross-agent A2A challenges."""
    _log_activity(state, "a2a_challenges", "started", {
        "interval": CROSS_AGENT_CHALLENGE_INTERVAL,
        "peers": state.peers,
    })
    await asyncio.sleep(90)
    idx = 0
    while True:
        try:
            if state.client is None or state.agent_info is None or state.agent_info.get("agent_id", -1) < 0:
                await asyncio.sleep(CROSS_AGENT_CHALLENGE_INTERVAL)
                continue

            await _discover_peers(state)

            online_peers = [p for p in state.peer_registry.values() if p.get("status") == "online"]

            if not online_peers:
                # Try on-chain fallback
                try:
                    discovered = await state.client.discover_agents(max_agents=20)
                    my_pda = str(state.client._get_agent_pda(
                        state.client.keypair.pubkey(), state.agent_info["agent_id"]
                    )[0])
                    on_chain_others = [a for a in discovered if a.get("pda") != my_pda]
                    if on_chain_others:
                        target = on_chain_others[idx % len(on_chain_others)]
                        qd = CROSS_AGENT_QUESTIONS[idx % len(CROSS_AGENT_QUESTIONS)]
                        expected_hash = hashlib.sha256(qd["expected"].encode()).hexdigest()
                        idx += 1
                        try:
                            from solders.pubkey import Pubkey
                            await state.client.create_challenge_for_agent(
                                target_agent_pda=Pubkey.from_string(target["pda"]),
                                question=qd["question"],
                                expected_hash=expected_hash,
                            )
                        except Exception:
                            pass
                except Exception:
                    pass
                await asyncio.sleep(CROSS_AGENT_CHALLENGE_INTERVAL)
                continue

            peer = online_peers[idx % len(online_peers)]
            peer_url = peer["url"]
            idx += 1
            qd = CROSS_AGENT_QUESTIONS[idx % len(CROSS_AGENT_QUESTIONS)]
            question = qd["question"]
            expected_keyword = qd["expected"]
            expected_hash = hashlib.sha256(expected_keyword.encode()).hexdigest()

            interaction = {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "challenger": state.name,
                "target": peer["name"],
                "target_url": peer_url,
                "question": question,
                "steps": [],
            }

            _log_activity(state, "a2a_challenge", "targeting_peer", {
                "peer": peer["name"], "question": question,
            })

            # HTTP POST /challenge to peer
            peer_answer = None
            peer_answer_hash = None
            try:
                payload = {
                    "question": question,
                    "expected_hash": expected_hash,
                    "challenger": str(state.client.keypair.pubkey()),
                }
                resp = await state.http_client.post(
                    f"{peer_url}/challenge", json=payload, timeout=15.0,
                )
                if resp.status_code == 200:
                    result = resp.json()
                    peer_answer = result.get("answer", "")
                    peer_answer_hash = result.get("answer_hash", "")
                    matches = result.get("matches", False)
                    interaction["steps"].append({
                        "step": "a2a_http_challenge", "status": "success",
                        "peer_answer_preview": peer_answer[:80], "hash_matches": matches,
                    })
                    _log_activity(state, "a2a_challenge", "peer_responded", {
                        "peer": peer["name"], "matches": matches,
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

            # On-chain challenge
            on_chain_tx = None
            if peer_answer_hash:
                try:
                    known_owners = [
                        p["owner"] for p in state.peer_registry.values()
                        if p.get("owner") and p.get("status") == "online"
                    ]
                    discovered = await state.client.discover_agents(max_agents=20, known_owners=known_owners)
                    target_on_chain = None
                    for a in discovered:
                        if a["name"] == peer["name"]:
                            target_on_chain = a
                            break
                    if target_on_chain:
                        from solders.pubkey import Pubkey
                        target_pda = Pubkey.from_string(target_on_chain["pda"])
                        on_chain_tx = await state.client.create_challenge_for_agent(
                            target_agent_pda=target_pda,
                            question=question,
                            expected_hash=peer_answer_hash,
                        )
                        interaction["steps"].append({
                            "step": "on_chain_challenge", "status": "created",
                            "tx": on_chain_tx, "target_pda": target_on_chain["pda"],
                        })
                    else:
                        interaction["steps"].append({
                            "step": "on_chain_challenge", "status": "skipped",
                            "reason": "peer_not_found_on_chain",
                        })
                except Exception as e:
                    error_msg = str(e)
                    status = "exists" if "already in use" in error_msg.lower() else "failed"
                    interaction["steps"].append({
                        "step": "on_chain_challenge", "status": status,
                        "error": error_msg[:100],
                    })

            interaction["completed_at"] = datetime.now(timezone.utc).isoformat()
            interaction["on_chain_tx"] = on_chain_tx
            state.a2a_interactions.append(interaction)
            if len(state.a2a_interactions) > 100:
                state.a2a_interactions.pop(0)

            state.cross_agent_challenges.append({
                "timestamp": interaction["timestamp"],
                "target_agent": peer["name"],
                "target_url": peer_url,
                "question": question,
                "tx": on_chain_tx or "http_only",
                "status": "completed" if peer_answer else "failed",
                "a2a_http": True,
            })
            if len(state.cross_agent_challenges) > 50:
                state.cross_agent_challenges.pop(0)

            await asyncio.sleep(CROSS_AGENT_CHALLENGE_INTERVAL)

        except asyncio.CancelledError:
            break
        except Exception as e:
            _log_activity(state, "a2a_challenges", "error", {"error": str(e)[:100]})
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
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        state.startup_time = datetime.now(timezone.utc)
        state.http_client = httpx.AsyncClient(
            headers={"User-Agent": f"AgentPoI/{AGENT_VERSION} ({state.name})"},
            follow_redirects=True,
        )

        logger.info(f"[{slug}] Starting agent: {name} (personality={personality})")

        # Challenge handler
        state.challenge_handler = ChallengeHandler(model_name=name)

        # Model hash
        model_hash = generate_demo_model_hash(name)

        # Solana registration
        await _register_on_chain(state, model_hash)

        _log_activity(state, "agent_startup", "initializing", {"version": AGENT_VERSION})

        # Background tasks
        state.tasks.append(asyncio.create_task(_poll_challenges(state)))
        state.tasks.append(asyncio.create_task(_self_evaluation(state)))
        state.tasks.append(asyncio.create_task(_cross_agent_challenges(state)))

        logger.info(f"[{slug}] Agent ready: {name} | peers={peers}")
        _log_activity(state, "agent_startup", "complete", {
            "peers": peers, "personality": personality,
        })

        yield

        # Shutdown
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

    sub_app = FastAPI(
        title=f"Agent PoI - {name}",
        description=f"Autonomous AI agent ({personality} specialist)",
        version=AGENT_VERSION,
        lifespan=lifespan,
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
                "audit_trail": True,
            },
            "stats": {
                "activities_logged": len(state.activity_log),
                "evaluations_run": len(state.evaluation_history),
                "reputation": state.agent_info.get("reputation_score", 0) if state.agent_info else 0,
                "challenges_passed": state.agent_info.get("challenges_passed", 0) if state.agent_info else 0,
                "challenges_failed": state.agent_info.get("challenges_failed", 0) if state.agent_info else 0,
            },
            "a2a": {
                "configured_peers": len(state.peers),
                "online_peers": sum(1 for p in state.peer_registry.values() if p.get("status") == "online"),
                "total_a2a_interactions": len(state.a2a_interactions),
                "endpoints": ["/status", "/health", "/activity", "/evaluations",
                              "/challenge", "/evaluate/{domain}", "/peers",
                              "/a2a/interactions", "/a2a/info"],
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
            raise HTTPException(status_code=500, detail=str(e))

    @sub_app.get("/peers")
    async def get_peers():
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

    @sub_app.get("/evaluate/domains")
    async def list_domains():
        return {
            "domains": [d.value for d in EvaluationDomain],
            "passing_score": 60.0,
            "questions_per_domain": 5,
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

        evaluator = SLMEvaluator(agent_response_fn=agent_respond if request.answers is None else None)
        result = evaluator.evaluate(eval_domain, request.answers)
        return EvaluationResponse(
            domain=result.domain,
            questions_total=result.questions_total,
            questions_correct=result.questions_correct,
            score=result.score,
            passed=result.passed,
            time_taken_ms=result.time_taken_ms,
            breakdown=result.breakdown,
            result_hash=result.result_hash,
        )

    return sub_app, state


# ---------------------------------------------------------------------------
# Agent configurations
# ---------------------------------------------------------------------------
AGENT_CONFIGS = [
    {
        "name": "PoI-Alpha",
        "slug": "alpha",
        "personality": "defi",
        "capabilities": "defi-analysis,yield-farming,amm-math,cross-agent-discovery",
    },
    {
        "name": "PoI-Beta",
        "slug": "beta",
        "personality": "security",
        "capabilities": "security-audit,vulnerability-scan,threat-detection,cross-agent-discovery",
    },
    {
        "name": "PoI-Gamma",
        "slug": "gamma",
        "personality": "solana",
        "capabilities": "solana-dev,pda-analysis,anchor-expert,cross-agent-discovery",
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
    """Gateway lifespan - the sub-app lifespans run independently via mount."""
    logger.info("=" * 70)
    logger.info("  MULTI-AGENT PoI GATEWAY")
    logger.info("=" * 70)
    logger.info(f"  Port: {GATEWAY_PORT}")
    logger.info(f"  Agents: {', '.join(c['name'] for c in AGENT_CONFIGS)}")
    logger.info(f"  Routes: /alpha, /beta, /gamma, /network")
    logger.info("=" * 70)
    yield
    logger.info("Multi-agent gateway shutting down")


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


@gateway.get("/health")
async def gateway_health():
    """Gateway health check - aggregates all agents."""
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
    return {
        "status": "healthy" if all_healthy else "degraded",
        "gateway_version": AGENT_VERSION,
        "agents": agent_health,
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
        n_on_chain = sum(1 for i in st.a2a_interactions if i.get("on_chain_tx"))
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

        agent_summaries.append({
            "name": st.name,
            "slug": st.slug,
            "personality": st.personality,
            "agent_id": st.agent_info.get("agent_id", -1) if st.agent_info else -1,
            "reputation": st.agent_info.get("reputation_score", 0) if st.agent_info else 0,
            "verified": st.agent_info.get("verified", False) if st.agent_info else False,
            "a2a_interactions": n_interactions,
            "on_chain_txs": n_on_chain,
            "evaluations": n_evals,
            "avg_eval_score": round(avg_score, 1),
            "online_peers": sum(1 for p in st.peer_registry.values() if p.get("status") == "online"),
            "uptime_seconds": (datetime.now(timezone.utc) - st.startup_time).total_seconds()
                if st.startup_time else 0,
        })

    # Sort interactions by timestamp (most recent first)
    all_interactions.sort(key=lambda x: x.get("timestamp", ""), reverse=True)

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
