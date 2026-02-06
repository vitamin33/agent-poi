use anchor_lang::prelude::*;
use crate::state::{AgentAccount, RegistryState};
use crate::errors::RegistryError;

#[derive(Accounts)]
pub struct UpdateReputation<'info> {
    /// Authority for reputation updates - SECURITY NOTICE
    ///
    /// HACKATHON LIMITATION: Currently only admin can update reputation.
    ///
    /// PRODUCTION REQUIREMENTS:
    /// 1. Add a separate "authorized_verifiers" PDA to store allowed callers
    /// 2. Allow challenge program PDAs to update reputation via CPI
    /// 3. Consider time-locked updates or multi-sig for large reputation changes
    /// 4. Implement rate limiting per agent to prevent reputation farming
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [RegistryState::SEED_PREFIX],
        bump = registry.bump,
        // Currently admin-only. For production, expand to include verified challenge programs
        constraint = registry.admin == authority.key() @ RegistryError::Unauthorized
    )]
    pub registry: Account<'info, RegistryState>,

    #[account(
        mut,
        seeds = [
            AgentAccount::SEED_PREFIX,
            agent.owner.as_ref(),
            agent.agent_id.to_le_bytes().as_ref()
        ],
        bump = agent.bump
    )]
    pub agent: Account<'info, AgentAccount>,
}

pub fn handler(ctx: Context<UpdateReputation>, delta: i32) -> Result<()> {
    // Limit reputation changes to prevent abuse
    require!(
        delta.abs() <= 1000,
        RegistryError::ReputationDeltaTooLarge
    );

    let agent = &mut ctx.accounts.agent;
    let old_reputation = agent.reputation_score;

    // Update challenge counters based on delta
    if delta > 0 {
        agent.challenges_passed = agent.challenges_passed.saturating_add(1);
    } else if delta < 0 {
        agent.challenges_failed = agent.challenges_failed.saturating_add(1);
    }

    // Apply reputation change
    agent.adjust_reputation(delta);

    let clock = Clock::get()?;
    agent.updated_at = clock.unix_timestamp;

    msg!(
        "Reputation updated: agent={}, old={}, new={}, delta={}",
        agent.agent_id,
        old_reputation,
        agent.reputation_score,
        delta
    );

    Ok(())
}
