use anchor_lang::prelude::*;
use crate::state::{AgentAccount, Challenge, ChallengeStatus};
use crate::errors::RegistryError;

/// Close a resolved challenge account and reclaim rent
/// Only the original challenger can close, and only after the challenge is resolved
/// This is a critical mainnet optimization: reclaims ~0.012 SOL per challenge
#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct CloseChallenge<'info> {
    /// The original challenger who funded the PDA (receives rent back)
    #[account(mut)]
    pub challenger: Signer<'info>,

    /// The agent that was challenged (for PDA derivation)
    #[account(
        seeds = [
            AgentAccount::SEED_PREFIX,
            agent.owner.as_ref(),
            agent.agent_id.to_le_bytes().as_ref()
        ],
        bump = agent.bump
    )]
    pub agent: Account<'info, AgentAccount>,

    /// The challenge account to close (rent returned to challenger)
    #[account(
        mut,
        close = challenger,
        seeds = [
            Challenge::SEED_PREFIX,
            agent.key().as_ref(),
            challenger.key().as_ref(),
            nonce.to_le_bytes().as_ref(),
        ],
        bump = challenge.bump,
        constraint = challenge.challenger == challenger.key() @ RegistryError::Unauthorized,
        constraint = challenge.status != ChallengeStatus::Pending @ RegistryError::ChallengeStillPending,
    )]
    pub challenge: Account<'info, Challenge>,
}

pub fn handler(ctx: Context<CloseChallenge>, _nonce: u64) -> Result<()> {
    msg!(
        "Challenge closed. Rent reclaimed by {} for agent {}",
        ctx.accounts.challenger.key(),
        ctx.accounts.agent.key()
    );
    Ok(())
}
