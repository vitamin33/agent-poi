use anchor_lang::prelude::*;
use crate::state::{AgentAccount, Challenge, ChallengeStatus, RegistryState};
use crate::errors::RegistryError;

#[derive(Accounts)]
pub struct SubmitResponse<'info> {
    /// Agent owner submitting the response
    #[account(mut)]
    pub owner: Signer<'info>,

    /// The registry (for validation)
    #[account(
        seeds = [RegistryState::SEED_PREFIX],
        bump = registry.bump
    )]
    pub registry: Account<'info, RegistryState>,

    /// The agent account (must be owned by signer)
    #[account(
        mut,
        seeds = [
            AgentAccount::SEED_PREFIX,
            owner.key().as_ref(),
            agent.agent_id.to_le_bytes().as_ref()
        ],
        bump = agent.bump
    )]
    pub agent: Account<'info, AgentAccount>,

    /// The challenge to respond to
    #[account(
        mut,
        seeds = [
            Challenge::SEED_PREFIX,
            agent.key().as_ref(),
            challenge.challenger.as_ref(),
        ],
        bump = challenge.bump,
        constraint = challenge.agent == agent.key() @ RegistryError::ChallengeMismatch,
        constraint = challenge.status == ChallengeStatus::Pending @ RegistryError::ChallengeNotPending
    )]
    pub challenge: Account<'info, Challenge>,
}

pub fn handler(
    ctx: Context<SubmitResponse>,
    response_hash: String,
) -> Result<()> {
    let challenge = &mut ctx.accounts.challenge;
    let agent = &mut ctx.accounts.agent;
    let clock = Clock::get()?;

    // Check if challenge has expired
    require!(
        !challenge.is_expired(clock.unix_timestamp),
        RegistryError::ChallengeExpired
    );

    // Validate response hash format
    require!(
        response_hash.len() == 64,
        RegistryError::InvalidResponseHash
    );

    // Record response time
    challenge.responded_at = clock.unix_timestamp;

    // Verify the response
    if response_hash == challenge.expected_hash {
        // Challenge passed
        challenge.status = ChallengeStatus::Passed;
        agent.challenges_passed = agent.challenges_passed.saturating_add(1);
        agent.adjust_reputation(Challenge::PASS_REPUTATION_DELTA);
        agent.updated_at = clock.unix_timestamp;

        msg!(
            "Challenge PASSED! Agent {} reputation: {}",
            agent.agent_id,
            agent.reputation_score
        );
    } else {
        // Challenge failed
        challenge.status = ChallengeStatus::Failed;
        agent.challenges_failed = agent.challenges_failed.saturating_add(1);
        agent.adjust_reputation(Challenge::FAIL_REPUTATION_DELTA);
        agent.updated_at = clock.unix_timestamp;

        msg!(
            "Challenge FAILED. Agent {} reputation: {}",
            agent.agent_id,
            agent.reputation_score
        );
    }

    Ok(())
}
