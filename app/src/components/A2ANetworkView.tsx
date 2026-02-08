"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Peer {
  name: string;
  url: string;
  status: "online" | "offline" | "error" | "unreachable";
  last_seen: string;
  agent_id: number;
  owner: string;
  reputation: number;
  verified: boolean;
  version: string;
  capabilities: string;
}

interface PeersResponse {
  agent_name: string;
  configured_peers: string[];
  discovered_peers: number;
  online_peers: number;
  peers: Peer[];
}

interface InteractionStep {
  step: string;
  status: string;
  peer_answer_preview?: string;
  hash_matches?: boolean;
  tx?: string;
  target_pda?: string;
  http_status?: number;
  error?: string;
  reason?: string;
}

interface Interaction {
  timestamp: string;
  challenger: string;
  target: string;
  target_url: string;
  question: string;
  steps: InteractionStep[];
  completed_at: string;
  on_chain_tx: string | null;
}

interface InteractionsResponse {
  agent_name: string;
  a2a_protocol: boolean;
  summary: {
    total_interactions: number;
    successful_on_chain: number;
    http_only: number;
    unique_peers: number;
  };
  recent_interactions: Interaction[];
}

interface A2ANetworkViewProps {
  agentUrl?: string;
}

/* ------------------------------------------------------------------ */
/*  Personality colors (matching agent config)                         */
/* ------------------------------------------------------------------ */

const PERSONALITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  aggressive: { bg: "rgba(239,68,68,0.1)", text: "#ef4444", border: "rgba(239,68,68,0.3)" },
  analytical: { bg: "rgba(59,130,246,0.1)", text: "#3b82f6", border: "rgba(59,130,246,0.3)" },
  cooperative: { bg: "rgba(16,185,129,0.1)", text: "#10b981", border: "rgba(16,185,129,0.3)" },
};

function getPersonalityFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("alpha")) return "aggressive";
  if (lower.includes("beta")) return "analytical";
  if (lower.includes("gamma")) return "cooperative";
  return "analytical";
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return date.toLocaleDateString();
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.substring(0, max) + "..." : s;
}

function explorerTxUrl(tx: string): string {
  return `https://explorer.solana.com/tx/${tx}?cluster=devnet`;
}

/* ------------------------------------------------------------------ */
/*  Network Node                                                       */
/* ------------------------------------------------------------------ */

