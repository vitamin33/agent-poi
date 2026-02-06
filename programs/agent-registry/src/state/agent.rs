use anchor_lang::prelude::*;

/// Agent account - represents a registered AI agent
#[account]
#[derive(InitSpace)]
pub struct AgentAccount {
    /// Unique agent ID (auto-incremented)
    pub agent_id: u64,

    /// Owner wallet pubkey
    pub owner: Pubkey,

    /// Agent name (max 64 chars)
    #[max_len(64)]
    pub name: String,

    /// SHA256 hash of the model file (e.g., "sha256:abc123...")
    #[max_len(72)]
    pub model_hash: String,

    /// Comma-separated list of capabilities (e.g., "analysis,coding,trading")
    #[max_len(256)]
    pub capabilities: String,

    /// Reputation score (0-10000, representing 0.00-100.00%)
    pub reputation_score: u32,

    /// Number of challenges passed
    pub challenges_passed: u32,

    /// Number of challenges failed
    pub challenges_failed: u32,

    /// Whether the agent has been verified by admin
    pub verified: bool,

    /// Unix timestamp when agent was created
    pub created_at: i64,

    /// Unix timestamp when agent was last updated
    pub updated_at: i64,

    /// NFT asset pubkey (Metaplex Core identity NFT)
    pub nft_mint: Pubkey,

    /// Bump seed for PDA derivation
    pub bump: u8,
}

impl AgentAccount {
    pub const SEED_PREFIX: &'static [u8] = b"agent";

    /// Initial reputation score (50%)
    pub const INITIAL_REPUTATION: u32 = 5000;

    /// Maximum reputation score (100%)
    pub const MAX_REPUTATION: u32 = 10000;

    /// Minimum reputation score (0%)
    pub const MIN_REPUTATION: u32 = 0;

    /// Calculate reputation percentage (0.00 - 100.00)
    pub fn reputation_percentage(&self) -> f64 {
        (self.reputation_score as f64) / 100.0
    }

    /// Update reputation with bounds checking
    pub fn adjust_reputation(&mut self, delta: i32) {
        let new_score = (self.reputation_score as i64) + (delta as i64);
        self.reputation_score = new_score
            .max(Self::MIN_REPUTATION as i64)
            .min(Self::MAX_REPUTATION as i64) as u32;
    }
}
