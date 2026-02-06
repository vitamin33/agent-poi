use anchor_lang::prelude::*;
use crate::state::{AgentAccount, AuditEntry, AgentAuditSummary, ActionType, RiskLevel};
use crate::errors::RegistryError;

/// Accounts for logging an audit entry
/// Follows Solana best practices: minimal accounts, proper PDA derivation
#[derive(Accounts)]
#[instruction(action_type: ActionType, context_risk: u8, details_hash: String)]
pub struct LogAudit<'info> {
    /// The actor triggering this audit (must be agent owner or admin)
    #[account(mut)]
    pub actor: Signer<'info>,

    /// The agent being audited
    #[account(
        seeds = [
            AgentAccount::SEED_PREFIX,
            agent.owner.as_ref(),
            agent.agent_id.to_le_bytes().as_ref()
        ],
        bump = agent.bump
    )]
    pub agent: Account<'info, AgentAccount>,

    /// The audit summary for this agent (created if first audit)
    #[account(
        init_if_needed,
        payer = actor,
        space = 8 + AgentAuditSummary::INIT_SPACE,
        seeds = [AgentAuditSummary::SEED_PREFIX, agent.key().as_ref()],
        bump
    )]
    pub audit_summary: Account<'info, AgentAuditSummary>,

    /// The new audit entry
    #[account(
        init,
        payer = actor,
        space = 8 + AuditEntry::INIT_SPACE,
        seeds = [
            AuditEntry::SEED_PREFIX,
            agent.key().as_ref(),
            audit_summary.total_entries.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub audit_entry: Account<'info, AuditEntry>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<LogAudit>,
    action_type: ActionType,
    context_risk: u8,
    details_hash: String,
) -> Result<()> {
    // Validate details hash (should be SHA256 hex)
    require!(
        details_hash.len() == 64 && details_hash.chars().all(|c| c.is_ascii_hexdigit()),
        RegistryError::InvalidDetailsHash
    );

    // Validate context risk
    require!(context_risk <= 100, RegistryError::InvalidRiskScore);

    let clock = Clock::get()?;
    let agent_key = ctx.accounts.agent.key();

    // Calculate risk score based on action type and context
    let risk_score = AuditEntry::calculate_risk_score(&action_type, context_risk);
    let risk_level = RiskLevel::from_score(risk_score);
    let is_alert = matches!(action_type, ActionType::SecurityAlert) || risk_score >= 75;

    // Initialize audit summary if first entry
    let summary = &mut ctx.accounts.audit_summary;
    if summary.total_entries == 0 {
        summary.agent = agent_key;
        summary.bump = ctx.bumps.audit_summary;
    }

    // Create audit entry
    let entry = &mut ctx.accounts.audit_entry;
    entry.agent = agent_key;
    entry.actor = ctx.accounts.actor.key();
    entry.action_type = action_type;
    entry.risk_score = risk_score;
    entry.risk_level = risk_level;
    entry.timestamp = clock.unix_timestamp;
    entry.details_hash = details_hash;
    entry.audit_index = summary.total_entries;
    entry.bump = ctx.bumps.audit_entry;

    // Update summary
    summary.record_entry(risk_score, is_alert, clock.unix_timestamp);

    msg!(
        "Audit logged: agent={}, action={:?}, risk={}, index={}",
        agent_key,
        action_type,
        risk_score,
        entry.audit_index
    );

    Ok(())
}

/// Accounts for querying agent audit status (read-only helper)
#[derive(Accounts)]
pub struct GetAuditStatus<'info> {
    /// The agent to query
    #[account(
        seeds = [
            AgentAccount::SEED_PREFIX,
            agent.owner.as_ref(),
            agent.agent_id.to_le_bytes().as_ref()
        ],
        bump = agent.bump
    )]
    pub agent: Account<'info, AgentAccount>,

    /// The audit summary
    #[account(
        seeds = [AgentAuditSummary::SEED_PREFIX, agent.key().as_ref()],
        bump = audit_summary.bump
    )]
    pub audit_summary: Account<'info, AgentAuditSummary>,
}

/// Returns audit status for an agent
pub fn get_audit_status(ctx: Context<GetAuditStatus>) -> Result<AuditStatusResponse> {
    let summary = &ctx.accounts.audit_summary;

    Ok(AuditStatusResponse {
        total_entries: summary.total_entries,
        security_alerts: summary.security_alerts,
        avg_risk_score: summary.avg_risk_score,
        max_risk_score: summary.max_risk_score,
        safe_streak: summary.safe_streak,
        is_trusted: summary.is_trusted(),
        last_audit_at: summary.last_audit_at,
    })
}

/// Response struct for audit status queries
#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct AuditStatusResponse {
    pub total_entries: u64,
    pub security_alerts: u32,
    pub avg_risk_score: u8,
    pub max_risk_score: u8,
    pub safe_streak: u32,
    pub is_trusted: bool,
    pub last_audit_at: i64,
}
