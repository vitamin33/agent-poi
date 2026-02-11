"use client";

import { useState, useEffect, useCallback } from "react";
import { AgentData } from "@/lib/program";

interface ActivityEntry {
  timestamp: string;
  action: string;
  agentName: string;
  riskLevel: "none" | "low" | "medium" | "high" | "critical";
  details: string;
  score?: number | null;
}

interface SecurityDashboardProps {
  agents: AgentData[];
}

/**
 * SentinelAgent Security Dashboard
 * Displays audit trail and security metrics for registered agents.
 * Combines on-chain agent data with live A2A challenge events.
 */
export function SecurityDashboard({ agents }: SecurityDashboardProps) {
  const [activityFeed, setActivityFeed] = useState<ActivityEntry[]>([]);
  const [networkStats, setNetworkStats] = useState({
    totalAgents: 0,
    verifiedAgents: 0,
    avgReputation: 0,
    totalChallenges: 0,
    totalPassed: 0,
  });

  // Build on-chain activity entries (registrations, verifications, challenge counters)
  const buildOnChainFeed = useCallback((): ActivityEntry[] => {
    const feed: ActivityEntry[] = [];

    agents.forEach((agent) => {
      // Registration event — real on-chain timestamp
      feed.push({
        timestamp: new Date(agent.createdAt.toNumber() * 1000).toISOString(),
        action: "Agent Registered",
        agentName: agent.name,
        riskLevel: "none",
        details: `Model: ${agent.modelHash.substring(0, 20)}...`,
      });

      // Verification event — real on-chain timestamp
      if (agent.verified) {
        feed.push({
          timestamp: new Date(agent.updatedAt.toNumber() * 1000).toISOString(),
          action: "Agent Verified",
          agentName: agent.name,
          riskLevel: "none",
          details: "Admin verification complete",
        });
      }

      // On-chain challenge counters — use updatedAt as best-available timestamp
      const updatedTs = new Date(agent.updatedAt.toNumber() * 1000).toISOString();
      if (agent.challengesPassed > 0) {
        feed.push({
          timestamp: updatedTs,
          action: "Challenge Passed",
          agentName: agent.name,
          riskLevel: "none",
          details: `${agent.challengesPassed} on-chain ${agent.challengesPassed === 1 ? "challenge" : "challenges"} • +${agent.challengesPassed * 100} reputation`,
        });
      }
      if (agent.challengesFailed > 0) {
        feed.push({
          timestamp: updatedTs,
          action: "Challenge Failed",
          agentName: agent.name,
          riskLevel: "medium",
          details: `${agent.challengesFailed} on-chain ${agent.challengesFailed === 1 ? "challenge" : "challenges"} • -${agent.challengesFailed * 50} reputation`,
        });
      }
    });

    return feed;
  }, [agents]);

  // Fetch live A2A interactions from the Python agent API
  const fetchA2AEvents = useCallback(async (): Promise<ActivityEntry[]> => {
    try {
      const res = await fetch("/api/a2a?endpoint=interactions");
      if (!res.ok) return [];
      const data = await res.json();

      const interactions = data.recent_interactions || [];
      return interactions.map(
        (ix: Record<string, unknown>) => {
          const challenger = String(ix.challenger || "Unknown");
          const target = String(ix.target || "Unknown");
          const domain = String(ix.question_domain || "general");
          const ts = String(ix.timestamp || new Date().toISOString());

          // Extract judge score from steps
          const steps = (ix.steps as Record<string, unknown>[]) || [];
          const judgeStep = steps.find(
            (s) => s.step === "llm_judge_scoring" && s.status === "scored"
          );
          const score = judgeStep ? Number(judgeStep.score) : null;
          const passed = score !== null && score >= 50;

          const scoreLabel = score !== null ? ` • Score: ${score}/100` : "";
          const domainLabel = domain.charAt(0).toUpperCase() + domain.slice(1);

          return {
            timestamp: ts,
            action: passed ? "A2A Challenge Passed" : score !== null ? "A2A Challenge Failed" : "A2A Challenge",
            agentName: `${challenger} → ${target}`,
            riskLevel: passed ? "none" as const : score !== null ? "medium" as const : "none" as const,
            details: `${domainLabel}${scoreLabel}`,
            score,
          };
        }
      );
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    if (agents.length === 0) return;

    const verifiedCount = agents.filter((a) => a.verified).length;
    const avgRep = agents.reduce((sum, a) => sum + a.reputationScore, 0) / agents.length / 100;
    const totalChallenges = agents.reduce(
      (sum, a) => sum + a.challengesPassed + a.challengesFailed,
      0
    );

    const totalPassed = agents.reduce((sum, a) => sum + a.challengesPassed, 0);

    setNetworkStats({
      totalAgents: agents.length,
      verifiedAgents: verifiedCount,
      avgReputation: avgRep,
      totalChallenges,
      totalPassed,
    });

    // Build combined feed: on-chain + live A2A events
    const onChainFeed = buildOnChainFeed();
    fetchA2AEvents().then((a2aFeed) => {
      const combined = [...onChainFeed, ...a2aFeed];
      combined.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setActivityFeed(combined.slice(0, 30));
    });
  }, [agents, buildOnChainFeed, fetchA2AEvents]);

  // Poll for new A2A events every 30s
  useEffect(() => {
    if (agents.length === 0) return;

    const interval = setInterval(() => {
      const onChainFeed = buildOnChainFeed();
      fetchA2AEvents().then((a2aFeed) => {
        const combined = [...onChainFeed, ...a2aFeed];
        combined.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setActivityFeed(combined.slice(0, 30));
      });
    }, 30000);

    return () => clearInterval(interval);
  }, [agents, buildOnChainFeed, fetchA2AEvents]);

  const getStatusBadge = (entry: ActivityEntry) => {
    // Map actions to meaningful labels instead of abstract risk levels
    const actionBadges: Record<string, { label: string; bg: string; text: string; border: string }> = {
      "A2A Challenge Passed": { label: `${entry.score ?? ""}`, bg: "rgba(16,185,129,0.1)", text: "#10b981", border: "rgba(16,185,129,0.3)" },
      "A2A Challenge Failed": { label: `${entry.score ?? ""}`, bg: "rgba(239,68,68,0.1)", text: "#ef4444", border: "rgba(239,68,68,0.3)" },
      "A2A Challenge": { label: "pending", bg: "rgba(59,130,246,0.1)", text: "#3b82f6", border: "rgba(59,130,246,0.3)" },
      "Challenge Passed": { label: "on-chain", bg: "rgba(16,185,129,0.1)", text: "#10b981", border: "rgba(16,185,129,0.3)" },
      "Challenge Failed": { label: "on-chain", bg: "rgba(245,158,11,0.1)", text: "#f59e0b", border: "rgba(245,158,11,0.3)" },
      "Agent Registered": { label: "on-chain", bg: "rgba(168,85,247,0.1)", text: "#a855f7", border: "rgba(168,85,247,0.3)" },
      "Agent Verified": { label: "verified", bg: "rgba(16,185,129,0.1)", text: "#10b981", border: "rgba(16,185,129,0.3)" },
    };

    const badge = actionBadges[entry.action] || { label: "event", bg: "rgba(100,100,100,0.1)", text: "#888", border: "rgba(100,100,100,0.3)" };
    return (
      <span
        className="px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider"
        style={{ background: badge.bg, color: badge.text, border: `1px solid ${badge.border}` }}
      >
        {badge.label}
      </span>
    );
  };

  const getActionIcon = (action: string) => {
    const icons: Record<string, string> = {
      "Agent Registered": "📝",
      "Agent Verified": "✓",
      "Challenge Passed": "✓",
      "Challenge Failed": "✗",
      "A2A Challenge Passed": "⚡",
      "A2A Challenge Failed": "⚡",
      "A2A Challenge": "⚡",
      "Security Alert": "⚠",
    };
    return icons[action] || "•";
  };

  const getIconStyle = (action: string, riskLevel: ActivityEntry["riskLevel"]) => {
    if (action.startsWith("A2A")) {
      return {
        background: "rgba(0,240,255,0.1)",
        color: "#00f0ff",
      };
    }
    return {
      background: riskLevel === "none"
        ? "rgba(16,185,129,0.1)"
        : riskLevel === "medium"
        ? "rgba(245,158,11,0.1)"
        : "rgba(239,68,68,0.1)",
      color: riskLevel === "none"
        ? "#10b981"
        : riskLevel === "medium"
        ? "#f59e0b"
        : "#ef4444",
    };
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[rgba(0,240,255,0.1)] overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-[rgba(0,240,255,0.1)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[var(--bg-deep)]">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="currentColor"/>
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                SentinelAgent Security Monitor
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                On-chain activity feed with real-time agent monitoring
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[rgba(16,185,129,0.1)] border border-[rgba(16,185,129,0.3)]">
            <span className="w-2 h-2 rounded-full bg-[#10b981] status-live" />
            <span className="text-sm text-[#10b981] font-medium">Live</span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-[rgba(0,240,255,0.05)]">
        {[
          { label: "Total Agents", value: networkStats.totalAgents, color: "var(--accent-primary)" },
          { label: "Verified", value: networkStats.verifiedAgents, color: "#10b981" },
          { label: "On-Chain Rep", value: `${networkStats.avgReputation.toFixed(1)}%`, color: "#a855f7" },
          { label: "Challenges", value: networkStats.totalChallenges, color: "#3b82f6" },
          { label: "Pass Rate", value: networkStats.totalChallenges > 0 ? `${Math.round(networkStats.totalPassed / networkStats.totalChallenges * 100)}%` : "—", color: "#10b981" },
        ].map((stat, i) => (
          <div key={i} className="bg-[var(--bg-elevated)] p-4">
            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">
              {stat.label}
            </p>
            <p className="text-2xl font-bold" style={{ color: stat.color }}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Activity Feed */}
      <div className="p-6">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)]" />
          Activity Feed
        </h3>
        <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
          {activityFeed.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-muted)]">
              <p>No activity yet</p>
              <p className="text-sm mt-1">Agent actions will appear here</p>
            </div>
          ) : (
            activityFeed.map((entry, idx) => (
              <div
                key={idx}
                className="activity-item flex items-center justify-between rounded-lg p-3"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                    style={getIconStyle(entry.action, entry.riskLevel)}
                  >
                    {getActionIcon(entry.action)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      {entry.action}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {entry.agentName} • {entry.details}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {getStatusBadge(entry)}
                  <span className="text-xs text-[var(--text-muted)] min-w-[60px] text-right">
                    {formatTime(entry.timestamp)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Audit Infrastructure Notice */}
      <div className="m-6 mt-0 p-4 rounded-xl bg-[rgba(168,85,247,0.05)] border border-[rgba(168,85,247,0.2)]">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-[rgba(168,85,247,0.1)] flex items-center justify-center flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[#a855f7]">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="2"/>
            </svg>
          </div>
          <div>
            <h4 className="text-sm font-medium text-[#a855f7] mb-1">
              On-Chain Audit Infrastructure
            </h4>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              Every agent action is SHA256-hashed, batched into Merkle trees, and committed to Solana.
              This creates a tamper-proof, publicly verifiable record of all AI decisions &mdash;
              the foundational layer for regulatory transparency (EU AI Act, Aug 2026).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
