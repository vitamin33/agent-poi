import { NextResponse } from "next/server";

/**
 * GET /api/agents
 * Returns information about the agent registry
 */
export async function GET() {
  return NextResponse.json({
    registry: {
      program_id: "EQ2Zv3cTDBzY1PafPz2WDoup6niUv6X8t9id4PBACL38",
      network: "devnet"
    },
    registration: {
      description: "Register AI agents on-chain with model hash verification",
      required_fields: {
        name: "Agent display name (max 64 chars)",
        model_hash: "SHA256 hash of model file (sha256:...)",
        capabilities: "Comma-separated list of capabilities (max 256 chars)"
      },
      on_chain_data: {
        agent_id: "Unique identifier",
        owner: "Wallet public key",
        reputation_score: "0-10000 (starts at 5000)",
        challenges_passed: "Number of successful challenges",
        challenges_failed: "Number of failed challenges",
        verified: "Admin verification status",
        created_at: "Unix timestamp",
        updated_at: "Unix timestamp"
      }
    },
    pda_derivation: {
      seeds: ["agent", "owner_pubkey", "agent_id_bytes"],
      description: "Agent accounts are PDAs derived from owner and agent_id"
    },
    verification_flow: {
      step1: "Register agent with model_hash",
      step2: "Challenger creates challenge with question + expected_hash",
      step3: "Agent responds with answer, system hashes and compares",
      step4: "Pass: +100 reputation, Fail: -50 reputation",
      step5: "Admin can verify agents for trusted status"
    },
    instructions: {
      register_agent: "Create new agent account",
      create_challenge: "Challenge an agent's identity",
      submit_response: "Respond to a challenge",
      verify_agent: "Admin verification",
      update_agent: "Update agent metadata",
      log_audit: "Log audit entry (SentinelAgent)"
    }
  });
}
