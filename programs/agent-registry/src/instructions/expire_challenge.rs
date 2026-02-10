use anchor_lang::prelude::*;
use crate::state::{AgentAccount, Challenge, ChallengeStatus, RegistryState};
use crate::errors::RegistryError;

/// Expire a challenge that has passed its deadline
///
/// This instruction can be called by ANYONE to expire a stale challenge.
/// This is important for:
/// 1. Network hygiene - cleaning up stale state
/// 2. Accountability - agents that don't respond get penalized
/// 3. Permissionless - anyone can trigger this, incentivizing cleanup
#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct ExpireChallenge<'info> {
    /// Anyone can call this to expire a challenge
    #[account(mut)]
    pub caller: Signer<'info>,

    /// The registry (for validation)
    #[account(
        seeds = [RegistryState::SEED_PREFIX],
        bump = registry.bump
    )]
    pub registry: Account<'info, RegistryState>,

    /// The agent that was challenged
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

    /// The challenge to expire
    #[account(
        mut,
        seeds = [
            Challenge::SEED_PREFIX,
            agent.key().as_ref(),
            challenge.challenger.as_ref(),
            nonce.to_le_bytes().as_ref(),
        ],
        bump = challenge.bump,
        constraint = challenge.agent == agent.key() @ RegistryError::ChallengeMismatch,
        constraint = challenge.status == ChallengeStatus::Pending @ RegistryError::ChallengeNotPending
    )]
    pub challenge: Account<'info, Challenge>,
}

pub fn handler(ctx: Context<ExpireChallenge>, _nonce: u64) -> Result<()> {
    let challenge = &mut ctx.accounts.challenge;
    let agent = &mut ctx.accounts.agent;
    let clock = Clock::get()?;

    // Verify challenge is actually expired
    require!(
        challenge.is_expired(clock.unix_timestamp),
        RegistryError::ChallengeNotExpired
    );

    // Mark as expired
    challenge.status = ChallengeStatus::Expired;
    challenge.responded_at = clock.unix_timestamp;

    // Apply penalty for not responding (same as failing)
    agent.challenges_failed = agent.challenges_failed.saturating_add(1);
    agent.adjust_reputation(Challenge::FAIL_REPUTATION_DELTA);
    agent.updated_at = clock.unix_timestamp;

    msg!(
        "Challenge EXPIRED! Agent {} did not respond. Reputation: {}",
        agent.agent_id,
        agent.reputation_score
    );

    Ok(())
}
