use anchor_lang::prelude::*;

/// Action types for the audit trail
/// Follows A2A protocol patterns for agent activity classification
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum ActionType {
    /// Agent registered in the system
    AgentRegistered,
    /// Agent metadata updated
    AgentUpdated,
    /// Agent verified by admin
    AgentVerified,
    /// Challenge created for agent
    ChallengeCreated,
    /// Challenge passed successfully
    ChallengePassed,
    /// Challenge failed
    ChallengeFailed,
    /// Reputation increased
    ReputationIncreased,
    /// Reputation decreased
    ReputationDecreased,
    /// Security alert triggered
    SecurityAlert,
    /// Custom action for extensibility
    Custom,
}

/// Risk level classification following security best practices
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum RiskLevel {
    /// No risk - normal operation
    None,       // 0
    /// Low risk - minor anomaly
    Low,        // 1-25
    /// Medium risk - requires attention
    Medium,     // 26-50
    /// High risk - immediate attention needed
    High,       // 51-75
    /// Critical risk - potential security incident
    Critical,   // 76-100
}

impl RiskLevel {
    pub fn from_score(score: u8) -> Self {
        match score {
            0 => RiskLevel::None,
            1..=25 => RiskLevel::Low,
            26..=50 => RiskLevel::Medium,
            51..=75 => RiskLevel::High,
            _ => RiskLevel::Critical,
        }
    }

    pub fn to_score(&self) -> u8 {
        match self {
            RiskLevel::None => 0,
            RiskLevel::Low => 15,
            RiskLevel::Medium => 40,
            RiskLevel::High => 65,
            RiskLevel::Critical => 90,
        }
    }
}

/// Audit entry for the SentinelAgent security layer
/// Provides immutable on-chain audit trail for compliance (EU AI Act)
#[account]
#[derive(InitSpace)]
pub struct AuditEntry {
    /// The agent this audit entry belongs to
    pub agent: Pubkey,

    /// The wallet that triggered this action
    pub actor: Pubkey,

    /// Type of action performed
    pub action_type: ActionType,

    /// Risk level assessment (0-100)
    pub risk_score: u8,

    /// Risk classification
    pub risk_level: RiskLevel,

    /// Unix timestamp when action occurred
    pub timestamp: i64,

    /// SHA256 hash of detailed action data (stored off-chain)
    #[max_len(64)]
    pub details_hash: String,

    /// Sequential audit index for this agent
    pub audit_index: u64,

    /// PDA bump seed
    pub bump: u8,
}

impl AuditEntry {
    pub const SEED_PREFIX: &'static [u8] = b"audit";

    /// Calculate risk score based on action type and context
    pub fn calculate_risk_score(action_type: &ActionType, context_risk: u8) -> u8 {
        let base_risk = match action_type {
            ActionType::AgentRegistered => 0,
            ActionType::AgentUpdated => 5,
            ActionType::AgentVerified => 0,
            ActionType::ChallengeCreated => 10,
            ActionType::ChallengePassed => 0,
            ActionType::ChallengeFailed => 25,
            ActionType::ReputationIncreased => 0,
            ActionType::ReputationDecreased => 20,
            ActionType::SecurityAlert => 75,
            ActionType::Custom => context_risk,
        };
        base_risk.saturating_add(context_risk).min(100)
    }
}

/// Agent audit summary for quick lookups
/// Aggregated stats for efficient querying
#[account]
#[derive(InitSpace)]
pub struct AgentAuditSummary {
    /// The agent this summary belongs to
    pub agent: Pubkey,

    /// Total number of audit entries
    pub total_entries: u64,

    /// Total security alerts triggered
    pub security_alerts: u32,

    /// Average risk score (0-100)
    pub avg_risk_score: u8,

    /// Highest risk score recorded
    pub max_risk_score: u8,

    /// Last audit timestamp
    pub last_audit_at: i64,

    /// Consecutive low-risk actions (for trust building)
    pub safe_streak: u32,

    /// PDA bump seed
    pub bump: u8,
}

impl AgentAuditSummary {
    pub const SEED_PREFIX: &'static [u8] = b"audit_summary";

    /// Update summary with new audit entry
    pub fn record_entry(&mut self, risk_score: u8, is_alert: bool, timestamp: i64) {
        self.total_entries = self.total_entries.saturating_add(1);

        if is_alert {
            self.security_alerts = self.security_alerts.saturating_add(1);
            self.safe_streak = 0;
        } else if risk_score <= 10 {
            self.safe_streak = self.safe_streak.saturating_add(1);
        }

        // Update max risk
        if risk_score > self.max_risk_score {
            self.max_risk_score = risk_score;
        }

        // Rolling average calculation
        let total = self.total_entries as u32;
        let old_avg = self.avg_risk_score as u32;
        let new_score = risk_score as u32;
        self.avg_risk_score = ((old_avg * (total - 1) + new_score) / total) as u8;

        self.last_audit_at = timestamp;
    }

    /// Check if agent has good security standing
    pub fn is_trusted(&self) -> bool {
        self.avg_risk_score <= 25 && self.safe_streak >= 10 && self.security_alerts == 0
    }
}
