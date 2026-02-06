use anchor_lang::prelude::*;

/// Challenge status enum
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum ChallengeStatus {
    /// Waiting for agent response
    Pending,
    /// Agent passed the challenge
    Passed,
    /// Agent failed the challenge
    Failed,
    /// Challenge expired without response
    Expired,
}

impl Default for ChallengeStatus {
    fn default() -> Self {
        ChallengeStatus::Pending
    }
}

/// Challenge account - represents a verification challenge for an agent
#[account]
#[derive(InitSpace)]
pub struct Challenge {
    /// The agent being challenged
    pub agent: Pubkey,

    /// Who created the challenge
    pub challenger: Pubkey,

    /// The challenge question/prompt
    #[max_len(256)]
    pub question: String,

    /// SHA256 hash of the expected answer (for verification)
    #[max_len(64)]
    pub expected_hash: String,

    /// Current status of the challenge
    pub status: ChallengeStatus,

    /// Unix timestamp when challenge was created
    pub created_at: i64,

    /// Unix timestamp when challenge expires
    pub expires_at: i64,

    /// Unix timestamp when agent responded (if any)
    pub responded_at: i64,

    /// Bump seed for PDA derivation
    pub bump: u8,
}

impl Challenge {
    pub const SEED_PREFIX: &'static [u8] = b"challenge";

    /// Default challenge duration (1 hour in seconds)
    pub const DEFAULT_DURATION: i64 = 3600;

    /// Reputation gain for passing a challenge
    pub const PASS_REPUTATION_DELTA: i32 = 100;

    /// Reputation loss for failing a challenge
    pub const FAIL_REPUTATION_DELTA: i32 = -50;

    /// Check if challenge has expired
    pub fn is_expired(&self, current_time: i64) -> bool {
        current_time > self.expires_at
    }
}
