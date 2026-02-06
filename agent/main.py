"""
Agent Proof-of-Intelligence Demo

This agent:
1. Registers itself on Solana devnet
2. Exposes an API for receiving challenges
3. Automatically responds to challenges
4. Proves it's running the claimed model
"""
import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

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
from poi import ChallengeHandler, compute_model_hash, generate_demo_model_hash
from solana import AgentRegistryClient

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


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan handler for startup/shutdown"""
    global client, challenge_handler, agent_info

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

    yield

    # Cleanup
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
