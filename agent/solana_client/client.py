"""Solana client for interacting with the Agent Registry program"""
import json
import logging
from pathlib import Path
from typing import Optional

from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solders.system_program import ID as SYS_PROGRAM_ID
from solana.rpc.async_api import AsyncClient
from anchorpy import Program, Provider, Wallet, Idl

logger = logging.getLogger(__name__)


class AgentRegistryClient:
    """Client for interacting with the Agent Registry Solana program"""

    def __init__(
        self,
        rpc_url: str,
        program_id: str,
        idl_path: Path,
        wallet_path: Optional[Path] = None,
        keypair: Optional[Keypair] = None,
    ):
        """
        Initialize the client.

        Args:
            rpc_url: Solana RPC URL
            program_id: Program ID
            idl_path: Path to the IDL JSON file
            wallet_path: Path to wallet keypair JSON (optional if keypair provided)
            keypair: Keypair to use (optional if wallet_path provided)
        """
        self.rpc_url = rpc_url
        self.program_id = Pubkey.from_string(program_id)

        # Load IDL
        with open(idl_path) as f:
            idl_data = json.load(f)
        self.idl = Idl.from_json(json.dumps(idl_data))

        # Load or use keypair
        if keypair:
            self.keypair = keypair
        elif wallet_path:
            with open(wallet_path) as f:
                secret_key = json.load(f)
            self.keypair = Keypair.from_bytes(bytes(secret_key))
        else:
            raise ValueError("Either wallet_path or keypair must be provided")

        self.client: Optional[AsyncClient] = None
        self.program: Optional[Program] = None

    async def connect(self):
        """Connect to Solana and initialize the program"""
        self.client = AsyncClient(self.rpc_url)
        wallet = Wallet(self.keypair)
        provider = Provider(self.client, wallet)
        self.program = Program(self.idl, self.program_id, provider)
        logger.info(f"Connected to {self.rpc_url}")

    async def disconnect(self):
        """Disconnect from Solana"""
        if self.client:
            await self.client.close()
            logger.info("Disconnected from Solana")

    def _get_registry_pda(self) -> tuple[Pubkey, int]:
        """Get the registry PDA"""
        return Pubkey.find_program_address(
            [b"registry"],
            self.program_id
        )

    def _get_agent_pda(self, owner: Pubkey, agent_id: int) -> tuple[Pubkey, int]:
        """Get an agent PDA"""
        return Pubkey.find_program_address(
            [
                b"agent",
                bytes(owner),
                agent_id.to_bytes(8, "little"),
            ],
            self.program_id
        )

    def _get_challenge_pda(self, agent: Pubkey, challenger: Pubkey) -> tuple[Pubkey, int]:
        """Get a challenge PDA"""
        return Pubkey.find_program_address(
            [
                b"challenge",
                bytes(agent),
                bytes(challenger),
            ],
            self.program_id
        )

    async def get_registry_state(self) -> dict:
        """Fetch the registry state"""
        registry_pda, _ = self._get_registry_pda()
        state = await self.program.account["RegistryState"].fetch(registry_pda)
        return {
            "admin": str(state.admin),
            "total_agents": state.total_agents,
            "collection": str(state.collection),
            "collection_initialized": state.collection_initialized,
        }

    async def register_agent(
        self,
        name: str,
        model_hash: str,
        capabilities: str,
        nft_mint: Optional[Pubkey] = None,
    ) -> dict:
        """
        Register a new agent on-chain.

        Args:
            name: Agent name
            model_hash: SHA256 hash of the model file
            capabilities: Comma-separated capabilities
            nft_mint: NFT mint address (or generates a mock one)

        Returns:
            Dict with agent_pda and transaction signature
        """
        registry_pda, _ = self._get_registry_pda()

        # Get current total_agents for PDA derivation
        registry_state = await self.get_registry_state()
        agent_id = registry_state["total_agents"]

        agent_pda, _ = self._get_agent_pda(self.keypair.pubkey(), agent_id)

        # Use provided NFT mint or generate a mock one
        if nft_mint is None:
            nft_mint = Keypair().pubkey()

        tx = await self.program.rpc["register_agent"](
            name,
            model_hash,
            capabilities,
            ctx=self.program.provider.get_context(
                accounts={
                    "owner": self.keypair.pubkey(),
                    "registry": registry_pda,
                    "agent": agent_pda,
                    "nft_mint": nft_mint,
                    "system_program": SYS_PROGRAM_ID,
                }
            )
        )

        logger.info(f"Agent registered: {agent_pda} (tx: {tx})")
        return {
            "agent_pda": str(agent_pda),
            "agent_id": agent_id,
            "tx": str(tx),
        }

    async def get_agent(self, owner: Pubkey, agent_id: int) -> dict:
        """Fetch an agent account"""
        agent_pda, _ = self._get_agent_pda(owner, agent_id)
        agent = await self.program.account["AgentAccount"].fetch(agent_pda)
        return {
            "agent_id": agent.agent_id,
            "owner": str(agent.owner),
            "name": agent.name,
            "model_hash": agent.model_hash,
            "capabilities": agent.capabilities,
            "reputation_score": agent.reputation_score,
            "challenges_passed": agent.challenges_passed,
            "challenges_failed": agent.challenges_failed,
            "verified": agent.verified,
            "nft_mint": str(agent.nft_mint),
        }

    async def submit_challenge_response(
        self,
        agent_id: int,
        challenger: Pubkey,
        response_hash: str,
    ) -> str:
        """
        Submit a response to a challenge.

        Args:
            agent_id: The agent's ID
            challenger: The challenger's pubkey
            response_hash: SHA256 hash of the response (64-char hex)

        Returns:
            Transaction signature
        """
        registry_pda, _ = self._get_registry_pda()
        agent_pda, _ = self._get_agent_pda(self.keypair.pubkey(), agent_id)
        challenge_pda, _ = self._get_challenge_pda(agent_pda, challenger)

        tx = await self.program.rpc["submit_response"](
            response_hash,
            ctx=self.program.provider.get_context(
                accounts={
                    "owner": self.keypair.pubkey(),
                    "registry": registry_pda,
                    "agent": agent_pda,
                    "challenge": challenge_pda,
                }
            )
        )

        logger.info(f"Challenge response submitted: {tx}")
        return str(tx)

    async def get_challenge(self, agent_pda: Pubkey, challenger: Pubkey) -> dict:
        """Fetch a challenge account"""
        challenge_pda, _ = self._get_challenge_pda(agent_pda, challenger)
        challenge = await self.program.account["Challenge"].fetch(challenge_pda)
        return {
            "agent": str(challenge.agent),
            "challenger": str(challenge.challenger),
            "question": challenge.question,
            "expected_hash": challenge.expected_hash,
            "status": challenge.status,
            "created_at": challenge.created_at,
            "expires_at": challenge.expires_at,
        }

    async def discover_agents(self, max_agents: int = 50) -> list[dict]:
        """
        Discover all registered agents on the network.

        This is KEY for autonomous agent-to-agent interaction.
        The agent uses this to find other agents to challenge.

        Args:
            max_agents: Maximum number of agents to fetch

        Returns:
            List of agent dictionaries
        """
        registry_state = await self.get_registry_state()
        total_agents = registry_state["total_agents"]
        admin = Pubkey.from_string(registry_state["admin"])

        agents = []
        for i in range(min(total_agents, max_agents)):
            try:
                agent = await self.get_agent(admin, i)
                agent["pda"] = str(self._get_agent_pda(admin, i)[0])
                agent["index"] = i
                agents.append(agent)
            except Exception as e:
                logger.debug(f"Failed to fetch agent {i}: {e}")
                continue

        logger.info(f"Discovered {len(agents)} agents on network")
        return agents

    async def create_challenge_for_agent(
        self,
        target_agent_pda: Pubkey,
        question: str,
        expected_hash: str,
    ) -> str:
        """
        Create a challenge for another agent.

        This enables AUTONOMOUS AGENT-TO-AGENT INTERACTION:
        Our agent can challenge other agents to verify their intelligence.

        Args:
            target_agent_pda: The target agent's PDA
            question: The challenge question
            expected_hash: SHA256 hash of expected answer

        Returns:
            Transaction signature
        """
        challenge_pda, _ = self._get_challenge_pda(target_agent_pda, self.keypair.pubkey())

        tx = await self.program.rpc["create_challenge"](
            question,
            expected_hash,
            ctx=self.program.provider.get_context(
                accounts={
                    "challenger": self.keypair.pubkey(),
                    "agent": target_agent_pda,
                    "challenge": challenge_pda,
                    "system_program": SYS_PROGRAM_ID,
                }
            )
        )

        logger.info(f"Challenge created for agent {target_agent_pda}: {tx}")
        return str(tx)

    async def get_pending_challenges_for_me(self) -> list[dict]:
        """
        Find all pending challenges targeting our agent.

        Returns:
            List of challenge dictionaries
        """
        # This is a simplified version - in production you'd use getProgramAccounts
        # with filters for the agent field matching our PDA
        registry_state = await self.get_registry_state()

        # Get our agent info
        try:
            my_agent = await self.get_agent(self.keypair.pubkey(), 0)
            my_agent_pda = self._get_agent_pda(self.keypair.pubkey(), 0)[0]
        except Exception:
            return []

        # Note: Full implementation would scan all challenges targeting us
        # For hackathon demo, we return empty list (challenges found via events)
        return []
