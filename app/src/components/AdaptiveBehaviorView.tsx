"use client";

import { useEffect, useState, useCallback } from "react";

interface DomainPerformance {
  avg_score: number;
  trend: "improving" | "declining" | "stable";
  total_evaluations: number;
  adaptive_difficulty: string;
}

interface AdaptiveTrigger {
  timestamp: string;
  trigger: string;
  reason?: string;
  action: string;
  details?: Record<string, unknown>;
}

interface AgentAdaptive {
  agent_name: string;
  description: string;
  domain_performance: Record<string, DomainPerformance>;
  weakest_domain: string | null;
  adaptive_triggers: {
    total: number;
    recent: AdaptiveTrigger[];
  };
  behavior_modes: Record<string, string>;
}

interface AggregatedAdaptive {
  agents: AgentAdaptive[];
  network_totals: {
    total_adaptive_triggers: number;
    agents_adapting: number;
  };
}

const DOMAIN_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  defi: { text: "#a855f7", bg: "rgba(168,85,247,0.1)", border: "rgba(168,85,247,0.3)" },
  solana: { text: "#00f0ff", bg: "rgba(0,240,255,0.1)", border: "rgba(0,240,255,0.3)" },
  security: { text: "#ef4444", bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.3)" },
  general: { text: "#94a3b8", bg: "rgba(148,163,184,0.1)", border: "rgba(148,163,184,0.3)" },
};

const AGENT_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  "PoI-Alpha": { text: "#a855f7", bg: "rgba(168,85,247,0.1)", border: "rgba(168,85,247,0.3)" },
  "PoI-Beta": { text: "#ef4444", bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.3)" },
  "PoI-Gamma": { text: "#00f0ff", bg: "rgba(0,240,255,0.1)", border: "rgba(0,240,255,0.3)" },
};

const TREND_ICONS: Record<string, { icon: string; color: string }> = {
  improving: { icon: "\u2191", color: "#10b981" },
  declining: { icon: "\u2193", color: "#ef4444" },
  stable: { icon: "\u2192", color: "#f59e0b" },
};

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: "#10b981",
  medium: "#f59e0b",
  hard: "#ef4444",
};

function getScoreColor(score: number): string {
  if (score >= 80) return "#10b981";
  if (score >= 60) return "#f59e0b";
  if (score >= 40) return "#f97316";
  return "#ef4444";
}

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return date.toLocaleDateString();
}

function ScoreBar({ score, label, color }: { score: number; label: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-[var(--text-muted)] w-14 text-right uppercase">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-[var(--bg-deep)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.min(score, 100)}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-bold w-8" style={{ color }}>{Math.round(score)}</span>
    </div>
  );
}

