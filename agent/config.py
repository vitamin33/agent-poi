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

# API server configuration
API_HOST = os.getenv("API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("API_PORT", "8000"))

# IDL path - flexible for local dev and deployment
_idl_env = os.getenv("IDL_PATH", "")
if _idl_env:
    IDL_PATH = Path(_idl_env)
else:
    # Try local development path first
    _local_idl = Path(__file__).parent.parent / "target" / "idl" / "agent_registry.json"
    _deploy_idl = Path(__file__).parent / "idl" / "agent_registry.json"
    IDL_PATH = _local_idl if _local_idl.exists() else _deploy_idl
