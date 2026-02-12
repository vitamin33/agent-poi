"use client";

import { useState, useEffect } from "react";

interface AuditAgent {
  agent_name?: string;
  total_entries?: number;
  total_batches_flushed?: number;
  on_chain_roots?: number;
  pending_entries?: number;
  recent_batches?: Array<{
    batch_index: number;
    merkle_root: string;
    entries_count?: number;
    entry_count?: number;
    tx_signature?: string;
    timestamp?: string;
  }>;
}

interface AuditData {
  agents: AuditAgent[];
  total_entries: number;
  total_batches_flushed: number;
  total_on_chain_roots: number;
}

interface AutonomousStats {
  agents: Array<{
    agent_name?: string;
    uptime_hours?: number;
    autonomous_behaviors?: Record<string, number>;
    background_tasks?: Record<string, { status: string; interval: string; last_run?: string }>;
  }>;
  aggregate: {
    self_evaluations: number;
    challenges_created: number;
    merkle_entries: number;
    merkle_batches: number;
    total_activities: number;
  };
}

/**
 * AuditTrailView - Shows Merkle audit trail, on-chain proofs, and autonomous stats.
 * Fetches from /api/a2a?endpoint=audit and /api/a2a?endpoint=autonomous-stats
 */
export function AuditTrailView() {
  const [auditData, setAuditData] = useState<AuditData | null>(null);
  const [statsData, setStatsData] = useState<AutonomousStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [auditRes, statsRes] = await Promise.allSettled([
          fetch("/api/a2a?endpoint=audit"),
          fetch("/api/a2a?endpoint=autonomous-stats"),
        ]);

        if (auditRes.status === "fulfilled" && auditRes.value.ok) {
          setAuditData(await auditRes.value.json());
        }
        if (statsRes.status === "fulfilled" && statsRes.value.ok) {
          setStatsData(await statsRes.value.json());
        }
        setError(null);
      } catch {
        setError("Agent API unreachable");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const agg = statsData?.aggregate;
  const totalActivities = agg?.total_activities ?? 0;
  const merkleRoots = auditData?.total_on_chain_roots ?? 0;
  const totalEntries = auditData?.total_entries ?? 0;

  // Collect all recent batches across agents
  const allBatches = (auditData?.agents ?? [])
    .flatMap((a) =>
      (a.recent_batches ?? []).map((b) => ({
        ...b,
        agent_name: a.agent_name ?? "Unknown",
      }))
    )
    .sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0))
    .slice(0, 10);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-white">
            <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" stroke="currentColor" strokeWidth="2"/>
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">
            Verifiable Audit Trail
          </h2>
          <p className="text-sm text-[var(--text-muted)]">
            Merkle-tree proofs of every autonomous action, stored on Solana
          </p>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-[var(--text-muted)]">Loading audit data...</div>
      ) : error && !auditData && !statsData ? (
        <div className="p-8 text-center text-[var(--text-muted)]">{error}</div>
      ) : (
        <>
          {/* Key Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="stat-card p-4">
              <div className="flex items-center justify-between mb-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-[#10b981]">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Activities</span>
              </div>
              <div className="text-2xl font-bold text-[#10b981]">{totalActivities}</div>
            </div>

            <div className="stat-card p-4">
              <div className="flex items-center justify-between mb-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-[#8b5cf6]">
                  <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/>
                  <path d="M3 9h18M9 21V9" stroke="currentColor" strokeWidth="2"/>
                </svg>
                <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Merkle Roots</span>
              </div>
              <div className="text-2xl font-bold text-[#8b5cf6]">{merkleRoots}</div>
            </div>

            <div className="stat-card p-4">
              <div className="flex items-center justify-between mb-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-[#f59e0b]">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2"/>
                  <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Audit Entries</span>
              </div>
              <div className="text-2xl font-bold text-[#f59e0b]">{totalEntries}</div>
            </div>

            <div className="stat-card p-4">
              <div className="flex items-center justify-between mb-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-[#3b82f6]">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" strokeWidth="2"/>
                  <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="2"/>
                  <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2"/>
                </svg>
                <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Evaluations</span>
              </div>
              <div className="text-2xl font-bold text-[#3b82f6]">{agg?.self_evaluations ?? 0}</div>
            </div>
          </div>

          {/* Per-Agent Breakdown */}
          {statsData?.agents && statsData.agents.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {statsData.agents.map((agent, i) => {
                const b = agent.autonomous_behaviors ?? {};
                const tasks = agent.background_tasks ?? {};
                const runningTasks = Object.values(tasks).filter((t) => t.status === "running").length;
                return (
                  <div key={i} className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[rgba(0,240,255,0.1)]">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-2 h-2 rounded-full bg-[#10b981] status-live" />
                      <span className="font-semibold text-[var(--text-primary)] text-sm">
                        {agent.agent_name ?? `Agent ${i + 1}`}
                      </span>
                      <span className="ml-auto text-xs text-[var(--text-muted)]">
                        {agent.uptime_hours?.toFixed(1) ?? "?"}h uptime
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-[var(--text-muted)]">Evaluations</span>
                        <span className="text-[var(--text-secondary)]">{b.self_evaluations_completed ?? 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-muted)]">Challenges</span>
                        <span className="text-[var(--text-secondary)]">{b.challenges_created_for_others ?? 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-muted)]">Merkle Logs</span>
                        <span className="text-[var(--text-secondary)]">{b.merkle_entries_logged ?? 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-muted)]">On-Chain Tx</span>
                        <span className="text-[var(--text-secondary)]">{b.total_on_chain_transactions ?? 0}</span>
                      </div>
                    </div>
                    <div className="mt-2 pt-2 border-t border-[rgba(0,240,255,0.05)] text-xs text-[var(--text-muted)]">
                      {runningTasks} background tasks running
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Recent Merkle Batches */}
          {allBatches.length > 0 && (
            <div className="rounded-xl bg-[var(--bg-elevated)] border border-[rgba(0,240,255,0.1)] overflow-hidden">
              <div className="px-4 py-3 border-b border-[rgba(0,240,255,0.05)]">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Recent Merkle Batches</h3>
              </div>
              <div className="divide-y divide-[rgba(0,240,255,0.05)]">
                {allBatches.map((batch, i) => (
                  <div key={i} className="px-4 py-3 flex items-center gap-3 text-xs">
                    <span className="w-2 h-2 rounded-full bg-[#10b981]" />
                    <span className="text-[var(--text-secondary)] font-medium w-24 shrink-0">{batch.agent_name}</span>
                    <code className="text-[var(--accent-primary)] font-mono truncate max-w-[160px]">
                      {batch.merkle_root?.substring(0, 16)}...
                    </code>
                    <span className="text-[var(--text-muted)]">{batch.entries_count ?? batch.entry_count} entries</span>
                    {batch.tx_signature && (
                      <a
                        href={`https://explorer.solana.com/tx/${batch.tx_signature}?cluster=devnet`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto text-[var(--accent-primary)] hover:underline shrink-0"
                      >
                        View Tx
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