export function AdaptiveBehaviorView() {
  const [data, setData] = useState<AggregatedAdaptive | null>(null);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/a2a?endpoint=adaptive");
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="p-6 rounded-xl bg-[var(--bg-elevated)] border border-[rgba(0,240,255,0.1)] animate-pulse">
        <div className="h-6 w-56 bg-[var(--bg-surface)] rounded mb-4" />
        <div className="h-32 bg-[var(--bg-surface)] rounded" />
      </div>
    );
  }

  if (!data || data.agents.length === 0) return null;

  const totalTriggers = data.network_totals.total_adaptive_triggers;

  // Combine all triggers from all agents
  const allTriggers = data.agents
    .flatMap((a) =>
      a.adaptive_triggers.recent.map((t) => ({ ...t, agent: a.agent_name }))
    )
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 20);

  return (
    <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[rgba(0,240,255,0.08)] overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between p-5 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#3b82f6]/20 to-[#8b5cf6]/20 flex items-center justify-center border border-[rgba(59,130,246,0.2)]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-[#3b82f6]">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Adaptive Behavior Engine
            </h2>
            <p className="text-[11px] text-[var(--text-muted)]">
              Condition-triggered intelligence — agents adapt strategy based on performance
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {totalTriggers > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[rgba(59,130,246,0.06)] border border-[rgba(59,130,246,0.2)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3b82f6] status-live" />
              <span className="text-xs text-[#3b82f6] font-medium">
                {totalTriggers} adaptations
              </span>
            </div>
          )}
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`text-[var(--text-muted)] transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>

      {/* Body */}
      <div className={`transition-all duration-300 overflow-hidden ${isExpanded ? "max-h-[4000px]" : "max-h-0"}`}>
        {/* Behavior modes */}
        <div className="px-5 pb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { label: "Reputation Monitor", desc: "Triggers if rep drops 200+", icon: "\u26A0", active: true },
              { label: "New Peer Detection", desc: "Challenge new peers immediately", icon: "\uD83D\uDD0D", active: true },
              { label: "Weak Domain Focus", desc: "Prioritize lowest-scoring area", icon: "\uD83C\uDFAF", active: true },
              { label: "Difficulty Scaling", desc: "Auto-adjust per domain score", icon: "\uD83D\uDCC8", active: true },
            ].map((mode, i) => (
              <div key={i} className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[rgba(0,240,255,0.04)]">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm">{mode.icon}</span>
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-[var(--text-primary)]">
                    {mode.label}
                  </span>
                </div>
                <p className="text-[10px] text-[var(--text-muted)]">{mode.desc}</p>
                <div className="mt-1.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] status-live" />
                  <span className="text-[9px] text-[#10b981] font-medium uppercase">Active</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Per-agent domain performance */}
        <div className="px-5 pb-4">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
            Domain Performance by Agent
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {data.agents.map((agent, idx) => {
              const colors = AGENT_COLORS[agent.agent_name] || { text: "#94a3b8", bg: "rgba(148,163,184,0.1)", border: "rgba(148,163,184,0.3)" };
              const domains = Object.entries(agent.domain_performance);
              return (
                <div key={idx} className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[rgba(0,240,255,0.05)]">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
                        style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}
                      >
                        {agent.agent_name.replace("PoI-", "").charAt(0)}
                      </span>
                      <span className="font-medium text-sm text-[var(--text-primary)]">
                        {agent.agent_name}
                      </span>
                    </div>
                    {agent.weakest_domain && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[rgba(239,68,68,0.08)] text-[#ef4444] border border-[rgba(239,68,68,0.15)]">
                        Focus: {agent.weakest_domain}
                      </span>
                    )}
                  </div>

                  <div className="space-y-2">
                    {domains.map(([domain, perf]) => {
                      const dColor = DOMAIN_COLORS[domain] || DOMAIN_COLORS.general;
                      const trend = TREND_ICONS[perf.trend] || TREND_ICONS.stable;
                      const diffColor = DIFFICULTY_COLORS[perf.adaptive_difficulty] || "#94a3b8";
                      return (
                        <div key={domain}>
                          <ScoreBar
                            score={perf.avg_score}
                            label={domain}
                            color={getScoreColor(perf.avg_score)}
                          />
                          <div className="flex items-center gap-2 ml-16 mt-0.5">
                            <span className="text-[9px]" style={{ color: trend.color }}>
                              {trend.icon} {perf.trend}
                            </span>
                            <span className="text-[9px] text-[var(--text-muted)]">
                              {perf.total_evaluations} evals
                            </span>
                            <span className="text-[9px] font-medium" style={{ color: diffColor }}>
                              {perf.adaptive_difficulty}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    {domains.length === 0 && (
                      <p className="text-[10px] text-[var(--text-muted)] text-center py-2">
                        Awaiting evaluation data...
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Adaptive trigger feed */}
        <div className="px-5 pb-5">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
            Adaptation Events
            {allTriggers.length > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] rounded-md bg-[var(--bg-surface)] text-[var(--text-muted)] font-normal">
                {allTriggers.length}
              </span>
            )}
          </h3>

          <div className="space-y-1 max-h-[250px] overflow-y-auto custom-scrollbar pr-1">
            {allTriggers.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-[var(--text-muted)]">
                  Waiting for adaptive triggers...
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Triggered by reputation drops, new peer discovery, or weak domain detection
                </p>
              </div>
            ) : (
              allTriggers.map((trigger, idx) => {
                const agentColor = AGENT_COLORS[trigger.agent]?.text || "#94a3b8";
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[var(--bg-surface)]/50 transition-colors"
                  >
                    <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 bg-[rgba(59,130,246,0.1)]">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-[#3b82f6]">
                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>

                    <span className="text-xs font-semibold flex-shrink-0 w-16" style={{ color: agentColor }}>
                      {trigger.agent.replace("PoI-", "")}
                    </span>

                    <span className="flex-1 text-xs text-[var(--text-secondary)] truncate min-w-0">
                      {trigger.trigger || trigger.reason}
                    </span>

                    <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0 w-12 text-right">
                      {formatRelativeTime(trigger.timestamp)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Protocol info */}
        <div className="mx-5 mb-5 p-3.5 rounded-xl bg-[rgba(59,130,246,0.02)] border border-[rgba(59,130,246,0.08)]">
          <div className="flex items-start gap-3">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[var(--text-muted)] flex-shrink-0 mt-0.5">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
              <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
              <strong className="text-[var(--text-secondary)]">Adaptive Intelligence:</strong>{" "}
              Unlike scripted agents with fixed timers, our agents make strategic decisions: reputation drops
              trigger self-improvement, new peers are challenged immediately, weak domains receive focused
              attention, and difficulty auto-scales based on performance trends.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
