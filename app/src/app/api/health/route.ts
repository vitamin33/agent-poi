import { NextResponse } from "next/server";

/**
 * GET /api/health
 * Health check endpoint for A2A protocol discovery
 */
export async function GET() {
  return NextResponse.json({
    status: "healthy",
    service: "Agent PoI Dashboard",
    timestamp: new Date().toISOString(),
    solana: {
      network: "devnet",
      rpc: "https://api.devnet.solana.com",
      program_id: "EQ2Zv3cTDBzY1PafPz2WDoup6niUv6X8t9id4PBACL38"
    },
    agent_api: {
      status: "available",
      base_url: "http://localhost:8000",
      note: "Python agent must be running locally for full functionality"
    },
    features: {
      registration: true,
      challenges: true,
      evaluation: true,
      audit_trail: true,
      nft_identity: true
    }
  });
}
