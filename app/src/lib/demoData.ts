/**
 * Static demo data for dashboard fallback when Python agents aren't running.
 * Shapes match real API responses from multi_main.py endpoints.
 */

const now = new Date().toISOString();
const ago = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

/* ------------------------------------------------------------------ */
/*  /alpha/peers  (PeersResponse)                                      */
/* ------------------------------------------------------------------ */
export const DEMO_PEERS = {
  agent_name: "PoI-Alpha",
  configured_peers: [
    "http://localhost:10000/beta",
    "http://localhost:10000/gamma",
  ],
  discovered_peers: 3,
  online_peers: 3,
  peers: [
    {
      name: "PoI-Alpha",
      url: "http://localhost:10000/alpha",
      status: "online" as const,
      last_seen: ago(1),
      agent_id: 0,
      owner: "DemoOwner1111111111111111111111111111111111",
      reputation: 5200,
      verified: true,
      version: "2.0.0-multi",
      capabilities: "defi-analysis,yield-farming,amm-math,cross-agent-discovery",
      personality: "defi",
      model: "claude-3-haiku-20240307",
    },
    {
      name: "PoI-Beta",
      url: "http://localhost:10000/beta",
      status: "online" as const,
      last_seen: ago(2),
      agent_id: 1,
      owner: "DemoOwner2222222222222222222222222222222222",
      reputation: 5100,
      verified: true,
      version: "2.0.0-multi",
      capabilities:
        "security-audit,vulnerability-scan,threat-detection,cross-agent-discovery",
      personality: "security",
      model: "claude-haiku-4-5-20251001",
    },
    {
      name: "PoI-Gamma",
      url: "http://localhost:10000/gamma",
      status: "online" as const,
      last_seen: ago(3),
      agent_id: 2,
      owner: "DemoOwner3333333333333333333333333333333333",
      reputation: 4900,
      verified: false,
      version: "2.0.0-multi",
      capabilities:
        "solana-dev,pda-analysis,anchor-expert,cross-agent-discovery",
      personality: "solana",
      model: "claude-sonnet-4-5-20250929",
    },
  ],
};

/* ------------------------------------------------------------------ */
/*  /alpha/status  (AgentStatusResponse)                               */
/* ------------------------------------------------------------------ */
export const DEMO_STATUS = {
  name: "PoI-Alpha",
  reputation_score: 5200,
  challenges_passed: 12,
  challenges_failed: 2,
  verified: true,
  agent_id: 0,
};

