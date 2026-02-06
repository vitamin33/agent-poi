use anchor_lang::prelude::*;

/// Global registry state - tracks total agents and admin
#[account]
#[derive(InitSpace)]
pub struct RegistryState {
    /// Admin pubkey who can verify agents
    pub admin: Pubkey,
    /// Total number of registered agents
    pub total_agents: u64,
    /// Metaplex Core collection address for agent identity NFTs
    pub collection: Pubkey,
    /// Whether the NFT collection has been initialized
    pub collection_initialized: bool,
    /// Bump seed for PDA
    pub bump: u8,
}

impl RegistryState {
    pub const SEED_PREFIX: &'static [u8] = b"registry";
    pub const COLLECTION_NAME: &'static str = "Assisterr Agent Identity";
    pub const COLLECTION_URI: &'static str = "https://arweave.net/assisterr-agent-collection";
}
