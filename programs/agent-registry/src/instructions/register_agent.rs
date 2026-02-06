use anchor_lang::prelude::*;
use crate::state::{AgentAccount, RegistryState};
use crate::errors::RegistryError;

#[derive(Accounts)]
pub struct RegisterAgent<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [RegistryState::SEED_PREFIX],
        bump = registry.bump,
        constraint = registry.collection_initialized @ RegistryError::CollectionNotInitialized
    )]
    pub registry: Account<'info, RegistryState>,

    #[account(
        init,
        payer = owner,
        space = 8 + AgentAccount::INIT_SPACE,
        seeds = [
            AgentAccount::SEED_PREFIX,
            owner.key().as_ref(),
            registry.total_agents.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub agent: Account<'info, AgentAccount>,

    /// CHECK: The NFT asset account (created off-chain via Metaplex SDK)
    /// In production, verify this belongs to the collection and is owned by the signer
    pub nft_mint: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<RegisterAgent>,
    name: String,
    model_hash: String,
    capabilities: String,
) -> Result<()> {
    // Validate inputs
    require!(name.len() <= 64, RegistryError::NameTooLong);
    require!(
        model_hash.starts_with("sha256:") && model_hash.len() >= 71,
        RegistryError::InvalidModelHash
    );
    require!(capabilities.len() <= 256, RegistryError::CapabilitiesTooLong);

    let registry = &mut ctx.accounts.registry;
    let agent = &mut ctx.accounts.agent;
    let clock = Clock::get()?;

    // Set agent fields
    agent.agent_id = registry.total_agents;
    agent.owner = ctx.accounts.owner.key();
    agent.name = name.clone();
    agent.model_hash = model_hash;
    agent.capabilities = capabilities;
    agent.reputation_score = AgentAccount::INITIAL_REPUTATION;
    agent.challenges_passed = 0;
    agent.challenges_failed = 0;
    agent.verified = false;
    agent.created_at = clock.unix_timestamp;
    agent.updated_at = clock.unix_timestamp;
    agent.nft_mint = ctx.accounts.nft_mint.key();
    agent.bump = ctx.bumps.agent;

    // Increment total agents
    registry.total_agents = registry.total_agents.checked_add(1)
        .ok_or(RegistryError::RegistryFull)?;

    msg!(
        "Agent registered: id={}, name={}, nft={}",
        agent.agent_id,
        name,
        agent.nft_mint
    );

    Ok(())
}
