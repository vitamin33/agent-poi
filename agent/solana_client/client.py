"""Solana client for interacting with the Agent Registry program"""
import asyncio
import base64
import hashlib
import json
import logging
import struct
import time
from pathlib import Path
from typing import Optional

from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solders.system_program import ID as SYS_PROGRAM_ID
from solana.rpc.async_api import AsyncClient
from solana.rpc.types import MemcmpOpts
from anchorpy import Program, Provider, Wallet, Idl, Context

# Anchor discriminator for AgentAccount (first 8 bytes of SHA256("account:AgentAccount"))
AGENT_ACCOUNT_DISCRIMINATOR = hashlib.sha256(b"account:AgentAccount").digest()[:8]

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
        # Local cache of next Merkle batch index per agent PDA
        # Avoids stale RPC reads between consecutive store_merkle_audit calls
        self._merkle_batch_cache: dict[str, int] = {}

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

    async def transfer_sol(self, to_pubkey: Pubkey, lamports: int) -> str:
        """Transfer SOL to another wallet. Returns tx signature."""
        from solders.transaction import Transaction
        from solders.system_program import transfer, TransferParams
        from solders.message import Message
        from solana.rpc.types import TxOpts
        from solana.rpc.commitment import Confirmed

        ix = transfer(TransferParams(
            from_pubkey=self.keypair.pubkey(),
            to_pubkey=to_pubkey,
            lamports=lamports,
        ))
        recent = await self.client.get_latest_blockhash()
        blockhash = recent.value.blockhash
        msg = Message.new_with_blockhash([ix], self.keypair.pubkey(), blockhash)
        tx = Transaction.new_unsigned(msg)
        tx.sign([self.keypair], blockhash)
        resp = await self.client.send_transaction(
            tx, opts=TxOpts(skip_preflight=True, preflight_commitment=Confirmed),
        )
        sig = str(resp.value)
        logger.info(f"Transfer {lamports} lamports to {to_pubkey}: {sig}")
        return sig

    async def get_sol_balance(self) -> int:
        """Get SOL balance in lamports."""
        resp = await self.client.get_balance(self.keypair.pubkey())
        return resp.value

    async def request_airdrop(self, lamports: int = 1_000_000_000) -> str:
        """Request devnet airdrop. Only works on devnet/testnet."""
        resp = await self.client.request_airdrop(self.keypair.pubkey(), lamports)
        return str(resp.value)

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

    def _get_challenge_pda(self, agent: Pubkey, challenger: Pubkey, nonce: int = 0) -> tuple[Pubkey, int]:
        """Get a challenge PDA.

        Seeds: ["challenge", agent_pda, challenger_pubkey, nonce_le_bytes]
        Nonce is included in seeds, allowing multiple challenges per pair.
        """
        return Pubkey.find_program_address(
            [
                b"challenge",
                bytes(agent),
                bytes(challenger),
                nonce.to_bytes(8, byteorder="little"),
            ],
            self.program_id
        )

    def _get_merkle_summary_pda(self, agent: Pubkey) -> tuple[Pubkey, int]:
        """Get the Merkle audit summary PDA for an agent"""
        return Pubkey.find_program_address(
            [b"merkle_summary", bytes(agent)],
            self.program_id
        )

    def _get_merkle_root_pda(self, agent: Pubkey, batch_index: int) -> tuple[Pubkey, int]:
        """Get a Merkle audit root PDA"""
        return Pubkey.find_program_address(
            [
                b"merkle_audit",
                bytes(agent),
                batch_index.to_bytes(8, "little"),
            ],
            self.program_id
        )

    def _get_audit_summary_pda(self, agent: Pubkey) -> tuple[Pubkey, int]:
        """Get the audit summary PDA for an agent"""
        return Pubkey.find_program_address(
            [b"audit_summary", bytes(agent)],
            self.program_id
        )

    def _get_audit_entry_pda(self, agent: Pubkey, audit_index: int) -> tuple[Pubkey, int]:
        """Get an audit entry PDA"""
        return Pubkey.find_program_address(
            [
                b"audit",
                bytes(agent),
                audit_index.to_bytes(8, "little"),
            ],
            self.program_id
        )

    async def get_audit_summary(self, agent_pda: Pubkey) -> Optional[dict]:
        """Get the audit summary for an agent."""
        summary_pda, _ = self._get_audit_summary_pda(agent_pda)
        try:
            summary = await self.program.account["AgentAuditSummary"].fetch(summary_pda)
            return {
                "total_entries": summary.total_entries,
                "security_alerts": summary.security_alerts,
                "avg_risk_score": summary.avg_risk_score,
                "max_risk_score": summary.max_risk_score,
                "safe_streak": summary.safe_streak,
            }
        except Exception:
            return None

    async def log_audit(
        self,
        agent_id: int,
        action_type: int,
        context_risk: int,
        details_hash: str,
    ) -> str:
        """
        Log an audit entry on-chain.

        Args:
            agent_id: The agent's ID
            action_type: ActionType enum index (4=ChallengePassed, 9=Custom)
            context_risk: Risk score 0-100
            details_hash: SHA256 hash of audit details (64 hex chars)

        Returns:
            Transaction signature
        """
        agent_pda, _ = self._get_agent_pda(self.keypair.pubkey(), agent_id)

        # Get current audit index from summary
        summary = await self.get_audit_summary(agent_pda)
        audit_index = summary["total_entries"] if summary else 0

        summary_pda, _ = self._get_audit_summary_pda(agent_pda)
        entry_pda, _ = self._get_audit_entry_pda(agent_pda, audit_index)

        # Build ActionType enum via AnchorPy type system (needs .index for Borsh serialization)
        AT = self.program.type["ActionType"]
        action_type_map = {
            0: AT.AgentRegistered, 1: AT.AgentUpdated, 2: AT.AgentVerified,
            3: AT.ChallengeCreated, 4: AT.ChallengePassed, 5: AT.ChallengeFailed,
            6: AT.ReputationIncreased, 7: AT.ReputationDecreased,
            8: AT.SecurityAlert, 9: AT.Custom,
        }
        action_type_arg = action_type_map.get(action_type, AT.Custom)()

        tx = await self.program.rpc["log_audit"](
            action_type_arg,
            context_risk,
            details_hash,
            ctx=Context(
                accounts={
                    "actor": self.keypair.pubkey(),
                    "agent": agent_pda,
                    "audit_summary": summary_pda,
                    "audit_entry": entry_pda,
                    "system_program": SYS_PROGRAM_ID,
                },
                signers=[self.keypair],
            )
        )

        logger.info(f"Audit logged on-chain: action={action_type}, risk={context_risk}, tx={tx}")
        return str(tx)

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
            ctx=Context(
                accounts={
                    "owner": self.keypair.pubkey(),
                    "registry": registry_pda,
                    "agent": agent_pda,
                    "nft_mint": nft_mint,
                    "system_program": SYS_PROGRAM_ID,
                },
                signers=[self.keypair],
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
        nonce: int = 0,
    ) -> str:
        """
        Submit a response to a challenge.

        Args:
            agent_id: The agent's ID
            challenger: The challenger's pubkey
            response_hash: SHA256 hash of the response (64-char hex)
            nonce: Challenge nonce (must match the nonce used in create_challenge)

        Returns:
            Transaction signature
        """
        registry_pda, _ = self._get_registry_pda()
        agent_pda, _ = self._get_agent_pda(self.keypair.pubkey(), agent_id)
        challenge_pda, _ = self._get_challenge_pda(agent_pda, challenger, nonce)

        tx = await self.program.rpc["submit_response"](
            response_hash,
            nonce,
            ctx=Context(
                accounts={
                    "owner": self.keypair.pubkey(),
                    "registry": registry_pda,
                    "agent": agent_pda,
                    "challenge": challenge_pda,
                },
                signers=[self.keypair],
            )
        )

        logger.info(f"Challenge response submitted: {tx}")
        return str(tx)

    async def get_challenge(self, agent_pda: Pubkey, challenger: Pubkey, nonce: int = 0) -> dict:
        """Fetch a challenge account"""
        challenge_pda, _ = self._get_challenge_pda(agent_pda, challenger, nonce)
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

    async def _retry_rpc(self, coro_fn, retries: int = 3, skip_on=None):
        """
        Retry an async RPC call with exponential backoff.

        Args:
            coro_fn: Async callable (no-arg) that performs the RPC call
            retries: Number of retry attempts
            skip_on: String or list of strings - if error contains any, don't retry (raise immediately)

        Returns:
            Result of the successful call
        """
        delays = [1, 2, 4]
        last_err = None
        # Normalize skip_on to a list
        if isinstance(skip_on, str):
            skip_on = [skip_on]
        for attempt in range(retries):
            try:
                return await coro_fn()
            except Exception as e:
                last_err = e
                err_str = str(e).lower()
                if skip_on and any(pat.lower() in err_str for pat in skip_on):
                    raise  # Not transient, don't retry
                if attempt < retries - 1:
                    delay = delays[attempt] if attempt < len(delays) else delays[-1]
                    logger.warning(f"RPC retry {attempt + 1}/{retries} after {delay}s: {str(e)[:80]}")
                    await asyncio.sleep(delay)
        raise last_err

    async def discover_agents(self, max_agents: int = 50, known_owners: list[str] = None) -> list[dict]:
        """
        Discover all registered agents on the network using getProgramAccounts.

        Uses a single RPC call with discriminator filter instead of O(owners*agents)
        individual account fetches. Falls back to linear scan on error.

        Args:
            max_agents: Maximum number of agents to fetch
            known_owners: Not used in batch mode (kept for API compat)

        Returns:
            List of agent dictionaries
        """
        try:
            return await self._discover_agents_batch(max_agents)
        except Exception as e:
            logger.warning(f"Batch discovery failed, falling back to linear scan: {e}")
            return await self._discover_agents_linear(max_agents, known_owners)

    async def _discover_agents_batch(self, max_agents: int = 50) -> list[dict]:
        """
        Discover agents via getProgramAccounts (1 RPC call instead of ~20+).

        Filters by AgentAccount discriminator and parses accounts in-memory.
        """
        import base58 as b58lib
        disc_b58 = b58lib.b58encode(AGENT_ACCOUNT_DISCRIMINATOR).decode()

        # Single RPC call with memcmp filter on Anchor discriminator
        resp = await self.client.get_program_accounts(
            self.program_id,
            encoding="base64",
            filters=[
                MemcmpOpts(offset=0, bytes=disc_b58),
            ],
        )

        agents = []
        for account_info in resp.value[:max_agents]:
            try:
                pda = str(account_info.pubkey)
                data = account_info.account.data
                agent = self._parse_agent_account(data)
                agent["pda"] = pda
                agents.append(agent)
            except Exception as e:
                logger.debug(f"Failed to parse agent account {account_info.pubkey}: {e}")
                continue

        logger.info(f"Batch discovered {len(agents)} agents (1 RPC call)")
        return agents

    @staticmethod
    def _parse_agent_account(data: bytes) -> dict:
        """
        Parse raw AgentAccount bytes (Anchor format).

        Layout after 8-byte discriminator:
          u64 agent_id
          pubkey owner (32 bytes)
          string name (4-byte len + utf8)
          string model_hash (4-byte len + utf8)
          string capabilities (4-byte len + utf8)
          u32 reputation_score
          u32 challenges_passed
          u32 challenges_failed
          bool verified (1 byte)
          i64 created_at
          i64 updated_at
          pubkey nft_mint (32 bytes)
          u8 bump
        """
        offset = 8  # skip discriminator

        agent_id = struct.unpack_from("<Q", data, offset)[0]
        offset += 8

        owner = Pubkey.from_bytes(data[offset:offset + 32])
        offset += 32

        def read_string(d: bytes, off: int) -> tuple[str, int]:
            length = struct.unpack_from("<I", d, off)[0]
            off += 4
            s = d[off:off + length].decode("utf-8", errors="replace")
            return s, off + length

        name, offset = read_string(data, offset)
        model_hash, offset = read_string(data, offset)
        capabilities, offset = read_string(data, offset)

        reputation_score = struct.unpack_from("<I", data, offset)[0]
        offset += 4
        challenges_passed = struct.unpack_from("<I", data, offset)[0]
        offset += 4
        challenges_failed = struct.unpack_from("<I", data, offset)[0]
        offset += 4
        verified = bool(data[offset])
        offset += 1
        # created_at, updated_at (i64 each)
        offset += 16
        nft_mint = Pubkey.from_bytes(data[offset:offset + 32])
        offset += 32

        return {
            "agent_id": agent_id,
            "owner": str(owner),
            "name": name,
            "model_hash": model_hash,
            "capabilities": capabilities,
            "reputation_score": reputation_score,
            "challenges_passed": challenges_passed,
            "challenges_failed": challenges_failed,
            "verified": verified,
            "nft_mint": str(nft_mint),
            "index": agent_id,
        }

    async def _discover_agents_linear(self, max_agents: int = 50, known_owners: list[str] = None) -> list[dict]:
        """Fallback: linear scan of agents by owner (old method)."""
        registry_state = await self._retry_rpc(self.get_registry_state)
        total_agents = registry_state["total_agents"]
        admin = Pubkey.from_string(registry_state["admin"])

        owners = [admin]
        if known_owners:
            for owner_str in known_owners:
                try:
                    owners.append(Pubkey.from_string(owner_str))
                except Exception:
                    pass
        if self.keypair.pubkey() not in owners:
            owners.append(self.keypair.pubkey())

        agents = []
        seen_pdas = set()

        for owner in owners:
            consecutive_misses = 0
            for i in range(min(total_agents + 1, max_agents)):
                try:
                    agent = await self._retry_rpc(
                        lambda o=owner, idx=i: self.get_agent(o, idx),
                        skip_on=["does not exist", "seeds constraint"],
                    )
                    pda = str(self._get_agent_pda(owner, i)[0])
                    if pda not in seen_pdas:
                        agent["pda"] = pda
                        agent["index"] = i
                        agents.append(agent)
                        seen_pdas.add(pda)
                    consecutive_misses = 0
                except Exception:
                    consecutive_misses += 1
                    if consecutive_misses >= 2:
                        break

        logger.info(f"Linear discovered {len(agents)} agents (scanned {len(owners)} owners)")
        return agents

    async def create_challenge_for_agent(
        self,
        target_agent_pda: Pubkey,
        question: str,
        expected_hash: str,
        nonce: int = 0,
    ) -> tuple[str, int]:
        """
        Create a challenge for another agent.

        Deployed program uses one PDA per agent-challenger pair (no nonce in seeds).
        If a previous challenge PDA exists, returns None (one active challenge per pair).

        Args:
            target_agent_pda: The target agent's PDA
            question: The challenge question
            expected_hash: SHA256 hash of expected answer
            nonce: Stored in account data (not used in PDA seeds)

        Returns:
            Tuple of (transaction signature, nonce used)
        """
        if nonce == 0:
            nonce = int(time.time())
        challenge_pda, _ = self._get_challenge_pda(target_agent_pda, self.keypair.pubkey(), nonce)

        logger.info(
            f"create_challenge: target={target_agent_pda}, "
            f"challenger={self.keypair.pubkey()}, nonce={nonce}, "
            f"challenge_pda={challenge_pda}"
        )

        async def _do_create():
            return await self.program.rpc["create_challenge"](
                question,
                expected_hash,
                nonce,
                ctx=Context(
                    accounts={
                        "challenger": self.keypair.pubkey(),
                        "agent": target_agent_pda,
                        "challenge": challenge_pda,
                        "system_program": SYS_PROGRAM_ID,
                    },
                    signers=[self.keypair],
                )
            )

        tx = await self._retry_rpc(_do_create, retries=3, skip_on=["already in use", "seeds constraint"])

        logger.info(f"Challenge created for agent {target_agent_pda}: {tx} (nonce={nonce})")
        return str(tx), nonce

    async def close_challenge(
        self,
        target_agent_pda: Pubkey,
        nonce: int,
    ) -> str:
        """
        Close a resolved challenge PDA and reclaim rent (~0.012 SOL).

        Critical mainnet optimization: reduces per-challenge cost from 0.012 SOL to ~0 SOL.
        Can only close challenges that are no longer Pending (Passed/Failed/Expired).

        Args:
            target_agent_pda: The challenged agent's PDA
            nonce: The challenge nonce (must match create_challenge)

        Returns:
            Transaction signature
        """
        challenge_pda, _ = self._get_challenge_pda(target_agent_pda, self.keypair.pubkey(), nonce)

        tx = await self.program.rpc["close_challenge"](
            nonce,
            ctx=Context(
                accounts={
                    "challenger": self.keypair.pubkey(),
                    "agent": target_agent_pda,
                    "challenge": challenge_pda,
                },
                signers=[self.keypair],
            )
        )

        logger.info(f"Challenge closed, rent reclaimed: agent={target_agent_pda}, nonce={nonce}, tx={tx}")
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

    # ============================================
    # Merkle Audit Methods (Efficient Batch Logging)
    # ============================================

    async def get_merkle_summary(self, agent_pda: Pubkey) -> Optional[dict]:
        """
        Get the Merkle audit summary for an agent.

        Returns:
            Summary dict or None if no audits exist
        """
        summary_pda, _ = self._get_merkle_summary_pda(agent_pda)

        try:
            summary = await self.program.account["MerkleAuditSummary"].fetch(summary_pda)
            return {
                "agent": str(summary.agent),
                "total_batches": summary.total_batches,
                "total_entries": summary.total_entries,
                "last_batch_at": summary.last_batch_at,
            }
        except Exception as e:
            logger.debug(f"No Merkle summary found: {e}")
            return None

    async def store_merkle_audit(
        self,
        agent_pda: str,
        merkle_root: list[int],
        entries_count: int,
    ) -> str:
        """
        Store a Merkle audit root on-chain.

        Uses local batch index cache to avoid stale RPC reads between
        consecutive stores (Solana RPC can return cached/stale data).
        """
        agent_pubkey = Pubkey.from_string(agent_pda)

        # Use cached batch index if available, otherwise read from chain
        if agent_pda in self._merkle_batch_cache:
            batch_index = self._merkle_batch_cache[agent_pda]
            logger.info(f"store_merkle_audit: using cached batch_index={batch_index}")
        else:
            summary = await self.get_merkle_summary(agent_pubkey)
            batch_index = summary["total_batches"] if summary else 0
            logger.info(f"store_merkle_audit: read on-chain batch_index={batch_index}")

        summary_pda, _ = self._get_merkle_summary_pda(agent_pubkey)
        root_pda, _ = self._get_merkle_root_pda(agent_pubkey, batch_index)

        logger.info(
            f"store_merkle_audit: agent_pda={agent_pda}, "
            f"batch_index={batch_index}, root_pda={root_pda}, "
            f"entries_count={entries_count}"
        )

        root_bytes = bytes(merkle_root)

        tx = await self.program.rpc["store_merkle_audit"](
            list(root_bytes),  # [u8; 32]
            entries_count,
            ctx=Context(
                accounts={
                    "owner": self.keypair.pubkey(),
                    "agent": agent_pubkey,
                    "audit_summary": summary_pda,
                    "audit_root": root_pda,
                    "system_program": SYS_PROGRAM_ID,
                },
                signers=[self.keypair],
            )
        )

        # On success, cache the next batch index
        self._merkle_batch_cache[agent_pda] = batch_index + 1
        logger.info(f"Merkle audit root stored: batch={batch_index}, entries={entries_count}, tx={tx}")
        return str(tx)

    async def get_merkle_root(self, agent_pda: Pubkey, batch_index: int) -> Optional[dict]:
        """
        Get a specific Merkle audit root.

        Args:
            agent_pda: The agent's PDA
            batch_index: The batch index

        Returns:
            Merkle root dict or None
        """
        root_pda, _ = self._get_merkle_root_pda(agent_pda, batch_index)

        try:
            root = await self.program.account["MerkleAuditRoot"].fetch(root_pda)
            return {
                "agent": str(root.agent),
                "merkle_root": bytes(root.merkle_root).hex(),
                "entries_count": root.entries_count,
                "timestamp": root.timestamp,
                "batch_index": root.batch_index,
            }
        except Exception as e:
            logger.debug(f"Merkle root not found: {e}")
            return None
