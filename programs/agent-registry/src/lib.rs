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

    /// Create a new challenge for an agent
    pub fn create_challenge(
        ctx: Context<CreateChallenge>,
        question: String,
        expected_hash: String,
    ) -> Result<()> {
        instructions::create_challenge::handler(ctx, question, expected_hash)
    }

    /// Submit a response to a challenge (verifies and updates reputation)
    pub fn submit_response(
        ctx: Context<SubmitResponse>,
        response_hash: String,
    ) -> Result<()> {
        instructions::submit_response::handler(ctx, response_hash)
    }
}
