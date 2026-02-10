use anchor_lang::prelude::*;

#[error_code]
pub enum RegistryError {
    #[msg("Name is too long (max 64 characters)")]
    NameTooLong,

    #[msg("Model hash is invalid (must be sha256:...)")]
    InvalidModelHash,

    #[msg("Capabilities string is too long (max 256 characters)")]
    CapabilitiesTooLong,

    #[msg("Agent is already verified")]
    AlreadyVerified,

    #[msg("Unauthorized: only owner can update agent")]
    Unauthorized,

    #[msg("Reputation delta too large")]
    ReputationDeltaTooLarge,

    #[msg("Agent not found")]
    AgentNotFound,

    #[msg("Registry is full")]
    RegistryFull,

    #[msg("Collection has already been initialized")]
    CollectionAlreadyInitialized,

    #[msg("Collection must be initialized before registering agents")]
    CollectionNotInitialized,

    #[msg("Question is too long (max 256 characters)")]
    QuestionTooLong,

    #[msg("Expected hash must be 64 characters (SHA256 hex)")]
    InvalidExpectedHash,

    #[msg("Response hash must be 64 characters (SHA256 hex)")]
    InvalidResponseHash,

    #[msg("Challenge has expired")]
    ChallengeExpired,

    #[msg("Challenge is not pending")]
    ChallengeNotPending,

    #[msg("Challenge does not match the agent")]
    ChallengeMismatch,

    #[msg("Challenge has not expired yet")]
    ChallengeNotExpired,

    // SentinelAgent Audit Errors
    #[msg("Details hash must be 64 hex characters (SHA256)")]
    InvalidDetailsHash,

    #[msg("Risk score must be 0-100")]
    InvalidRiskScore,

    #[msg("Audit summary not found for this agent")]
    AuditSummaryNotFound,

    #[msg("Challenge is still pending (must be resolved before closing)")]
    ChallengeStillPending,
}
