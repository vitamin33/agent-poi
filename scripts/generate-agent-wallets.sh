#!/bin/bash
# Generate 3 Solana wallets for multi-agent deployment
# Each agent needs its own wallet to sign transactions independently

set -e

echo "=== Agent PoI - Multi-Agent Wallet Generator ==="
echo ""

WALLETS_DIR="agent/wallets"
mkdir -p "$WALLETS_DIR"

for AGENT in alpha beta gamma; do
  WALLET_FILE="$WALLETS_DIR/${AGENT}.json"

  if [ -f "$WALLET_FILE" ]; then
    echo "[$AGENT] Wallet already exists: $WALLET_FILE"
  else
    solana-keygen new --outfile "$WALLET_FILE" --no-bip39-passphrase --force
    echo "[$AGENT] Generated: $WALLET_FILE"
  fi

  PUBKEY=$(solana-keygen pubkey "$WALLET_FILE")
  echo "[$AGENT] Public key: $PUBKEY"

  # Try to airdrop (may fail due to rate limits)
  echo "[$AGENT] Requesting devnet airdrop..."
  solana airdrop 2 "$PUBKEY" --url devnet 2>/dev/null || echo "[$AGENT] Airdrop failed (rate limit?). Use https://faucet.solana.com/"
  echo ""
done

echo "=== Wallet JSON for Render deployment ==="
echo "Copy each wallet's JSON array content to the WALLET_JSON env var in Render"
echo ""

for AGENT in alpha beta gamma; do
  WALLET_FILE="$WALLETS_DIR/${AGENT}.json"
  PUBKEY=$(solana-keygen pubkey "$WALLET_FILE")
  echo "--- $AGENT ($PUBKEY) ---"
  cat "$WALLET_FILE"
  echo ""
  echo ""
done
