"use client";

import { useState, useMemo } from "react";
import { AgentData, getAgentPDA } from "@/lib/program";
import { useWallet } from "@solana/wallet-adapter-react";
import { ChallengeModal } from "./ChallengeModal";

interface AgentLeaderboardProps {
  agents: AgentData[];
  onChallengeCreated?: () => void;
}

type SortKey = "reputation" | "passed" | "failed" | "rate" | "name";
type SortDir = "asc" | "desc";

/** Mini circular gauge for table rows */
function MiniGauge({ value, size = 44 }: { value: number; size?: number }) {
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(value, 100) / 100;
  const offset = circumference * (1 - progress);
  const color =
    value >= 70 ? "#10b981" : value >= 50 ? "#f59e0b" : "#ef4444";

  return (
    <div className="relative inline-flex" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="3"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            filter: `drop-shadow(0 0 4px ${color}50)`,
            transition: "stroke-dashoffset 0.8s ease-out",
          }}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-xs font-bold"
        style={{ color }}
      >
        {value.toFixed(0)}
      </span>
    </div>
  );
}

/** Rank badge inline */
function RankBadge({ rank }: { rank: number }) {
  if (rank === 1)
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-md text-xs font-bold bg-gradient-to-br from-yellow-400 to-amber-600 text-black">
        1
      </span>
    );
  if (rank === 2)
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-md text-xs font-bold bg-gradient-to-br from-gray-300 to-gray-500 text-black">
        2
      </span>
    );
  if (rank === 3)
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-md text-xs font-bold bg-gradient-to-br from-amber-600 to-amber-800 text-white">
        3
      </span>
    );
  return (
    <span className="inline-flex items-center justify-center w-7 h-7 rounded-md text-xs font-semibold bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[rgba(0,240,255,0.15)]">
      {rank}
    </span>
  );
}

