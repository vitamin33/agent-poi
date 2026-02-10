use anchor_lang::prelude::*;

pub mod instructions;
pub mod state;
pub mod errors;

use instructions::*;

declare_id!("EQ2Zv3cTDBzY1PafPz2WDoup6niUv6X8t9id4PBACL38");

#[program]
pub mod agent_registry {
    use super::*;

    /// Initialize the global registry state
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::initialize::handler(ctx)
    }

    /// Set the NFT collection address for agent identities (admin only, one-time)
    /// The collection itself is created off-chain using Metaplex SDK
    pub fn create_collection(ctx: Context<CreateCollection>) -> Result<()> {
        instructions::create_collection::handler(ctx)
    }

    /// Register a new AI agent with identity NFT reference
    /// The NFT should be created off-chain first using Metaplex SDK
    pub fn register_agent(
        ctx: Context<RegisterAgent>,
        name: String,
        model_hash: String,
        capabilities: String,
    ) -> Result<()> {
        instructions::register_agent::handler(ctx, name, model_hash, capabilities)
    }

    /// Update an agent's metadata
    pub fn update_agent(
        ctx: Context<UpdateAgent>,
        name: Option<String>,
        capabilities: Option<String>,
    ) -> Result<()> {
        instructions::update_agent::handler(ctx, name, capabilities)
    }

    /// Verify an agent (admin only)
    pub fn verify_agent(ctx: Context<VerifyAgent>) -> Result<()> {
        instructions::verify_agent::handler(ctx)
    }

    /// Update agent reputation (called by challenge program)
    pub fn update_reputation(
        ctx: Context<UpdateReputation>,
        delta: i32,
    ) -> Result<()> {
        instructions::update_reputation::handler(ctx, delta)
    }

    /// Create a new challenge for an agent (nonce enables multiple challenges per pair)
    pub fn create_challenge(
        ctx: Context<CreateChallenge>,
        question: String,
        expected_hash: String,
        nonce: u64,
    ) -> Result<()> {
        instructions::create_challenge::handler(ctx, question, expected_hash, nonce)
    }

    /// Submit a response to a challenge (verifies and updates reputation)
    pub fn submit_response(
        ctx: Context<SubmitResponse>,
        response_hash: String,
        nonce: u64,
    ) -> Result<()> {
        instructions::submit_response::handler(ctx, response_hash, nonce)
    }

    /// Expire a challenge that was not responded to in time
    /// Can be called by anyone - permissionless cleanup
    /// Agent receives penalty for not responding
    pub fn expire_challenge(ctx: Context<ExpireChallenge>, nonce: u64) -> Result<()> {
        instructions::expire_challenge::handler(ctx, nonce)
    }

    /// Close a resolved challenge and reclaim rent (~0.012 SOL per challenge)
    /// Only the original challenger can close, only after challenge is resolved
    /// Critical mainnet optimization: reduces per-challenge cost from 0.012 SOL to ~0 SOL
    pub fn close_challenge(ctx: Context<CloseChallenge>, nonce: u64) -> Result<()> {
        instructions::close_challenge::handler(ctx, nonce)
    }

    // ============================================
    // SentinelAgent Security Layer Instructions
    // ============================================

    /// Log an audit entry for an agent (SentinelAgent)
    /// Creates immutable on-chain audit trail for compliance
    pub fn log_audit(
        ctx: Context<LogAudit>,
        action_type: state::ActionType,
        context_risk: u8,
        details_hash: String,
    ) -> Result<()> {
        instructions::log_audit::handler(ctx, action_type, context_risk, details_hash)
    }

    /// Get audit status for an agent (view function)
    pub fn get_audit_status(
        ctx: Context<GetAuditStatus>,
    ) -> Result<instructions::log_audit::AuditStatusResponse> {
        instructions::log_audit::get_audit_status(ctx)
    }

    // ============================================
    // Merkle Audit (Efficient Batch Logging)
    // ============================================

    /// Store a Merkle root of batched audit entries
    /// More gas-efficient: 1 tx for N entries instead of N txs
    /// Off-chain logs can be verified against the on-chain root
    pub fn store_merkle_audit(
        ctx: Context<StoreMerkleAudit>,
        merkle_root: [u8; 32],
        entries_count: u32,
    ) -> Result<()> {
        instructions::store_merkle_audit::handler(ctx, merkle_root, entries_count)
    }
}
