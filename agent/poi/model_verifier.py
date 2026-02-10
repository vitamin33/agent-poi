"""Model hash verification for Proof-of-Intelligence"""
from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Optional, Union
import logging

logger = logging.getLogger(__name__)


def compute_model_hash(model_path: Union[str, Path], chunk_size: int = 8192) -> str:
    """
    Compute SHA256 hash of a model file (GGUF or other format).

    Args:
        model_path: Path to the model file
        chunk_size: Size of chunks to read (default 8KB)

    Returns:
        Hash string in format "sha256:<hex_digest>"
    """
    model_path = Path(model_path)

    if not model_path.exists():
        raise FileNotFoundError(f"Model file not found: {model_path}")

    sha256 = hashlib.sha256()
    file_size = model_path.stat().st_size
    bytes_read = 0

    logger.info(f"Computing hash for model: {model_path} ({file_size / 1024 / 1024:.2f} MB)")

    with open(model_path, "rb") as f:
        for chunk in iter(lambda: f.read(chunk_size), b""):
            sha256.update(chunk)
            bytes_read += len(chunk)

            # Log progress for large files
            if file_size > 100 * 1024 * 1024:  # > 100 MB
                progress = (bytes_read / file_size) * 100
                if int(progress) % 10 == 0:
                    logger.debug(f"Hash progress: {progress:.1f}%")

    hex_digest = sha256.hexdigest()
    return f"sha256:{hex_digest}"


def verify_model(model_path: Union[str, Path], expected_hash: str) -> bool:
    """
    Verify that a model file matches the expected hash.

    Args:
        model_path: Path to the model file
        expected_hash: Expected hash in format "sha256:<hex_digest>"

    Returns:
        True if hashes match, False otherwise
    """
    try:
        actual_hash = compute_model_hash(model_path)
        matches = actual_hash == expected_hash

        if matches:
            logger.info(f"Model verification PASSED: {expected_hash[:32]}...")
        else:
            logger.warning(
                f"Model verification FAILED:\n"
                f"  Expected: {expected_hash}\n"
                f"  Actual:   {actual_hash}"
            )

        return matches
    except Exception as e:
        logger.error(f"Model verification error: {e}")
        return False


def hash_response(response: str) -> str:
    """
    Compute SHA256 hash of a challenge response.

    Args:
        response: The response string

    Returns:
        64-character hex digest (no prefix)
    """
    return hashlib.sha256(response.encode("utf-8")).hexdigest()


# Demo: Generate a deterministic "model hash" for testing without a real model
def generate_demo_model_hash(seed: str = "demo-agent") -> str:
    """
    Generate a deterministic model hash for demo purposes.

    This simulates having a real model file without requiring
    a large GGUF download.
    """
    return f"sha256:{hashlib.sha256(seed.encode()).hexdigest()}"


def generate_model_identifier_hash(provider: str, model: str) -> str:
    """
    Generate a deterministic hash from a model provider/name identifier.

    This creates a unique, verifiable hash for API-based models that don't
    have a local file to hash. The hash represents the specific model version
    the agent claims to use.

    Args:
        provider: Model provider (e.g., "anthropic", "openai", "meta")
        model: Model name (e.g., "claude-haiku-4-5", "gpt-4o-mini")

    Returns:
        Hash string in format "sha256:<hex_digest>"
    """
    identifier = f"{provider}/{model}"
    hex_digest = hashlib.sha256(identifier.encode("utf-8")).hexdigest()
    logger.info(f"Model identifier hash: {identifier} -> sha256:{hex_digest[:16]}...")
    return f"sha256:{hex_digest}"