function NetworkNode({
  name,
  reputation,
  status,
  verified,
  isSelf,
  personality,
  pulseNew,
}: {
  name: string;
  reputation: number;
  status: string;
  verified: boolean;
  isSelf: boolean;
  personality: string;
  pulseNew: boolean;
}) {
  const pColor = PERSONALITY_COLORS[personality] || PERSONALITY_COLORS.analytical;
  const isOnline = status === "online";

  return (
    <div className={`relative flex flex-col items-center ${pulseNew ? "animate-a2a-pulse" : ""}`}>
      {/* Outer ring */}
      <div
        className="relative w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center"
        style={{
          background: `linear-gradient(135deg, ${pColor.bg}, rgba(0,0,0,0))`,
          border: `2px solid ${isOnline ? pColor.border : "rgba(100,116,139,0.3)"}`,
          boxShadow: isOnline ? `0 0 20px ${pColor.bg}` : "none",
        }}
      >
        {/* Inner circle */}
        <div className="w-14 h-14 md:w-18 md:h-18 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center border border-[rgba(0,240,255,0.1)]">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ color: pColor.text }}>
            <rect x="3" y="4" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
            <circle cx="9" cy="10" r="2" fill="currentColor" />
            <circle cx="15" cy="10" r="2" fill="currentColor" />
            <path d="M8 20h8M12 16v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>

        {/* Online dot */}
        <div className="absolute top-0 right-0">
          <span
            className={`block w-3 h-3 rounded-full ${isOnline ? "status-live" : ""}`}
            style={{ backgroundColor: isOnline ? "#10b981" : "#64748b" }}
          />
        </div>
      </div>

      {/* Name & info */}
      <div className="mt-2 text-center">
        <p className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-1 justify-center">
          {name}
          {isSelf && (
            <span className="text-[10px] text-[var(--accent-primary)]">(self)</span>
          )}
        </p>

        {/* Personality badge */}
        <span
          className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider"
          style={{ background: pColor.bg, color: pColor.text, border: `1px solid ${pColor.border}` }}
        >
          {personality}
        </span>

        {/* Reputation */}
        <p className="text-xs text-[var(--text-muted)] mt-1">
          Rep: <span className="text-[var(--accent-primary)] font-mono">{(reputation / 100).toFixed(1)}</span>
        </p>

        {verified && (
          <span className="badge-verified scanline-effect px-1.5 py-0.5 rounded text-[10px] font-medium mt-1 inline-block">
            Verified
          </span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Interaction Item                                                   */
/* ------------------------------------------------------------------ */

function InteractionItem({
  interaction,
  isNew,
}: {
  interaction: Interaction;
  isNew: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasOnChain = !!interaction.on_chain_tx;

  const httpStep = interaction.steps.find((s) => s.step === "a2a_http_challenge");
  const onChainStep = interaction.steps.find((s) => s.step === "on_chain_challenge");

  return (
    <div
      className={`
        rounded-lg border transition-all duration-500 cursor-pointer
        ${isNew ? "animate-slide-in border-[rgba(0,240,255,0.3)] bg-[var(--bg-surface)]" : "border-[rgba(0,240,255,0.05)] bg-[var(--bg-elevated)]"}
        hover:border-[rgba(0,240,255,0.2)]
      `}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Summary row */}
      <div className="flex items-center gap-3 p-3">
        {/* Direction arrow */}
        <div className="flex-shrink-0 flex items-center gap-1.5">
          <span className="text-xs font-semibold text-[#a855f7]">{interaction.challenger}</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[var(--accent-primary)]">
            <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-xs font-semibold text-[#22d3ee]">{interaction.target}</span>
        </div>

        {/* Question preview */}
        <span className="flex-1 text-xs text-[var(--text-secondary)] truncate min-w-0">
          &quot;{truncate(interaction.question, 50)}&quot;
        </span>

        {/* Status badges */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {hasOnChain ? (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[rgba(16,185,129,0.1)] text-[#10b981] border border-[rgba(16,185,129,0.3)]">
              ON-CHAIN
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[rgba(245,158,11,0.1)] text-[#f59e0b] border border-[rgba(245,158,11,0.3)]">
              HTTP
            </span>
          )}
          <span className="text-[10px] text-[var(--text-muted)]">
            {formatRelativeTime(interaction.timestamp)}
          </span>
        </div>

        {/* Expand icon */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`text-[var(--text-muted)] transition-transform duration-200 flex-shrink-0 ${expanded ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3 pb-3 pt-0 border-t border-[rgba(0,240,255,0.05)]">
          <div className="space-y-2 mt-2">
            {/* Steps */}
            {interaction.steps.map((step, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <span
                  className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    step.status === "success" || step.status === "created"
                      ? "bg-[rgba(16,185,129,0.1)] text-[#10b981]"
                      : step.status === "failed" || step.status === "error"
                        ? "bg-[rgba(239,68,68,0.1)] text-[#ef4444]"
                        : "bg-[rgba(245,158,11,0.1)] text-[#f59e0b]"
                  }`}
                >
                  {idx + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-[var(--text-primary)]">
                    <span className="font-medium">{step.step.replace(/_/g, " ")}</span>
                    <span className="text-[var(--text-muted)]"> - {step.status}</span>
                  </p>
                  {step.peer_answer_preview && (
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5 truncate">
                      Answer: &quot;{truncate(step.peer_answer_preview, 80)}&quot;
                    </p>
                  )}
                  {step.tx && (
                    <a
                      href={explorerTxUrl(step.tx)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-[var(--accent-primary)] hover:underline mt-0.5 inline-block"
                      onClick={(e) => e.stopPropagation()}
                    >
                      TX: {step.tx.substring(0, 16)}... (Explorer)
                    </a>
                  )}
                  {step.error && (
                    <p className="text-[11px] text-[#ef4444] mt-0.5 truncate">
                      {truncate(step.error, 80)}
                    </p>
                  )}
                </div>
              </div>
            ))}

            {/* On-chain TX link at bottom */}
            {interaction.on_chain_tx && (
              <div className="pt-1 border-t border-[rgba(0,240,255,0.05)]">
                <a
                  href={explorerTxUrl(interaction.on_chain_tx)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[var(--accent-primary)] hover:underline flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
                  </svg>
                  View on Solana Explorer
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function A2ANetworkView({ agentUrl }: A2ANetworkViewProps) {
  const baseUrl = agentUrl || process.env.NEXT_PUBLIC_AGENT_API_URL || "http://localhost:8001";

  const [peersData, setPeersData] = useState<PeersResponse | null>(null);
  const [interactionsData, setInteractionsData] = useState<InteractionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [newInteractionIds, setNewInteractionIds] = useState<Set<string>>(new Set());
  const prevInteractionCountRef = useRef(0);

  // Fetch data from the proxy API route
  const fetchData = useCallback(async () => {
    try {
      const [peersRes, interactionsRes] = await Promise.all([
        fetch("/api/a2a?endpoint=peers"),
        fetch("/api/a2a?endpoint=interactions"),
      ]);

      if (peersRes.ok) {
        const pData: PeersResponse = await peersRes.json();
        setPeersData(pData);
      }

      if (interactionsRes.ok) {
        const iData: InteractionsResponse = await interactionsRes.json();

        // Detect new interactions for pulse animation
        if (iData.recent_interactions.length > prevInteractionCountRef.current) {
          const newIds = new Set<string>();
          const newOnes = iData.recent_interactions.slice(
            0,
            iData.recent_interactions.length - prevInteractionCountRef.current
          );
          newOnes.forEach((i) => newIds.add(i.timestamp));
          setNewInteractionIds(newIds);

          // Clear animation after 3s
          setTimeout(() => setNewInteractionIds(new Set()), 3000);
        }
        prevInteractionCountRef.current = iData.recent_interactions.length;

        setInteractionsData(iData);
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch A2A data");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + polling
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Build node data (self + peers)
  const selfName = peersData?.agent_name || "Agent";
  const peers = peersData?.peers || [];

  // All nodes for the network visualization
  const allNodes = [
    {
      name: selfName,
      reputation: 5000,
      status: "online" as const,
      verified: true,
      isSelf: true,
      personality: getPersonalityFromName(selfName),
    },
    ...peers.map((p) => ({
      name: p.name || "Unknown",
      reputation: p.reputation || 0,
      status: p.status,
      verified: p.verified || false,
      isSelf: false,
      personality: getPersonalityFromName(p.name || ""),
    })),
  ];

  const summary = interactionsData?.summary || {
    total_interactions: 0,
    successful_on_chain: 0,
    http_only: 0,
    unique_peers: 0,
  };

  const recentInteractions = interactionsData?.recent_interactions || [];

  return (
    <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[rgba(0,240,255,0.1)] overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between p-6 border-b border-[rgba(0,240,255,0.1)] cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[var(--bg-deep)]">
              <circle cx="5" cy="12" r="3" fill="currentColor" />
              <circle cx="19" cy="12" r="3" fill="currentColor" />
              <circle cx="12" cy="5" r="3" fill="currentColor" />
              <path d="M7.5 10.5L10.5 6.5M16.5 10.5L13.5 6.5M7 13L17 13" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              A2A Network
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Agent-to-Agent Protocol - Live Interactions
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Online count */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[rgba(16,185,129,0.1)] border border-[rgba(16,185,129,0.3)]">
            <span className="w-2 h-2 rounded-full bg-[#10b981] status-live" />
            <span className="text-sm text-[#10b981] font-medium">
              {peersData?.online_peers ?? 0} peers
            </span>
          </div>

          {/* Expand/collapse */}
          <svg
            width="20"
            height="20"
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
      <div
        className={`transition-all duration-300 overflow-hidden ${
          isExpanded ? "max-h-[2000px]" : "max-h-0"
        }`}
      >
        {loading ? (
          <div className="text-center py-12">
            <div className="relative w-12 h-12 mx-auto mb-4">
              <div className="absolute inset-0 rounded-full border-4 border-[var(--bg-surface)]" />
              <div className="absolute inset-0 rounded-full border-4 border-t-[var(--accent-primary)] animate-spin" />
            </div>
            <p className="text-sm text-[var(--text-muted)]">Connecting to A2A network...</p>
          </div>
        ) : error ? (
          <div className="p-6">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.3)]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#f59e0b] flex-shrink-0">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <div>
                <p className="text-sm text-[#f59e0b]">Agent API unavailable</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Ensure Python agents are running at {baseUrl}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Network Topology Visualization */}
            <div className="p-6">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)]" />
                Network Topology
              </h3>

              <div className="relative">
                {/* SVG connection lines (drawn behind nodes) */}
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  viewBox="0 0 600 240"
                  preserveAspectRatio="xMidYMid meet"
                  style={{ zIndex: 0 }}
                >
                  <defs>
                    <linearGradient id="line-grad-1" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="rgba(0,240,255,0.4)" />
                      <stop offset="100%" stopColor="rgba(168,85,247,0.4)" />
                    </linearGradient>
                    <linearGradient id="line-grad-2" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="rgba(168,85,247,0.3)" />
                      <stop offset="100%" stopColor="rgba(16,185,129,0.3)" />
                    </linearGradient>
                    <linearGradient id="line-grad-3" x1="0%" y1="100%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="rgba(16,185,129,0.3)" />
                      <stop offset="100%" stopColor="rgba(0,240,255,0.3)" />
                    </linearGradient>
                  </defs>

                  {/* Triangle lines connecting up to 3 nodes */}
                  {allNodes.length >= 2 && (
                    <>
                      {/* Top to bottom-left */}
                      <line
                        x1="300" y1="50" x2="150" y2="200"
                        stroke="url(#line-grad-1)"
                        strokeWidth="2"
                        strokeDasharray="6 4"
                        className="animate-a2a-dash"
                      />
                      {/* Top to bottom-right */}
                      <line
                        x1="300" y1="50" x2="450" y2="200"
                        stroke="url(#line-grad-2)"
                        strokeWidth="2"
                        strokeDasharray="6 4"
                        className="animate-a2a-dash"
                      />
                    </>
                  )}
                  {allNodes.length >= 3 && (
                    /* Bottom-left to bottom-right */
                    <line
                      x1="150" y1="200" x2="450" y2="200"
                      stroke="url(#line-grad-3)"
                      strokeWidth="2"
                      strokeDasharray="6 4"
                      className="animate-a2a-dash"
                    />
                  )}
                </svg>

                {/* Nodes positioned in triangle layout */}
                <div className="relative" style={{ minHeight: 260 }}>
                  {/* Top node (self) */}
                  {allNodes[0] && (
                    <div className="absolute left-1/2 top-0 -translate-x-1/2" style={{ zIndex: 1 }}>
                      <NetworkNode
                        {...allNodes[0]}
                        pulseNew={newInteractionIds.size > 0}
                      />
                    </div>
                  )}

                  {/* Bottom-left node */}
                  {allNodes[1] && (
                    <div className="absolute left-[15%] md:left-[20%] bottom-0" style={{ zIndex: 1 }}>
                      <NetworkNode
                        {...allNodes[1]}
                        pulseNew={newInteractionIds.size > 0}
                      />
                    </div>
                  )}

                  {/* Bottom-right node */}
                  {allNodes[2] && (
                    <div className="absolute right-[15%] md:right-[20%] bottom-0" style={{ zIndex: 1 }}>
                      <NetworkNode
                        {...allNodes[2]}
                        pulseNew={newInteractionIds.size > 0}
                      />
                    </div>
                  )}

                  {/* Extra nodes (if more than 3) */}
                  {allNodes.slice(3).map((node, idx) => (
                    <div
                      key={idx}
                      className="absolute"
                      style={{
                        left: `${50 + 30 * Math.cos((idx * Math.PI) / 3)}%`,
                        top: `${50 + 30 * Math.sin((idx * Math.PI) / 3)}%`,
                        transform: "translate(-50%, -50%)",
                        zIndex: 1,
                      }}
                    >
                      <NetworkNode {...node} pulseNew={false} />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[rgba(0,240,255,0.05)]">
              {[
                { label: "Total A2A", value: summary.total_interactions, color: "var(--accent-primary)" },
                { label: "On-Chain", value: summary.successful_on_chain, color: "#10b981" },
                { label: "HTTP Only", value: summary.http_only, color: "#f59e0b" },
                { label: "Unique Peers", value: summary.unique_peers, color: "#a855f7" },
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

            {/* Interaction Feed */}
            <div className="p-6">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-secondary)]" />
                Interaction Feed
                {recentInteractions.length > 0 && (
                  <span className="px-2 py-0.5 text-xs rounded-full bg-[var(--bg-surface)] text-[var(--text-muted)]">
                    {recentInteractions.length}
                  </span>
                )}
              </h3>

              <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar pr-1">
                {recentInteractions.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[var(--bg-surface)] flex items-center justify-center">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--text-muted)]">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    </div>
                    <p className="text-sm text-[var(--text-muted)]">
                      Waiting for A2A interactions...
                    </p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      Agents challenge each other every ~2 minutes
                    </p>
                  </div>
                ) : (
                  [...recentInteractions].reverse().map((interaction, idx) => (
                    <InteractionItem
                      key={interaction.timestamp + idx}
                      interaction={interaction}
                      isNew={newInteractionIds.has(interaction.timestamp)}
                    />
                  ))
                )}
              </div>
            </div>

            {/* A2A Protocol info */}
            <div className="m-6 mt-0 p-4 rounded-xl bg-[rgba(0,240,255,0.03)] border border-[rgba(0,240,255,0.1)]">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-[rgba(0,240,255,0.1)] flex items-center justify-center flex-shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[var(--accent-primary)]">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                    <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-[var(--accent-primary)] mb-1">
                    A2A Protocol Flow
                  </h4>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    Agents discover peers via HTTP, send challenge questions, verify answers,
                    and record results on-chain. Each interaction creates an immutable audit trail
                    on Solana devnet with cryptographic proofs.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
