"""Configuration for the PoI Demo Agent"""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# Solana configuration
SOLANA_RPC_URL = os.getenv("SOLANA_RPC_URL", "https://api.devnet.solana.com")
PROGRAM_ID = os.getenv("PROGRAM_ID", "EQ2Zv3cTDBzY1PafPz2WDoup6niUv6X8t9id4PBACL38")

# Agent configuration
AGENT_NAME = os.getenv("AGENT_NAME", "PoI Demo Agent")
AGENT_CAPABILITIES = os.getenv("AGENT_CAPABILITIES", "analysis,coding,verification")

# Model configuration
MODEL_PATH = os.getenv("MODEL_PATH", "")  # Path to GGUF model file
MODEL_HASH = os.getenv("MODEL_HASH", "")  # Expected SHA256 hash

# Wallet configuration
WALLET_PATH = os.getenv(
    "WALLET_PATH",
    str(Path.home() / ".config" / "solana" / "id.json")
)

# API server configuration
API_HOST = os.getenv("API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("API_PORT", "8080"))

# IDL path
IDL_PATH = Path(__file__).parent.parent / "target" / "idl" / "agent_registry.json"