/* ------------------------------------------------------------------ */
/*  /alpha/a2a/interactions  (InteractionsResponse)                     */
/* ------------------------------------------------------------------ */
export const DEMO_INTERACTIONS = {
  agent_name: "PoI-Alpha",
  a2a_protocol: true,
  summary: {
    total_interactions: 5,
    successful_on_chain: 2,
    http_only: 3,
    unique_peers: 2,
  },
  recent_interactions: [
    {
      timestamp: ago(3),
      challenger: "PoI-Alpha",
      target: "PoI-Beta",
      target_url: "http://localhost:10000/beta",
      question:
        "Explain how Solana's Proof of History consensus mechanism works and its advantages.",
      question_domain: "solana",
      question_difficulty: "medium",
      steps: [
        {
          step: "a2a_http_challenge",
          status: "success",
          peer_answer_preview:
            "Proof of History (PoH) is a cryptographic clock that creates a verifiable ordering of events without requiring all validators to communicate. It uses a sequential SHA-256 hash chain...",
          peer_answer_hash: "a1b2c3d4e5f6...",
        },
        {
          step: "llm_judge_scoring",
          status: "scored",
          score: 82,
          explanation:
            "Comprehensive answer covering PoH mechanics and advantages. Minor gaps in validator synchronization details.",
          method: "llm",
        },
        {
          step: "on_chain_challenge",
          status: "created",
          tx: "5demoTx1111111111111111111111111111111111111111111111111111111111",
          target_pda: "DemoPDA1111111111111111111111111111111111",
        },
        {
          step: "on_chain_submit",
          status: "success",
          tx: "5demoTx2222222222222222222222222222222222222222222222222222222222",
          peer_new_reputation: 5150,
        },
      ],
      completed_at: ago(3),
      on_chain_tx:
        "5demoTx1111111111111111111111111111111111111111111111111111111111",
      submit_tx:
        "5demoTx2222222222222222222222222222222222222222222222222222222222",
      judge_score: 82,
    },
    {
      timestamp: ago(5),
      challenger: "PoI-Beta",
      target: "PoI-Gamma",
      target_url: "http://localhost:10000/gamma",
      question:
        "What are the key security considerations when implementing a Solana program with PDAs?",
      question_domain: "security",
      question_difficulty: "hard",
      steps: [
        {
          step: "a2a_http_challenge",
          status: "success",
          peer_answer_preview:
            "Key security considerations for Solana PDAs include: 1) Always verify PDA seeds match expected derivation, 2) Check for account ownership...",
          peer_answer_hash: "b2c3d4e5f6a7...",
        },
        {
          step: "llm_judge_scoring",
          status: "scored",
          score: 75,
          explanation:
            "Good coverage of PDA security patterns. Missed some edge cases around re-initialization attacks.",
          method: "llm",
        },
        {
          step: "on_chain_challenge",
          status: "created",
          tx: "5demoTx3333333333333333333333333333333333333333333333333333333333",
          target_pda: "DemoPDA2222222222222222222222222222222222",
        },
        {
          step: "on_chain_submit",
          status: "success",
          tx: "5demoTx4444444444444444444444444444444444444444444444444444444444",
          peer_new_reputation: 4950,
        },
      ],
      completed_at: ago(5),
      on_chain_tx:
        "5demoTx3333333333333333333333333333333333333333333333333333333333",
      submit_tx:
        "5demoTx4444444444444444444444444444444444444444444444444444444444",
      judge_score: 75,
    },
    {
      timestamp: ago(8),
      challenger: "PoI-Gamma",
      target: "PoI-Alpha",
      target_url: "http://localhost:10000/alpha",
      question:
        "Describe impermanent loss in AMM liquidity pools and strategies to mitigate it.",
      question_domain: "defi",
      question_difficulty: "hard",
      steps: [
        {
          step: "a2a_http_challenge",
          status: "success",
          peer_answer_preview:
            "Impermanent loss occurs when the price ratio of tokens in a liquidity pool changes relative to when they were deposited. The divergence between holding vs providing liquidity...",
          peer_answer_hash: "c3d4e5f6a7b8...",
        },
        {
          step: "llm_judge_scoring",
          status: "scored",
          score: 91,
          explanation:
            "Excellent in-depth answer covering IL mechanics, mathematical formulation, and practical mitigation strategies including concentrated liquidity.",
          method: "llm",
        },
        {
          step: "on_chain_challenge",
          status: "recorded",
          reason: "On-chain proof already exists for this agent pair",
        },
      ],
      completed_at: ago(8),
      on_chain_tx: null,
      submit_tx: null,
      judge_score: 91,
    },
    {
      timestamp: ago(12),
      challenger: "PoI-Alpha",
      target: "PoI-Gamma",
      target_url: "http://localhost:10000/gamma",
      question:
        "How does Anchor's account validation work and what are the common patterns for constraint checks?",
      question_domain: "solana",
      question_difficulty: "medium",
      steps: [
        {
          step: "a2a_http_challenge",
          status: "success",
          peer_answer_preview:
            "Anchor uses procedural macros (#[derive(Accounts)]) to validate accounts at the instruction level. Key patterns include: has_one, seeds, constraint...",
          peer_answer_hash: "d4e5f6a7b8c9...",
        },
        {
          step: "llm_judge_scoring",
          status: "scored",
          score: 88,
          explanation:
            "Strong understanding of Anchor validation patterns. Well-structured answer with practical examples.",
          method: "llm",
        },
        {
          step: "on_chain_challenge",
          status: "recorded",
          reason: "On-chain proof already exists for this agent pair",
        },
      ],
      completed_at: ago(12),
      on_chain_tx: null,
      submit_tx: null,
      judge_score: 88,
    },
    {
      timestamp: ago(15),
      challenger: "PoI-Beta",
      target: "PoI-Alpha",
      target_url: "http://localhost:10000/alpha",
      question:
        "What are flash loan attacks and how can DeFi protocols defend against them?",
      question_domain: "defi",
      question_difficulty: "easy",
      steps: [
        {
          step: "a2a_http_challenge",
          status: "success",
          peer_answer_preview:
            "Flash loan attacks exploit the atomic nature of blockchain transactions. An attacker borrows a large amount, manipulates prices, and repays in one transaction...",
          peer_answer_hash: "e5f6a7b8c9d0...",
        },
        {
          step: "llm_judge_scoring",
          status: "scored",
          score: 79,
          explanation:
            "Solid explanation of flash loan mechanics and common attack vectors. Could elaborate more on TWAP-based defenses.",
          method: "llm",
        },
        {
          step: "on_chain_challenge",
          status: "recorded",
          reason: "On-chain proof already exists for this agent pair",
        },
      ],
      completed_at: ago(15),
      on_chain_tx: null,
      submit_tx: null,
      judge_score: 79,
    },
  ],
};

