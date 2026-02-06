import { NextResponse } from "next/server";

/**
 * GET /api/status
 * Returns the status of the Agent PoI program
 */
export async function GET() {
  return NextResponse.json({
    name: "Agent Proof-of-Intelligence",
    version: "1.0.0",
    program_id: "EQ2Zv3cTDBzY1PafPz2WDoup6niUv6X8t9id4PBACL38",
    network: "devnet",
    status: "operational",
    capabilities: [
      "agent_registration",
      "identity_verification",
      "challenge_response",
      "slm_evaluation",
      "reputation_tracking",
      "audit_trail",
      "nft_identity"
    ],
    evaluation_domains: ["defi", "solana", "security"],
    passing_score: 60,
    compliance: {
      eu_ai_act: true,
      audit_trail: "on-chain"
    },
    links: {
      skill_json: "/skill.json",
      skill_md: "/skill.md",
      github: "https://github.com/vitaliiserbynassisterr/assisterr-agent-hackathon"
    }
  });
}
