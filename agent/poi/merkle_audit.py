"""
Merkle Audit Batcher - Efficient on-chain audit logging

Instead of creating an on-chain account for every action (expensive),
we batch actions and store only the Merkle root on-chain.

Pattern:
1. Collect audit entries locally with hashes
2. When batch is full (or on flush), compute Merkle root
3. Store single root on-chain (1 tx instead of N)
4. Full logs remain off-chain, verifiable via Merkle proofs

Cost savings: ~99.97% reduction in transaction costs
"""

import hashlib
import json
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, List, Any
from pathlib import Path
import logging

logger = logging.getLogger(__name__)


class ActionType(str, Enum):
    """Types of auditable actions"""
    AGENT_REGISTERED = "agent_registered"
    AGENT_UPDATED = "agent_updated"
    AGENT_VERIFIED = "agent_verified"
    CHALLENGE_CREATED = "challenge_created"
    CHALLENGE_PASSED = "challenge_passed"
    CHALLENGE_FAILED = "challenge_failed"
    CHALLENGE_EXPIRED = "challenge_expired"
    EVALUATION_COMPLETED = "evaluation_completed"
    REPUTATION_CHANGED = "reputation_changed"
    CROSS_AGENT_CHALLENGE = "cross_agent_challenge"
    SECURITY_ALERT = "security_alert"


@dataclass
class AuditEntry:
    """A single audit entry with hash"""
    action_type: ActionType
    timestamp: int
    details: dict
    entry_hash: str = field(default="")

    def __post_init__(self):
        if not self.entry_hash:
            self.entry_hash = self._compute_hash()

    def _compute_hash(self) -> str:
        """Compute SHA256 hash of this entry"""
        data = {
            "action_type": self.action_type.value,
            "timestamp": self.timestamp,
            "details": self.details
        }
        return hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()

    def to_dict(self) -> dict:
        return {
            "action_type": self.action_type.value,
            "timestamp": self.timestamp,
            "details": self.details,
            "entry_hash": self.entry_hash
        }


def compute_merkle_root(hashes: List[str]) -> str:
    """
    Compute Merkle root from a list of hashes.

    Uses standard binary Merkle tree construction:
    - Pair adjacent hashes and hash them together
    - If odd number, duplicate the last hash
    - Repeat until single root remains
    """
    if not hashes:
        return "0" * 64  # Empty tree root

    if len(hashes) == 1:
        return hashes[0]

    # Convert hex strings to bytes for hashing
    current_level = [bytes.fromhex(h) for h in hashes]

    while len(current_level) > 1:
        next_level = []

        for i in range(0, len(current_level), 2):
            left = current_level[i]
            # If odd, duplicate last element
            right = current_level[i + 1] if i + 1 < len(current_level) else left

            # Hash pair together
            combined = hashlib.sha256(left + right).digest()
            next_level.append(combined)

        current_level = next_level

    return current_level[0].hex()


def compute_merkle_proof(hashes: List[str], index: int) -> List[dict]:
    """
    Compute Merkle proof for a specific entry.

    Returns list of {position: "left"|"right", hash: "..."} for verification.
    """
    if not hashes or index >= len(hashes):
        return []

    proof = []
    current_level = [bytes.fromhex(h) for h in hashes]
    current_index = index

    while len(current_level) > 1:
        next_level = []

        for i in range(0, len(current_level), 2):
            left = current_level[i]
            right = current_level[i + 1] if i + 1 < len(current_level) else left

            # If current_index is in this pair, record the sibling
            if i == current_index or i + 1 == current_index:
                if current_index % 2 == 0:
                    # We're on the left, sibling is on right
                    proof.append({
                        "position": "right",
                        "hash": right.hex()
                    })
                else:
                    # We're on the right, sibling is on left
                    proof.append({
                        "position": "left",
                        "hash": left.hex()
                    })

            combined = hashlib.sha256(left + right).digest()
            next_level.append(combined)

        current_level = next_level
        current_index = current_index // 2

    return proof


def verify_merkle_proof(entry_hash: str, proof: List[dict], root: str) -> bool:
    """Verify that an entry is included in a Merkle tree with given root."""
    current = bytes.fromhex(entry_hash)

    for step in proof:
        sibling = bytes.fromhex(step["hash"])
        if step["position"] == "left":
            current = hashlib.sha256(sibling + current).digest()
        else:
            current = hashlib.sha256(current + sibling).digest()

    return current.hex() == root


