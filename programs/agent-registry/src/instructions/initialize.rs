use anchor_lang::prelude::*;
use crate::state::RegistryState;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + RegistryState::INIT_SPACE,
        seeds = [RegistryState::SEED_PREFIX],
        bump
    )]
    pub registry: Account<'info, RegistryState>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Initialize>) -> Result<()> {
    let registry = &mut ctx.accounts.registry;

    registry.admin = ctx.accounts.admin.key();
    registry.total_agents = 0;
    registry.collection = Pubkey::default();
    registry.collection_initialized = false;
    registry.bump = ctx.bumps.registry;

    msg!("Registry initialized with admin: {}", registry.admin);

    Ok(())
}