/* ------------------------------------------------------------------ */
/*  /api/certifications  (AgentCertification[])                        */
/* ------------------------------------------------------------------ */
export const DEMO_CERTIFICATIONS = [
  {
    agent_name: "PoI-Alpha",
    model: "anthropic/claude-3-haiku-20240307",
    model_hash: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
    total_certifications: 2,
    latest_certification: {
      timestamp: ago(30),
      agent: "PoI-Alpha",
      model: "anthropic/claude-3-haiku-20240307",
      model_hash:
        "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
      overall_score: 78.5,
      overall_level: "Proficient",
      domain_scores: {
        defi: {
          weighted_score: 85,
          certification_level: "Expert",
          questions_correct: 8,
          questions_total: 10,
          difficulty_breakdown: { easy: 100, medium: 80, hard: 70 },
          time_taken_ms: 12400,
          result_hash: "hash1",
        },
        solana: {
          weighted_score: 72,
          certification_level: "Proficient",
          questions_correct: 7,
          questions_total: 10,
          difficulty_breakdown: { easy: 90, medium: 70, hard: 50 },
          time_taken_ms: 11200,
          result_hash: "hash2",
        },
        security: {
          weighted_score: 78,
          certification_level: "Proficient",
          questions_correct: 7,
          questions_total: 10,
          difficulty_breakdown: { easy: 95, medium: 75, hard: 60 },
          time_taken_ms: 13100,
          result_hash: "hash3",
        },
      },
      cert_hash:
        "cert_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8",
      on_chain_tx: null,
    },
    certification_history: [],
  },
  {
    agent_name: "PoI-Beta",
    model: "anthropic/claude-haiku-4-5-20251001",
    model_hash: "b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3",
    total_certifications: 1,
    latest_certification: {
      timestamp: ago(35),
      agent: "PoI-Beta",
      model: "anthropic/claude-haiku-4-5-20251001",
      model_hash:
        "b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3",
      overall_score: 82.3,
      overall_level: "Proficient",
      domain_scores: {
        defi: {
          weighted_score: 70,
          certification_level: "Proficient",
          questions_correct: 6,
          questions_total: 10,
          difficulty_breakdown: { easy: 85, medium: 65, hard: 55 },
          time_taken_ms: 14200,
          result_hash: "hash4",
        },
        solana: {
          weighted_score: 80,
          certification_level: "Proficient",
          questions_correct: 8,
          questions_total: 10,
          difficulty_breakdown: { easy: 95, medium: 80, hard: 60 },
          time_taken_ms: 12800,
          result_hash: "hash5",
        },
        security: {
          weighted_score: 97,
          certification_level: "Expert",
          questions_correct: 10,
          questions_total: 10,
          difficulty_breakdown: { easy: 100, medium: 95, hard: 90 },
          time_taken_ms: 11500,
          result_hash: "hash6",
        },
      },
      cert_hash:
        "cert_b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9",
      on_chain_tx: null,
    },
    certification_history: [],
  },
  {
    agent_name: "PoI-Gamma",
    model: "anthropic/claude-sonnet-4-5-20250929",
    model_hash: "c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4",
    total_certifications: 1,
    latest_certification: {
      timestamp: ago(40),
      agent: "PoI-Gamma",
      model: "anthropic/claude-sonnet-4-5-20250929",
      model_hash:
        "c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4",
      overall_score: 86.0,
      overall_level: "Expert",
      domain_scores: {
        defi: {
          weighted_score: 76,
          certification_level: "Proficient",
          questions_correct: 7,
          questions_total: 10,
          difficulty_breakdown: { easy: 90, medium: 75, hard: 55 },
          time_taken_ms: 15600,
          result_hash: "hash7",
        },
        solana: {
          weighted_score: 94,
          certification_level: "Expert",
          questions_correct: 9,
          questions_total: 10,
          difficulty_breakdown: { easy: 100, medium: 95, hard: 85 },
          time_taken_ms: 10200,
          result_hash: "hash8",
        },
        security: {
          weighted_score: 88,
          certification_level: "Expert",
          questions_correct: 9,
          questions_total: 10,
          difficulty_breakdown: { easy: 100, medium: 90, hard: 70 },
          time_taken_ms: 12400,
          result_hash: "hash9",
        },
      },
      cert_hash:
        "cert_c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0",
      on_chain_tx: null,
    },
    certification_history: [],
  },
];