class AuditBatcher:
    """
    Batches audit entries and periodically stores Merkle roots on-chain.

    Usage:
        batcher = AuditBatcher(client, agent_pda, batch_size=10)

        # Log actions
        batcher.log(ActionType.CHALLENGE_PASSED, {"challenge_id": "..."})
        batcher.log(ActionType.EVALUATION_COMPLETED, {"domain": "defi", "score": 80})

        # Flush to chain when batch full or explicitly
        await batcher.flush()
    """

    def __init__(
        self,
        solana_client: Any = None,
        agent_pda: str = None,
        batch_size: int = 10,
        auto_flush: bool = True,
        storage_path: Optional[Path] = None
    ):
        self.solana_client = solana_client
        self.agent_pda = agent_pda
        self.batch_size = batch_size
        self.auto_flush = auto_flush
        self.storage_path = storage_path or Path("audit_logs")

        self.pending_entries: List[AuditEntry] = []
        self.flushed_batches: List[dict] = []
        self.total_entries_logged = 0
        self.total_batches_stored = 0

        # Ensure storage directory exists
        self.storage_path.mkdir(parents=True, exist_ok=True)

    def log(
        self,
        action_type: ActionType,
        details: dict,
        timestamp: Optional[int] = None
    ) -> AuditEntry:
        """
        Log an audit entry.

        Args:
            action_type: Type of action
            details: Action details (will be hashed)
            timestamp: Optional timestamp (defaults to now)

        Returns:
            The created AuditEntry with hash
        """
        entry = AuditEntry(
            action_type=action_type,
            timestamp=timestamp or int(time.time()),
            details=details
        )

        self.pending_entries.append(entry)
        self.total_entries_logged += 1

        logger.info(
            f"Audit logged: {action_type.value} | hash={entry.entry_hash[:16]}... | "
            f"pending={len(self.pending_entries)}/{self.batch_size}"
        )

        return entry

    def get_batch_hashes(self) -> List[str]:
        """Get list of entry hashes in current batch."""
        return [e.entry_hash for e in self.pending_entries]

    def compute_current_root(self) -> str:
        """Compute Merkle root of current pending batch."""
        return compute_merkle_root(self.get_batch_hashes())

    def should_flush(self) -> bool:
        """Check if batch is ready to be flushed."""
        return len(self.pending_entries) >= self.batch_size

    async def flush(self, force: bool = False) -> Optional[dict]:
        """
        Flush current batch to chain.

        Args:
            force: Flush even if batch not full

        Returns:
            Batch info with Merkle root and tx signature, or None if nothing to flush
        """
        if not self.pending_entries:
            logger.debug("No entries to flush")
            return None

        if not force and len(self.pending_entries) < self.batch_size:
            logger.debug(f"Batch not full ({len(self.pending_entries)}/{self.batch_size}), skipping flush")
            return None

        # Compute Merkle root
        hashes = self.get_batch_hashes()
        merkle_root = compute_merkle_root(hashes)
        entries_count = len(self.pending_entries)

        logger.info(
            f"Flushing batch: {entries_count} entries | root={merkle_root[:16]}..."
        )

        # Store entries locally for proof generation
        batch_data = {
            "batch_index": self.total_batches_stored,
            "merkle_root": merkle_root,
            "entries_count": entries_count,
            "timestamp": int(time.time()),
            "entries": [e.to_dict() for e in self.pending_entries],
            "tx_signature": None,
            "on_chain": False,
        }

        # Store Merkle root on-chain if client is available
        tx_signature = None
        if self.solana_client and self.agent_pda:
            logger.info(
                f"Attempting on-chain store: agent_pda={self.agent_pda}, "
                f"entries_count={entries_count} (type={type(entries_count).__name__}), "
                f"root={merkle_root[:16]}..."
            )
            try:
                # Try up to 3 times: on seeds constraint error, invalidate cache and retry
                for attempt in range(3):
                    try:
                        logger.info(f"On-chain store attempt {attempt + 1}/3...")
                        tx_signature = await self._store_root_on_chain(merkle_root, entries_count)
                        batch_data["tx_signature"] = tx_signature
                        batch_data["on_chain"] = True
                        logger.info(f"Merkle root stored on-chain: tx={tx_signature}")
                        break
                    except Exception as e:
                        error_str = str(e)
                        logger.warning(
                            f"On-chain store attempt {attempt + 1} failed: "
                            f"{type(e).__name__}: {error_str}"
                        )
                        if "2006" in error_str or "seeds constraint" in error_str.lower():
                            # Stale batch index cache — invalidate and re-read from chain
                            logger.info("Seeds constraint error — invalidating batch index cache")
                            if hasattr(self.solana_client, '_merkle_batch_cache'):
                                self.solana_client._merkle_batch_cache.pop(self.agent_pda, None)
                            import asyncio
                            await asyncio.sleep(3)
                        elif attempt < 2:
                            import asyncio
                            await asyncio.sleep(2)
                        else:
                            raise
            except Exception as e:
                error_msg = f"{type(e).__name__}: {e}"
                logger.error(f"Failed to store root on-chain (all attempts): {error_msg}")
                batch_data["store_error"] = error_msg[:500]
                # Still save locally even if on-chain fails
        else:
            reason = []
            if not self.solana_client:
                reason.append("no solana_client")
            if not self.agent_pda:
                reason.append("no agent_pda")
            logger.warning(f"No Solana client - storing batch locally only ({', '.join(reason)})")

        # Save batch to local storage
        self._save_batch(batch_data)

        # Update state
        self.flushed_batches.append(batch_data)
        self.total_batches_stored += 1
        self.pending_entries = []

        return batch_data

    async def retry_failed_batches(self) -> int:
        """Retry storing on-chain for recent batches that previously failed.
        Only retries the last MAX_RETRY batches to avoid RPC rate limits.
        Returns number of batches successfully stored."""
        if not self.solana_client or not self.agent_pda:
            logger.info("No Solana client/agent_pda for Merkle retry")
            return 0

        # Only retry recent batches (last 10) to avoid flooding RPC
        MAX_RETRY = 10
        failed_batches = [
            b for b in self.flushed_batches
            if b.get("tx_signature") is None
        ]
        to_retry = failed_batches[-MAX_RETRY:]

        if not to_retry:
            return 0

        logger.info(
            f"Merkle retry: {len(failed_batches)} total failed, "
            f"retrying last {len(to_retry)}"
        )

        retried = 0
        consecutive_failures = 0
        for batch in to_retry:
            try:
                tx_sig = await self._store_root_on_chain(
                    batch["merkle_root"], batch["entries_count"]
                )
                batch["tx_signature"] = tx_sig
                batch["on_chain"] = True
                batch.pop("store_error", None)
                self._save_batch(batch)
                retried += 1
                consecutive_failures = 0
                logger.info(
                    f"Merkle retry OK: batch {batch['batch_index']} -> tx={tx_sig}"
                )
                import asyncio
                await asyncio.sleep(3)  # Wait for on-chain state to propagate
            except Exception as e:
                error_str = str(e)
                consecutive_failures += 1
                logger.warning(
                    f"Merkle retry FAILED: batch {batch['batch_index']}: {error_str}"
                )
                # On seeds constraint, invalidate cache so next attempt re-reads from chain
                if "2006" in error_str or "seeds constraint" in error_str.lower():
                    if hasattr(self.solana_client, '_merkle_batch_cache'):
                        self.solana_client._merkle_batch_cache.pop(self.agent_pda, None)
                if consecutive_failures >= 3:
                    logger.warning("Merkle retry: 3 consecutive failures, stopping")
                    break
                import asyncio
                await asyncio.sleep(4)  # Longer wait to let chain state propagate
        return retried

    async def _store_root_on_chain(self, merkle_root: str, entries_count: int) -> str:
        """Store Merkle root on Solana via store_merkle_audit instruction."""
        # Convert hex string to bytes array
        root_bytes = bytes.fromhex(merkle_root)

        # Call the Solana client method
        tx = await self.solana_client.store_merkle_audit(
            agent_pda=self.agent_pda,
            merkle_root=list(root_bytes),
            entries_count=entries_count
        )

        return tx

    def _save_batch(self, batch_data: dict) -> None:
        """Save batch data to local storage for proof generation."""
        filename = f"batch_{batch_data['batch_index']:06d}.json"
        filepath = self.storage_path / filename

        with open(filepath, 'w') as f:
            json.dump(batch_data, f, indent=2)

        logger.debug(f"Batch saved to {filepath}")

    def get_proof_for_entry(self, entry_hash: str) -> Optional[dict]:
        """
        Get Merkle proof for a specific entry.

        Returns proof data that can be verified against on-chain root.
        """
        # Search in pending entries
        hashes = self.get_batch_hashes()
        if entry_hash in hashes:
            index = hashes.index(entry_hash)
            return {
                "batch": "pending",
                "merkle_root": self.compute_current_root(),
                "proof": compute_merkle_proof(hashes, index),
                "on_chain": False
            }

        # Search in flushed batches
        for batch in self.flushed_batches:
            batch_hashes = [e["entry_hash"] for e in batch["entries"]]
            if entry_hash in batch_hashes:
                index = batch_hashes.index(entry_hash)
                return {
                    "batch_index": batch["batch_index"],
                    "merkle_root": batch["merkle_root"],
                    "proof": compute_merkle_proof(batch_hashes, index),
                    "tx_signature": batch.get("tx_signature"),
                    "on_chain": batch.get("tx_signature") is not None
                }

        return None

    def get_stats(self) -> dict:
        """Get audit statistics."""
        return {
            "total_entries_logged": self.total_entries_logged,
            "total_batches_stored": self.total_batches_stored,
            "pending_entries": len(self.pending_entries),
            "batch_size": self.batch_size,
            "next_flush_at": self.batch_size - len(self.pending_entries)
        }
