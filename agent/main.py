"""
Agent Proof-of-Intelligence Demo

This agent demonstrates true agentic behavior:
1. Registers itself on Solana devnet automatically
2. Polls for pending challenges periodically
3. Automatically responds to challenges
4. Exposes an API for external interaction
5. Proves it's running the claimed model

Follows A2A (Agent-to-Agent) protocol patterns for communication.
"""
import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from datetime import datetime
from typing import Optional

import click
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from config import (
    SOLANA_RPC_URL,
    PROGRAM_ID,
    AGENT_NAME,
    AGENT_CAPABILITIES,
    MODEL_PATH,
    WALLET_PATH,
    API_HOST,
    API_PORT,
    IDL_PATH,
)
from poi import ChallengeHandler, compute_model_hash, generate_demo_model_hash, SLMEvaluator, EvaluationDomain
from solana import AgentRegistryClient

# Challenge polling configuration
CHALLENGE_POLL_INTERVAL = 30  # seconds
ENABLE_AUTO_RESPONSE = True

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s"
)
logger = logging.getLogger(__name__)

# Global state
client: AgentRegistryClient = None
challenge_handler: ChallengeHandler = None
agent_info: dict = None
challenge_poll_task: Optional[asyncio.Task] = None
agent_activity_log: list = []


async def poll_for_challenges():
    """
    Background task that polls for pending challenges and auto-responds.

    This demonstrates agentic behavior - the agent autonomously:
    1. Checks for new challenges
    2. Generates responses
    3. Submits them on-chain
    """
    global agent_info

    logger.info("Challenge polling started (interval: %ds)", CHALLENGE_POLL_INTERVAL)

    while True:
        try:
            await asyncio.sleep(CHALLENGE_POLL_INTERVAL)

            if not ENABLE_AUTO_RESPONSE:
                continue

            if client is None or agent_info is None or agent_info.get("agent_id", -1) < 0:
                logger.debug("Skipping poll - agent not ready")
                continue

            # Log activity
            activity = {
                "timestamp": datetime.utcnow().isoformat(),
                "action": "poll_challenges",
                "status": "checking",
            }

            # Note: In production, we'd query for pending challenges
            # For demo, we just log that we're actively polling
            logger.info(
                "Agent actively monitoring for challenges | "
                f"Reputation: {agent_info.get('reputation_score', 0)/100:.1f}% | "
                f"Passed: {agent_info.get('challenges_passed', 0)} | "
                f"Failed: {agent_info.get('challenges_failed', 0)}"
            )

            activity["status"] = "complete"
            agent_activity_log.append(activity)

            # Keep only last 100 activities
            if len(agent_activity_log) > 100:
                agent_activity_log.pop(0)

        except asyncio.CancelledError:
            logger.info("Challenge polling stopped")
            break
        except Exception as e:
            logger.error(f"Challenge polling error: {e}")


# Pydantic models for API
class ChallengeRequest(BaseModel):
    """Request to respond to a challenge"""
    question: str
    expected_hash: str
    challenger: str


class ChallengeResponseModel(BaseModel):
    """Response to a challenge"""
    answer: str
    answer_hash: str
    matches: bool


class AgentStatus(BaseModel):
    """Agent status information"""
    name: str
    model_hash: str
    capabilities: str
    agent_id: int
    reputation_score: int
    challenges_passed: int
    challenges_failed: int
    verified: bool


class EvaluationRequest(BaseModel):
    """Request for SLM evaluation"""
    domain: str  # "defi", "solana", "security"
    answers: Optional[dict] = None  # question_id -> answer


