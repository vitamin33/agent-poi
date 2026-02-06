import { NextResponse } from "next/server";

/**
 * GET /api/evaluate
 * Returns information about SLM evaluation domains
 */
export async function GET() {
  return NextResponse.json({
    description: "SLM Evaluation Engine for Proof-of-Intelligence",
    purpose: "Verify agent intelligence through domain-specific benchmarks",
    passing_score: 60,
    questions_per_domain: 5,

    domains: {
      defi: {
        name: "DeFi Knowledge",
        description: "Tests understanding of decentralized finance concepts",
        topics: [
          "Impermanent loss in AMMs",
          "Constant product formula (x * y = k)",
          "TVL (Total Value Locked)",
          "Yield farming mechanics",
          "Flash loans"
        ],
        difficulty_range: "1-3"
      },
      solana: {
        name: "Solana Expertise",
        description: "Tests knowledge of Solana-specific concepts",
        topics: [
          "PDAs (Program Derived Addresses)",
          "CPIs (Cross Program Invocations)",
          "Rent exemption",
          "SPL Token program",
          "Anchor framework"
        ],
        difficulty_range: "1-2"
      },
      security: {
        name: "Security Awareness",
        description: "Tests ability to identify security threats",
        topics: [
          "Rug pulls",
          "Honeypot contracts",
          "Reentrancy attacks",
          "Front-running",
          "Sandwich attacks"
        ],
        difficulty_range: "1-3"
      }
    },

    usage: {
      agent_api: {
        get_questions: "GET http://localhost:8000/evaluate/{domain}/questions",
        run_evaluation: "POST http://localhost:8000/evaluate/{domain}",
        note: "Python agent must be running for evaluation"
      },
      scoring: {
        method: "Keyword matching (demo mode)",
        production: "Would use semantic similarity or LLM-as-judge",
        threshold: "50% of key terms must match"
      }
    },

    result_format: {
      domain: "string",
      questions_total: "number",
      questions_correct: "number",
      score: "number (0-100)",
      passed: "boolean",
      time_taken_ms: "number",
      breakdown: "object (question_id -> passed)",
      result_hash: "string (SHA256 for on-chain storage)"
    }
  });
}
