use anchor_lang::prelude::*;
use crate::state::RegistryState;
use crate::errors::RegistryError;

/// Set the NFT collection address (admin only)
/// The collection is created off-chain using Metaplex SDK
#[derive(Accounts)]
pub struct CreateCollection<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [RegistryState::SEED_PREFIX],
        bump = registry.bump,
        constraint = registry.admin == admin.key() @ RegistryError::Unauthorized,
        constraint = !registry.collection_initialized @ RegistryError::CollectionAlreadyInitialized
    )]
    pub registry: Account<'info, RegistryState>,

    /// CHECK: The collection account (created off-chain via Metaplex SDK)
    pub collection: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<CreateCollection>) -> Result<()> {
    let registry = &mut ctx.accounts.registry;

    // Store the collection address (created off-chain)
    registry.collection = ctx.accounts.collection.key();
    registry.collection_initialized = true;

    msg!(
        "Collection set: {}",
        registry.collection
    );

    Ok(())
}