/** Sortable column header */
function SortHeader({
  label,
  sortKey,
  current,
  dir,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
  align?: "left" | "center" | "right";
}) {
  const active = current === sortKey;
  const alignCls =
    align === "center"
      ? "justify-center"
      : align === "right"
        ? "justify-end"
        : "justify-start";

  return (
    <button
      onClick={() => onSort(sortKey)}
      className={`flex items-center gap-1 ${alignCls} w-full text-[10px] uppercase tracking-wider font-semibold transition-colors ${
        active
          ? "text-[var(--accent-primary)]"
          : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
      }`}
    >
      {label}
      {active && (
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          className={`transition-transform ${dir === "asc" ? "rotate-180" : ""}`}
        >
          <path d="M2 3.5L5 7L8 3.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      )}
    </button>
  );
}

export function AgentLeaderboard({ agents, onChallengeCreated }: AgentLeaderboardProps) {
  const wallet = useWallet();
  const [sortKey, setSortKey] = useState<SortKey>("reputation");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [challengeAgent, setChallengeAgent] = useState<AgentData | null>(null);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  // Filter out test/junk agents
  const filteredAgents = useMemo(() => {
    if (showAll) return agents;
    return agents.filter((a) => {
      const isVerified = a.verified;
      const isKnownAgent = a.name.startsWith("PoI-");
      return isVerified || isKnownAgent;
    });
  }, [agents, showAll]);

  // Sort
  const sortedAgents = useMemo(() => {
    const sorted = [...filteredAgents];
    const m = sortDir === "desc" ? -1 : 1;
    sorted.sort((a, b) => {
      switch (sortKey) {
        case "reputation":
          return m * (a.reputationScore - b.reputationScore);
        case "passed":
          return m * (a.challengesPassed - b.challengesPassed);
        case "failed":
          return m * (a.challengesFailed - b.challengesFailed);
        case "rate": {
          const rA =
            a.challengesPassed + a.challengesFailed > 0
              ? a.challengesPassed / (a.challengesPassed + a.challengesFailed)
              : 0;
          const rB =
            b.challengesPassed + b.challengesFailed > 0
              ? b.challengesPassed / (b.challengesPassed + b.challengesFailed)
              : 0;
          return m * (rA - rB);
        }
        case "name":
          return m * a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });
    return sorted;
  }, [filteredAgents, sortKey, sortDir]);

  const hiddenCount = agents.length - filteredAgents.length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Agent Leaderboard
          </h2>
          <p className="text-sm text-[var(--text-muted)]">
            {filteredAgents.length} agents ranked by on-chain reputation
            {hiddenCount > 0 && !showAll && (
              <button
                onClick={() => setShowAll(true)}
                className="ml-2 text-[var(--accent-primary)] hover:underline"
              >
                +{hiddenCount} hidden
              </button>
            )}
            {showAll && hiddenCount > 0 && (
              <button
                onClick={() => setShowAll(false)}
                className="ml-2 text-[var(--accent-primary)] hover:underline"
              >
                hide test agents
              </button>
            )}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[rgba(0,240,255,0.1)] bg-[var(--bg-elevated)] overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[48px_1fr_80px_72px_72px_72px_80px] items-center gap-2 px-4 py-3 border-b border-[rgba(0,240,255,0.08)] bg-[var(--bg-surface)]">
          <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider text-center">
            #
          </span>
          <SortHeader
            label="Agent"
            sortKey="name"
            current={sortKey}
            dir={sortDir}
            onSort={handleSort}
          />
          <SortHeader
            label="Score"
            sortKey="reputation"
            current={sortKey}
            dir={sortDir}
            onSort={handleSort}
            align="center"
          />
          <SortHeader
            label="Passed"
            sortKey="passed"
            current={sortKey}
            dir={sortDir}
            onSort={handleSort}
            align="center"
          />
          <SortHeader
            label="Failed"
            sortKey="failed"
            current={sortKey}
            dir={sortDir}
            onSort={handleSort}
            align="center"
          />
          <SortHeader
            label="Rate"
            sortKey="rate"
            current={sortKey}
            dir={sortDir}
            onSort={handleSort}
            align="center"
          />
          <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider text-center">
            Status
          </span>
        </div>

        {/* Rows */}
        {sortedAgents.length === 0 ? (
          <div className="py-12 text-center text-[var(--text-muted)]">
            No agents found
          </div>
        ) : (
          sortedAgents.map((agent, idx) => {
            const reputation = agent.reputationScore / 100;
            const total = agent.challengesPassed + agent.challengesFailed;
            const passRate =
              total > 0
                ? Math.round((agent.challengesPassed / total) * 100)
                : 0;
            const isOwner = wallet.publicKey?.equals(agent.owner);
            const expanded = expandedId === agent.agentId.toString();
            const rank = idx + 1;

            return (
              <div key={agent.agentId.toString()}>
                {/* Main row */}
                <button
                  onClick={() =>
                    setExpandedId(expanded ? null : agent.agentId.toString())
                  }
                  className={`w-full grid grid-cols-[48px_1fr_80px_72px_72px_72px_80px] items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-[rgba(0,240,255,0.03)] ${
                    expanded ? "bg-[rgba(0,240,255,0.05)]" : ""
                  } ${idx < sortedAgents.length - 1 && !expanded ? "border-b border-[rgba(0,240,255,0.05)]" : ""}`}
                >
                  {/* Rank */}
                  <div className="flex justify-center">
                    <RankBadge rank={rank} />
                  </div>

                  {/* Name */}
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold text-[var(--text-primary)] truncate">
                      {agent.name}
                    </span>
                    {agent.verified && (
                      <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[rgba(16,185,129,0.15)] text-[#10b981] border border-[rgba(16,185,129,0.3)]">
                        Verified
                      </span>
                    )}
                    {isOwner && (
                      <span className="flex-shrink-0 text-[10px] text-[var(--accent-primary)] font-medium">
                        You
                      </span>
                    )}
                  </div>

                  {/* Reputation gauge */}
                  <div className="flex justify-center">
                    <MiniGauge value={reputation} />
                  </div>

                  {/* Passed */}
                  <div className="text-center font-semibold text-[#10b981]">
                    {agent.challengesPassed}
                  </div>

                  {/* Failed */}
                  <div className="text-center font-semibold text-[#ef4444]">
                    {agent.challengesFailed}
                  </div>

                  {/* Pass rate */}
                  <div className="text-center">
                    <span
                      className="font-semibold"
                      style={{
                        color:
                          passRate >= 70
                            ? "#10b981"
                            : passRate >= 50
                              ? "#f59e0b"
                              : "#ef4444",
                      }}
                    >
                      {total > 0 ? `${passRate}%` : "-"}
                    </span>
                  </div>

                  {/* Status */}
                  <div className="flex justify-center">
                    {total > 0 ? (
                      <span className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium bg-[rgba(16,185,129,0.1)] text-[#10b981] border border-[rgba(16,185,129,0.2)]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] status-live" />
                        Active
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium bg-[rgba(107,114,128,0.1)] text-[#6b7280] border border-[rgba(107,114,128,0.2)]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#6b7280]" />
                        Idle
                      </span>
                    )}
                  </div>
                </button>

                {/* Expanded detail */}
                {expanded && (
                  <div className="px-4 pb-4 pt-1 border-b border-[rgba(0,240,255,0.08)] bg-[rgba(0,240,255,0.02)]">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 ml-[48px]">
                      {/* Model hash */}
                      <div>
                        <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">
                          Model Hash
                        </p>
                        <p className="text-xs font-mono text-[var(--text-secondary)] break-all bg-[var(--bg-surface)] rounded px-2 py-1.5 border border-[rgba(0,240,255,0.05)]">
                          {agent.modelHash}
                        </p>
                      </div>

                      {/* Capabilities */}
                      <div>
                        <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">
                          Capabilities
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {agent.capabilities.split(",").map((cap) => (
                            <span
                              key={cap}
                              className="px-2 py-0.5 rounded text-[10px] font-medium bg-[rgba(168,85,247,0.12)] text-[#c084fc] border border-[rgba(168,85,247,0.25)]"
                            >
                              {cap.trim()}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Owner + Actions */}
                      <div>
                        <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">
                          Owner
                        </p>
                        <p className="text-xs font-mono text-[var(--text-secondary)] mb-3">
                          {agent.owner.toString().substring(0, 20)}...
                        </p>
                        <div className="flex gap-2">
                          {!isOwner && wallet.publicKey && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setChallengeAgent(agent);
                              }}
                              className="btn-primary px-4 py-1.5 rounded-lg text-xs font-semibold"
                            >
                              Challenge
                            </button>
                          )}
                          <a
                            href={`https://explorer.solana.com/address/${getAgentPDA(agent.owner, agent.agentId)[0].toString()}?cluster=devnet`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="btn-secondary px-4 py-1.5 rounded-lg text-xs font-medium"
                          >
                            Explorer
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Challenge Modal */}
      {challengeAgent && (
        <ChallengeModal
          agent={challengeAgent}
          agentPda={getAgentPDA(challengeAgent.owner, challengeAgent.agentId)[0]}
          onClose={() => setChallengeAgent(null)}
          onSuccess={() => {
            setChallengeAgent(null);
            onChallengeCreated?.();
          }}
        />
      )}
    </div>
  );
}
