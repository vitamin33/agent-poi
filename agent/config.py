"""Configuration for the PoI Demo Agent"""
import os
import json
import tempfile
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# Solana configuration
SOLANA_RPC_URL = os.getenv("SOLANA_RPC_URL", "https://api.devnet.solana.com")
PROGRAM_ID = os.getenv("PROGRAM_ID", "EQ2Zv3cTDBzY1PafPz2WDoup6niUv6X8t9id4PBACL38")

# Agent configuration
AGENT_NAME = os.getenv("AGENT_NAME", "PoI Demo Agent")
AGENT_CAPABILITIES = os.getenv("AGENT_CAPABILITIES", "analysis,coding,verification,cross-agent-discovery")

# Model configuration
MODEL_PATH = os.getenv("MODEL_PATH", "")  # Path to GGUF model file
MODEL_HASH = os.getenv("MODEL_HASH", "")  # Expected SHA256 hash

# Wallet configuration - support JSON string from env var for deployment
WALLET_JSON = os.getenv("WALLET_JSON", "")  # JSON string of keypair array
if WALLET_JSON:
    # Write to temp file for compatibility with existing code
    _wallet_data = json.loads(WALLET_JSON)
    _temp_wallet = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False)
    json.dump(_wallet_data, _temp_wallet)
    _temp_wallet.close()
    WALLET_PATH = _temp_wallet.name
else:
    WALLET_PATH = os.getenv(
        "WALLET_PATH",
        str(Path.home() / ".config" / "solana" / "id.json")
    )

# A2A Peer Discovery - comma-separated URLs of peer agents
# Example: "https://agent-poi-alpha.onrender.com,https://agent-poi-beta.onrender.com"
AGENT_PEERS = [
    url.strip() for url in os.getenv("AGENT_PEERS", "").split(",") if url.strip()
]

# Agent personality (affects challenge question selection and response style)
AGENT_PERSONALITY = os.getenv("AGENT_PERSONALITY", "general")  # general, defi, security, solana

# Public URL of this agent (for A2A discovery)
AGENT_PUBLIC_URL = os.getenv("AGENT_PUBLIC_URL", "")

# LLM Judge configuration (for enhanced challenge scoring)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
LLM_JUDGE_MODEL = os.getenv("LLM_JUDGE_MODEL", "gpt-4o-mini")
# Default: enabled if API key is present, can be explicitly disabled
_judge_env = os.getenv("LLM_JUDGE_ENABLED", "")
if _judge_env:
    LLM_JUDGE_ENABLED = _judge_env.lower() in ("true", "1", "yes")
else:
    LLM_JUDGE_ENABLED = bool(OPENAI_API_KEY)

# API server configuration
API_HOST = os.getenv("API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("API_PORT", "8000"))

# IDL path - flexible for local dev and deployment
# IMPORTANT: Use legacy IDL format for anchorpy compatibility (Anchor 0.30+ IDL not supported)
_idl_env = os.getenv("IDL_PATH", "")
if _idl_env:
    IDL_PATH = Path(_idl_env)
else:
    # Use legacy format IDL (converted from new format for anchorpy compatibility)
    _legacy_idl = Path(__file__).parent / "idl" / "agent_registry_legacy.json"
    _local_idl = Path(__file__).parent.parent / "target" / "idl" / "agent_registry.json"
    _deploy_idl = Path(__file__).parent / "idl" / "agent_registry.json"

    # Priority: legacy format > local dev > deploy
    if _legacy_idl.exists():
        IDL_PATH = _legacy_idl
    elif _local_idl.exists():
        IDL_PATH = _local_idl
    else:
        IDL_PATH = _deploy_idl
