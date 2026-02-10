use anchor_lang::prelude::*;
use crate::state::{AgentAccount, Challenge, ChallengeStatus};
use crate::errors::RegistryError;

#[derive(Accounts)]
#[instruction(question: String, expected_hash: String, nonce: u64)]
pub struct CreateChallenge<'info> {
    #[account(mut)]
    pub challenger: Signer<'info>,

    /// The agent being challenged
    #[account(
        seeds = [
            AgentAccount::SEED_PREFIX,
            agent.owner.as_ref(),
            agent.agent_id.to_le_bytes().as_ref()
        ],
        bump = agent.bump
    )]
    pub agent: Account<'info, AgentAccount>,

    /// The challenge account (PDA derived from agent + challenger + nonce)
    #[account(
        init,
        payer = challenger,
        space = 8 + Challenge::INIT_SPACE,
        seeds = [
            Challenge::SEED_PREFIX,
            agent.key().as_ref(),
            challenger.key().as_ref(),
            nonce.to_le_bytes().as_ref(),
        ],
        bump
    )]
    pub challenge: Account<'info, Challenge>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CreateChallenge>,
    question: String,
    expected_hash: String,
    nonce: u64,
) -> Result<()> {
    // Validate inputs
    require!(question.len() <= 256, RegistryError::QuestionTooLong);
    require!(
        expected_hash.len() == 64,
        RegistryError::InvalidExpectedHash
    );

    let challenge = &mut ctx.accounts.challenge;
    let clock = Clock::get()?;

    challenge.agent = ctx.accounts.agent.key();
    challenge.challenger = ctx.accounts.challenger.key();
    challenge.question = question.clone();
    challenge.expected_hash = expected_hash;
    challenge.status = ChallengeStatus::Pending;
    challenge.created_at = clock.unix_timestamp;
    challenge.expires_at = clock.unix_timestamp + Challenge::DEFAULT_DURATION;
    challenge.responded_at = 0;
    challenge.nonce = nonce;
    challenge.bump = ctx.bumps.challenge;

    msg!(
        "Challenge created for agent {} by {}: {}",
        ctx.accounts.agent.key(),
        ctx.accounts.challenger.key(),
        question
    );

    Ok(())
}