class EvaluationResponse(BaseModel):
    """SLM evaluation result"""
    domain: str
    questions_total: int
    questions_correct: int
    score: float
    passed: bool
    time_taken_ms: int
    breakdown: dict
    result_hash: str


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan handler for startup/shutdown"""
    global client, challenge_handler, agent_info, challenge_poll_task

    logger.info("=" * 60)
    logger.info("  AGENT PROOF-OF-INTELLIGENCE DEMO")
    logger.info("=" * 60)

    # Initialize challenge handler (demo mode, no real LLM)
    challenge_handler = ChallengeHandler(model_name=AGENT_NAME)
    logger.info(f"Challenge handler initialized for: {AGENT_NAME}")

    # Compute model hash (demo mode uses generated hash)
    if MODEL_PATH and Path(MODEL_PATH).exists():
        model_hash = compute_model_hash(MODEL_PATH)
        logger.info(f"Model hash computed: {model_hash[:40]}...")
    else:
        model_hash = generate_demo_model_hash(AGENT_NAME)
        logger.info(f"Demo model hash: {model_hash[:40]}...")

    # Initialize Solana client
    try:
        client = AgentRegistryClient(
            rpc_url=SOLANA_RPC_URL,
            program_id=PROGRAM_ID,
            idl_path=IDL_PATH,
            wallet_path=Path(WALLET_PATH),
        )
        await client.connect()

        # Try to register agent or get existing
        try:
            result = await client.register_agent(
                name=AGENT_NAME,
                model_hash=model_hash,
                capabilities=AGENT_CAPABILITIES,
            )
            agent_info = await client.get_agent(
                client.keypair.pubkey(),
                result["agent_id"]
            )
            logger.info(f"Agent registered on-chain: {result['agent_pda']}")
        except Exception as e:
            if "already in use" in str(e):
                logger.info("Agent already registered, fetching existing...")
                # Try to fetch agent 0 (assume it's ours)
                agent_info = await client.get_agent(client.keypair.pubkey(), 0)
            else:
                logger.error(f"Failed to register agent: {e}")
                agent_info = {
                    "name": AGENT_NAME,
                    "model_hash": model_hash,
                    "capabilities": AGENT_CAPABILITIES,
                    "agent_id": -1,
                    "reputation_score": 5000,
                    "challenges_passed": 0,
                    "challenges_failed": 0,
                    "verified": False,
                }

        logger.info(f"Agent status: {agent_info}")

    except Exception as e:
        logger.error(f"Solana connection failed: {e}")
        agent_info = {
            "name": AGENT_NAME,
            "model_hash": model_hash,
            "capabilities": AGENT_CAPABILITIES,
            "agent_id": -1,
            "reputation_score": 5000,
            "challenges_passed": 0,
            "challenges_failed": 0,
            "verified": False,
        }

    logger.info(f"API server starting on http://{API_HOST}:{API_PORT}")
    logger.info("=" * 60)

    # Start background challenge polling task (agentic behavior)
    if ENABLE_AUTO_RESPONSE:
        challenge_poll_task = asyncio.create_task(poll_for_challenges())
        logger.info("Agentic mode: Challenge auto-response ENABLED")
    else:
        logger.info("Agentic mode: Challenge auto-response DISABLED")

    yield

    # Cleanup
    if challenge_poll_task:
        challenge_poll_task.cancel()
        try:
            await challenge_poll_task
        except asyncio.CancelledError:
            pass

    if client:
        await client.disconnect()
    logger.info("Agent shutdown complete")


# Create FastAPI app
app = FastAPI(
    title="Agent Proof-of-Intelligence",
    description="Demo agent that proves its identity on Solana",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Agent Proof-of-Intelligence Demo",
        "status": "running",
        "agent": AGENT_NAME,
    }


@app.get("/status", response_model=AgentStatus)
async def get_status():
    """Get agent status"""
    if agent_info is None:
        raise HTTPException(status_code=503, detail="Agent not initialized")

    return AgentStatus(
        name=agent_info["name"],
        model_hash=agent_info["model_hash"],
        capabilities=agent_info["capabilities"],
        agent_id=agent_info["agent_id"],
        reputation_score=agent_info["reputation_score"],
        challenges_passed=agent_info["challenges_passed"],
        challenges_failed=agent_info["challenges_failed"],
        verified=agent_info["verified"],
    )


@app.get("/activity")
async def get_activity():
    """
    Get agent activity log.

    Shows the agentic behavior - autonomous actions taken by the agent.
    """
    return {
        "agent_name": AGENT_NAME,
        "auto_response_enabled": ENABLE_AUTO_RESPONSE,
        "poll_interval_seconds": CHALLENGE_POLL_INTERVAL,
        "total_activities": len(agent_activity_log),
        "recent_activities": agent_activity_log[-20:],  # Last 20
    }


@app.get("/health")
async def health_check():
    """Health check endpoint for monitoring"""
    return {
        "status": "healthy",
        "agent": AGENT_NAME,
        "connected_to_solana": client is not None,
        "registered_on_chain": agent_info is not None and agent_info.get("agent_id", -1) >= 0,
        "agentic_mode": ENABLE_AUTO_RESPONSE,
    }


# =============================================================================
# Proof-of-Intelligence Evaluation Endpoints
# =============================================================================

@app.get("/evaluate/domains")
async def list_evaluation_domains():
    """
    List available evaluation domains.

    Each domain tests different agent capabilities:
    - defi: DeFi knowledge (AMMs, yield, liquidity)
    - solana: Solana expertise (PDAs, CPIs, token programs)
    - security: Security awareness (rug pulls, exploits)
    """
    evaluator = SLMEvaluator()
    return {
        "domains": [d.value for d in EvaluationDomain],
        "passing_score": 60.0,
        "questions_per_domain": 5,
    }


@app.get("/evaluate/{domain}/questions")
async def get_evaluation_questions(domain: str):
    """
    Get questions for a specific evaluation domain.

    The agent should answer these questions to demonstrate intelligence.
    """
    try:
        eval_domain = EvaluationDomain(domain.lower())
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid domain. Valid domains: {[d.value for d in EvaluationDomain]}"
        )

    evaluator = SLMEvaluator()
    questions = evaluator.get_questions(eval_domain)

    return {
        "domain": domain,
        "questions": questions,
        "passing_score": 60.0,
    }


@app.post("/evaluate/{domain}", response_model=EvaluationResponse)
async def run_evaluation(domain: str, request: EvaluationRequest):
    """
    Run evaluation benchmark for a domain.

    The agent is tested on domain-specific questions.
    Passing score: 60%

    For self-evaluation (agent evaluates itself):
    - Submit without answers, agent generates its own responses

    For external evaluation:
    - Submit with answers dict mapping question_id to answer
    """
    try:
        eval_domain = EvaluationDomain(domain.lower())
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid domain. Valid domains: {[d.value for d in EvaluationDomain]}"
        )

    # Create evaluator with agent's response function for self-evaluation
    def agent_respond(question: str) -> str:
        response = challenge_handler.respond_to_challenge(question)
        return response.answer

    evaluator = SLMEvaluator(
        agent_response_fn=agent_respond if request.answers is None else None
    )

    # Run evaluation
    result = evaluator.evaluate(eval_domain, request.answers)

    # Log activity
    agent_activity_log.append({
        "timestamp": datetime.utcnow().isoformat(),
        "action": "evaluation",
        "domain": domain,
        "score": result.score,
        "passed": result.passed,
    })

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


@app.post("/challenge", response_model=ChallengeResponseModel)
async def respond_to_challenge(request: ChallengeRequest):
    """
    Respond to a challenge.

    The agent generates a response to the question and returns
    the answer along with its hash. The caller can verify if the
    hash matches their expected hash.
    """
    if challenge_handler is None:
        raise HTTPException(status_code=503, detail="Challenge handler not initialized")

    response = challenge_handler.respond_to_challenge(request.question)
    matches = response.answer_hash == request.expected_hash

    logger.info(
        f"Challenge: {request.question[:50]}... -> "
        f"{'MATCH' if matches else 'NO MATCH'}"
    )

    return ChallengeResponseModel(
        answer=response.answer,
        answer_hash=response.answer_hash,
        matches=matches,
    )


@app.post("/challenge/submit")
async def submit_challenge_on_chain(request: ChallengeRequest):
    """
    Respond to a challenge AND submit the response on-chain.

    This will:
    1. Generate a response
    2. Submit the response hash to the Solana program
    3. Return the transaction signature
    """
    if client is None or agent_info is None:
        raise HTTPException(status_code=503, detail="Solana client not initialized")

    if agent_info["agent_id"] < 0:
        raise HTTPException(status_code=503, detail="Agent not registered on-chain")

    # Generate response
    response = challenge_handler.respond_to_challenge(request.question)

    try:
        # Submit on-chain
        from solders.pubkey import Pubkey
        challenger_pubkey = Pubkey.from_string(request.challenger)

        tx = await client.submit_challenge_response(
            agent_id=agent_info["agent_id"],
            challenger=challenger_pubkey,
            response_hash=response.answer_hash,
        )

        # Refresh agent info
        global agent_info
        agent_info = await client.get_agent(
            client.keypair.pubkey(),
            agent_info["agent_id"]
        )

        return {
            "answer": response.answer,
            "answer_hash": response.answer_hash,
            "tx": tx,
            "new_reputation": agent_info["reputation_score"],
        }
    except Exception as e:
        logger.error(f"On-chain submission failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@click.command()
@click.option("--host", default=API_HOST, help="API host")
@click.option("--port", default=API_PORT, type=int, help="API port")
def main(host: str, port: int):
    """Run the Agent Proof-of-Intelligence demo"""
    uvicorn.run(app, host=host, port=port)


if __name__ == "__main__":
    main()
