"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { DEMO_PEERS, DEMO_INTERACTIONS, DEMO_STATUS } from "@/lib/demoData";

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
  personality?: string;
  model?: string;
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
  peer_answer_hash?: string;
  hash_matches?: boolean;
  tx?: string;
  target_pda?: string;
  http_status?: number;
  error?: string;
  reason?: string;
  score?: number;
  explanation?: string;
  method?: string;
  peer_new_reputation?: number;
}

interface Interaction {
  timestamp: string;
  challenger: string;
  target: string;
  target_url: string;
  question: string;
  question_domain?: string;
  question_difficulty?: string;
  steps: InteractionStep[];
  completed_at: string;
  on_chain_tx: string | null;
  submit_tx?: string | null;
  judge_score?: number | null;
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

interface AgentStatusResponse {
  name: string;
  reputation_score: number;
  challenges_passed: number;
  challenges_failed: number;
  verified: boolean;
  agent_id: number;
}

interface A2ANetworkViewProps {
  agentUrl?: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PERSONALITY_COLORS: Record<string, { bg: string; text: string; border: string; gradient: string; label: string; icon: string }> = {
  defi: { bg: "rgba(168,85,247,0.1)", text: "#a855f7", border: "rgba(168,85,247,0.3)", gradient: "from-purple-500/20 to-fuchsia-500/10", label: "DeFi Specialist", icon: "\u26A1" },
  security: { bg: "rgba(239,68,68,0.1)", text: "#ef4444", border: "rgba(239,68,68,0.3)", gradient: "from-red-500/20 to-orange-500/10", label: "Security Auditor", icon: "\uD83D\uDEE1\uFE0F" },
  solana: { bg: "rgba(0,240,255,0.1)", text: "#00f0ff", border: "rgba(0,240,255,0.3)", gradient: "from-cyan-500/20 to-blue-500/10", label: "Solana Expert", icon: "\u2B21" },
  // Legacy fallback mappings
  aggressive: { bg: "rgba(168,85,247,0.1)", text: "#a855f7", border: "rgba(168,85,247,0.3)", gradient: "from-purple-500/20 to-fuchsia-500/10", label: "DeFi Specialist", icon: "\u26A1" },
  analytical: { bg: "rgba(239,68,68,0.1)", text: "#ef4444", border: "rgba(239,68,68,0.3)", gradient: "from-red-500/20 to-orange-500/10", label: "Security Auditor", icon: "\uD83D\uDEE1\uFE0F" },
  cooperative: { bg: "rgba(0,240,255,0.1)", text: "#00f0ff", border: "rgba(0,240,255,0.3)", gradient: "from-cyan-500/20 to-blue-500/10", label: "Solana Expert", icon: "\u2B21" },
};

const DOMAIN_COLORS: Record<string, { bg: string; text: string; border: string; label: string }> = {
  defi: { bg: "rgba(168,85,247,0.1)", text: "#a855f7", border: "rgba(168,85,247,0.3)", label: "DeFi" },
  solana: { bg: "rgba(0,240,255,0.1)", text: "#00f0ff", border: "rgba(0,240,255,0.3)", label: "Solana" },
  security: { bg: "rgba(239,68,68,0.1)", text: "#ef4444", border: "rgba(239,68,68,0.3)", label: "Security" },
  general: { bg: "rgba(148,163,184,0.1)", text: "#94a3b8", border: "rgba(148,163,184,0.3)", label: "General" },
};

const DIFFICULTY_COLORS: Record<string, { text: string }> = {
  easy: { text: "#10b981" },
  medium: { text: "#f59e0b" },
  hard: { text: "#ef4444" },
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getPersonalityFromName(name: string, personality?: string): string {
  // Use actual personality from API if available
  if (personality) return personality;
  // Fallback mapping from agent name to domain specialization
  const lower = name.toLowerCase();
  if (lower.includes("alpha")) return "defi";
  if (lower.includes("beta")) return "security";
  if (lower.includes("gamma")) return "solana";
  return "defi";
}

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
  return s.length > max ? s.substring(0, max) + "\u2026" : s;
}

function explorerTxUrl(tx: string): string {
  return `https://explorer.solana.com/tx/${tx}?cluster=devnet`;
}

function getScoreColor(score: number): string {
  if (score >= 80) return "#10b981";
  if (score >= 60) return "#f59e0b";
  if (score >= 40) return "#f97316";
  return "#ef4444";
}

function getScoreLabel(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 80) return "Good";
  if (score >= 60) return "Fair";
  if (score >= 40) return "Weak";
  return "Poor";
}

function getAgentInitials(name: string): string {
  return name.replace("PoI-", "").charAt(0).toUpperCase();
}

/* ------------------------------------------------------------------ */
/*  Score Ring                                                         */
/* ------------------------------------------------------------------ */

function ScoreRing({ score, size = 36 }: { score: number; size?: number }) {
  const color = getScoreColor(score);
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - score / 100);

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(100,116,139,0.15)"
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
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{
            transition: "stroke-dashoffset 0.8s ease-out",
            filter: `drop-shadow(0 0 4px ${color}40)`,
          }}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center font-bold"
        style={{ color, fontSize: size < 40 ? "10px" : "14px" }}
      >
        {score}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Interaction Row                                                    */
/* ------------------------------------------------------------------ */

function InteractionRow({
  interaction,
  isNew,
}: {
  interaction: Interaction;
  isNew: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasOnChain = !!interaction.on_chain_tx;
  const hasSubmit = !!interaction.submit_tx;

  const domain = interaction.question_domain;
  const difficulty = interaction.question_difficulty;
  const domainColor = domain ? DOMAIN_COLORS[domain] : null;
  const diffColor = difficulty ? DIFFICULTY_COLORS[difficulty] : null;
  const judgeScore = interaction.judge_score;

  const challengerPersonality = getPersonalityFromName(interaction.challenger);
  const targetPersonality = getPersonalityFromName(interaction.target);
  const cColor = PERSONALITY_COLORS[challengerPersonality] || PERSONALITY_COLORS.defi;
  const tColor = PERSONALITY_COLORS[targetPersonality] || PERSONALITY_COLORS.defi;

  return (
    <div
      className={`
        rounded-lg transition-all duration-300
        ${isNew ? "animate-slide-in ring-1 ring-[rgba(0,240,255,0.25)]" : ""}
        ${expanded ? "bg-[var(--bg-surface)] ring-1 ring-[rgba(0,240,255,0.1)]" : "hover:bg-[var(--bg-surface)]/50"}
      `}
    >
      {/* Compact row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
      >
        {/* Challenger -> Target */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-xs font-semibold" style={{ color: cColor.text }}>
            {interaction.challenger.replace("PoI-", "")}
          </span>
          <svg width="14" height="10" viewBox="0 0 14 10" fill="none" className="text-[var(--text-muted)]">
            <path d="M1 5h12M9 1l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-xs font-semibold" style={{ color: tColor.text }}>
            {interaction.target.replace("PoI-", "")}
          </span>
        </div>

        {/* Question */}
        <span className="flex-1 text-xs text-[var(--text-secondary)] truncate min-w-0">
          {truncate(interaction.question, 50)}
        </span>

        {/* Domain badge */}
        {domainColor && (
          <span
            className="px-1.5 py-0.5 rounded text-[9px] font-semibold flex-shrink-0 uppercase tracking-wider"
            style={{ background: domainColor.bg, color: domainColor.text, border: `1px solid ${domainColor.border}` }}
          >
            {domainColor.label}
          </span>
        )}

        {/* Score */}
        {judgeScore != null && <ScoreRing score={judgeScore} size={28} />}

        {/* Status */}
        <div className="flex-shrink-0">
          {hasSubmit ? (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[rgba(16,185,129,0.12)] text-[#10b981]">
              ON-CHAIN
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[rgba(245,158,11,0.08)] text-[#f59e0b]/80">
              HTTP
            </span>
          )}
        </div>

        {/* Time */}
        <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0 w-12 text-right">
          {formatRelativeTime(interaction.timestamp)}
        </span>

        {/* Expand */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`text-[var(--text-muted)] transition-transform duration-200 flex-shrink-0 ${expanded ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-[rgba(0,240,255,0.05)]">
          {/* Meta: domain + difficulty + full question */}
          <div className="flex flex-wrap items-center gap-2 mt-2 mb-3">
            {domainColor && (
              <span
                className="px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider"
                style={{ background: domainColor.bg, color: domainColor.text, border: `1px solid ${domainColor.border}` }}
              >
                {domainColor.label}
              </span>
            )}
            {diffColor && difficulty && (
              <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: diffColor.text }}>
                {difficulty}
              </span>
            )}
            <span className="text-[11px] text-[var(--text-muted)] flex-1">
              {interaction.question}
            </span>
          </div>

          <div className="space-y-2.5">
            {interaction.steps.map((step, idx) => {
              const isJudge = step.step === "llm_judge_scoring";
              const isHttp = step.step === "a2a_http_challenge";
              const isSubmit = step.step === "on_chain_submit";
              const isChallenge = step.step === "on_chain_challenge";

              return (
                <div key={idx} className="flex items-start gap-2.5">
                  <span
                    className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      step.status === "success" || step.status === "created" || step.status === "scored" || step.status === "recorded"
                        ? "bg-[rgba(16,185,129,0.15)] text-[#10b981]"
                        : step.status === "exists" || step.status === "skipped" || step.status === "skipped_pda_exhausted" || step.status === "pda_exhausted"
                          ? "bg-[rgba(148,163,184,0.1)] text-[#94a3b8]"
                          : step.status === "failed" || step.status === "error"
                            ? "bg-[rgba(239,68,68,0.15)] text-[#ef4444]"
                            : "bg-[rgba(245,158,11,0.1)] text-[#f59e0b]"
                    }`}
                  >
                    {idx + 1}
                  </span>

                  <div className="min-w-0 flex-1">
                    {isHttp && (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-[var(--text-primary)]">A2A HTTP Challenge</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            step.status === "success" ? "bg-[rgba(16,185,129,0.1)] text-[#10b981]" : "bg-[rgba(239,68,68,0.1)] text-[#ef4444]"
                          }`}>
                            {step.status === "success" ? "Response received" : step.status}
                          </span>
                        </div>
                        {step.peer_answer_preview && (
                          <div className="mt-1.5 p-2 rounded bg-[rgba(0,0,0,0.2)] border border-[rgba(0,240,255,0.05)]">
                            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-0.5">Peer&apos;s Answer</p>
                            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                              {step.peer_answer_preview}
                            </p>
                          </div>
                        )}
                      </>
                    )}

                    {isJudge && (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-[var(--text-primary)]">LLM Judge Evaluation</span>
                          {step.method && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[rgba(168,85,247,0.1)] text-[#a855f7] border border-[rgba(168,85,247,0.2)]">
                              {step.method === "llm" ? "Claude AI" : step.method}
                            </span>
                          )}
                        </div>
                        {step.score != null && (
                          <div className="mt-1.5 p-2.5 rounded bg-[rgba(0,0,0,0.2)] border border-[rgba(0,240,255,0.05)]">
                            <div className="flex items-center gap-3">
                              <ScoreRing score={step.score} size={42} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className="text-sm font-bold" style={{ color: getScoreColor(step.score) }}>
                                    {step.score}/100
                                  </span>
                                  <span className="text-[10px] font-medium" style={{ color: getScoreColor(step.score) }}>
                                    {getScoreLabel(step.score)}
                                  </span>
                                </div>
                                {step.explanation && (
                                  <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                                    {step.explanation}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {isChallenge && (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-[var(--text-primary)]">On-Chain Challenge</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            step.status === "created" || step.status === "recorded"
                              ? "bg-[rgba(16,185,129,0.1)] text-[#10b981]"
                              : step.status === "pda_exhausted" || step.status === "skipped_pda_exhausted"
                                ? "bg-[rgba(148,163,184,0.08)] text-[#94a3b8]"
                                : "bg-[rgba(239,68,68,0.1)] text-[#ef4444]"
                          }`}>
                            {step.status === "created" ? "Created" :
                             step.status === "recorded" ? "On-chain proof exists" :
                             step.status === "pda_exhausted" || step.status === "skipped_pda_exhausted" ? "PDA Slot Used" :
                             step.status === "skipped" ? "Skipped" : step.status}
                          </span>
                        </div>
                        {step.status === "recorded" && (
                          <p className="text-[10px] text-[#10b981]/70 mt-0.5">
                            On-chain proof already exists for this agent pair. HTTP + LLM scoring continues.
                          </p>
                        )}
                        {(step.status === "pda_exhausted" || step.status === "skipped_pda_exhausted") && (
                          <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                            One challenge PDA per agent pair (Solana constraint). HTTP + LLM scoring continues.
                          </p>
                        )}
                        {step.tx && (
                          <a href={explorerTxUrl(step.tx)} target="_blank" rel="noopener noreferrer"
                            className="text-[11px] text-[var(--accent-primary)] hover:underline mt-1 inline-flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
                            </svg>
                            TX: {step.tx.substring(0, 20)}...
                          </a>
                        )}
                      </>
                    )}

                    {isSubmit && (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-[var(--text-primary)]">On-Chain Submit</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            step.status === "success" ? "bg-[rgba(16,185,129,0.15)] text-[#10b981]" : "bg-[rgba(239,68,68,0.1)] text-[#ef4444]"
                          }`}>
                            {step.status === "success" ? "Reputation Updated" : step.status}
                          </span>
                        </div>
                        {step.peer_new_reputation != null && (
                          <div className="mt-1 flex items-center gap-2">
                            <span className="text-[10px] text-[var(--text-muted)]">New peer reputation:</span>
                            <span className="text-xs font-bold text-[#10b981]">{(step.peer_new_reputation / 100).toFixed(1)}</span>
                          </div>
                        )}
                        {step.tx && (
                          <a href={explorerTxUrl(step.tx)} target="_blank" rel="noopener noreferrer"
                            className="text-[11px] text-[var(--accent-primary)] hover:underline mt-1 inline-flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
                            </svg>
                            TX: {step.tx.substring(0, 20)}...
                          </a>
                        )}
                      </>
                    )}

                    {!isHttp && !isJudge && !isChallenge && !isSubmit && (
                      <>
                        <p className="text-xs text-[var(--text-primary)]">
                          <span className="font-medium">{step.step.replace(/_/g, " ")}</span>
                          <span className="text-[var(--text-muted)]"> - {step.status}</span>
                        </p>
                        {step.error && step.status !== "exists" && (
                          <p className="text-[11px] text-[#ef4444] mt-0.5 truncate">{truncate(step.error, 80)}</p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            {(interaction.on_chain_tx || interaction.submit_tx) && (
              <div className="pt-2 border-t border-[rgba(0,240,255,0.05)] flex items-center gap-4">
                {interaction.on_chain_tx && (
                  <a href={explorerTxUrl(interaction.on_chain_tx)} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-[var(--accent-primary)] hover:underline flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
                    </svg>
                    Challenge TX
                  </a>
                )}
                {interaction.submit_tx && (
                  <a href={explorerTxUrl(interaction.submit_tx)} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-[#10b981] hover:underline flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
                    </svg>
                    Submit TX
                  </a>
                )}
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
  const [selfStatus, setSelfStatus] = useState<AgentStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [newInteractionIds, setNewInteractionIds] = useState<Set<string>>(new Set());
  const prevInteractionCountRef = useRef(0);

  const fetchData = useCallback(async () => {
    try {
      const [peersRes, interactionsRes, statusRes] = await Promise.all([
        fetch("/api/a2a?endpoint=peers"),
        fetch("/api/a2a?endpoint=interactions"),
        fetch("/api/a2a?endpoint=status"),
      ]);

      if (peersRes.ok) setPeersData(await peersRes.json());
      if (statusRes.ok) setSelfStatus(await statusRes.json());

      if (interactionsRes.ok) {
        const iData: InteractionsResponse = await interactionsRes.json();
        if (iData.recent_interactions.length > prevInteractionCountRef.current) {
          const newIds = new Set<string>();
          iData.recent_interactions
            .slice(0, iData.recent_interactions.length - prevInteractionCountRef.current)
            .forEach((i) => newIds.add(i.timestamp));
          setNewInteractionIds(newIds);
          setTimeout(() => setNewInteractionIds(new Set()), 3000);
        }
        prevInteractionCountRef.current = iData.recent_interactions.length;
        setInteractionsData(iData);
      }

      setError(null);
      setIsDemo(false);
    } catch {
      // Fallback to demo data when agents aren't running
      setPeersData(DEMO_PEERS as PeersResponse);
      setInteractionsData(DEMO_INTERACTIONS as unknown as InteractionsResponse);
      setSelfStatus(DEMO_STATUS as AgentStatusResponse);
      setError(null);
      setIsDemo(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Build nodes
  const selfName = peersData?.agent_name || "Agent";
  const peers = peersData?.peers || [];
  const selfReputation = selfStatus?.reputation_score ?? 5000;

  const allNodes = [
    {
      name: selfName,
      reputation: selfReputation,
      status: "online" as const,
      verified: selfStatus?.verified ?? false,
      isSelf: true,
      personality: getPersonalityFromName(selfName),
      capabilities: "",
      model: "",
    },
    ...peers.map((p) => ({
      name: p.name || "Unknown",
      reputation: p.reputation || 0,
      status: p.status,
      verified: p.verified || false,
      isSelf: false,
      personality: getPersonalityFromName(p.name || "", p.personality),
      capabilities: p.capabilities || "",
      model: p.model || "",
    })),
  ];

  const summary = interactionsData?.summary || {
    total_interactions: 0,
    successful_on_chain: 0,
    http_only: 0,
    unique_peers: 0,
  };

  const recentInteractions = interactionsData?.recent_interactions || [];

  // Global avg judge score
  const judgeScores = recentInteractions
    .map((i) => i.judge_score)
    .filter((s): s is number => s != null);
  const avgJudgeScore = judgeScores.length > 0
    ? Math.round(judgeScores.reduce((a, b) => a + b, 0) / judgeScores.length)
    : null;

  // Per-agent performance from judge scores
  const agentPerformance = useMemo(() => {
    const perf = new Map<string, { avgScore: number | null; asTarget: number; asChallenger: number }>();
    const targetScoreMap = new Map<string, number[]>();
    const challengerCounts = new Map<string, number>();
    const targetCounts = new Map<string, number>();

    recentInteractions.forEach((i) => {
      challengerCounts.set(i.challenger, (challengerCounts.get(i.challenger) || 0) + 1);
      targetCounts.set(i.target, (targetCounts.get(i.target) || 0) + 1);
      if (i.judge_score != null) {
        const scores = targetScoreMap.get(i.target) || [];
        scores.push(i.judge_score);
        targetScoreMap.set(i.target, scores);
      }
    });

    allNodes.forEach((n) => {
      const scores = targetScoreMap.get(n.name);
      const avg = scores && scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : null;
      perf.set(n.name, {
        avgScore: avg,
        asTarget: targetCounts.get(n.name) || 0,
        asChallenger: challengerCounts.get(n.name) || 0,
      });
    });

    return perf;
  }, [recentInteractions, allNodes]);

  return (
    <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[rgba(0,240,255,0.08)] overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between p-5 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--accent-primary)]/20 to-[var(--accent-secondary)]/20 flex items-center justify-center border border-[rgba(0,240,255,0.15)]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-[var(--accent-primary)]">
              <circle cx="5" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="19" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="12" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M7 11L10 7M17 11L14 7M8 12.5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">A2A Intelligence Network</h2>
            <p className="text-[11px] text-[var(--text-muted)]">Real-time agent-to-agent challenge protocol</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isDemo && (
            <span className="px-2.5 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-wider bg-[rgba(245,158,11,0.1)] text-[#f59e0b] border border-[rgba(245,158,11,0.3)]">
              Demo Data
            </span>
          )}
          {avgJudgeScore != null && (
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[rgba(0,240,255,0.08)]">
              <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Avg</span>
              <span className="text-sm font-bold" style={{ color: getScoreColor(avgJudgeScore) }}>
                {avgJudgeScore}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[rgba(16,185,129,0.06)] border border-[rgba(16,185,129,0.2)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] status-live" />
            <span className="text-xs text-[#10b981] font-medium">
              {peersData?.online_peers ?? 0} peers
            </span>
          </div>
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
        {loading ? (
          <div className="text-center py-12">
            <div className="relative w-10 h-10 mx-auto mb-3">
              <div className="absolute inset-0 rounded-full border-2 border-[var(--bg-surface)]" />
              <div className="absolute inset-0 rounded-full border-2 border-t-[var(--accent-primary)] animate-spin" />
            </div>
            <p className="text-sm text-[var(--text-muted)]">Connecting to A2A network...</p>
          </div>
        ) : error ? (
          <div className="p-5">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-[rgba(245,158,11,0.06)] border border-[rgba(245,158,11,0.2)]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-[#f59e0b] flex-shrink-0">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
                <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <div>
                <p className="text-sm text-[#f59e0b]">Agent API unavailable</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">Ensure Python agents are running at {baseUrl}</p>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Agent Cards */}
            <div className="px-5 pb-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {allNodes.map((node) => {
                  const perf = agentPerformance.get(node.name);
                  const pColor = PERSONALITY_COLORS[node.personality] || PERSONALITY_COLORS.analytical;
                  const isOnline = node.status === "online";
                  const displayScore = perf?.avgScore ?? (node.isSelf ? avgJudgeScore : null);
                  const interactionCount = (perf?.asChallenger || 0) + (perf?.asTarget || 0);

                  return (
                    <div key={node.name} className="relative group">
                      {/* Left accent */}
                      <div
                        className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full transition-all duration-300 group-hover:top-1 group-hover:bottom-1"
                        style={{
                          background: `linear-gradient(180deg, ${pColor.text}, ${pColor.text}15)`,
                          boxShadow: `0 0 8px ${pColor.text}30`,
                        }}
                      />

                      <div className="ml-3 p-4 rounded-xl bg-[var(--bg-surface)] border border-[rgba(0,240,255,0.05)] hover:border-[rgba(0,240,255,0.12)] transition-all duration-300 group-hover:shadow-[0_0_30px_rgba(0,240,255,0.04)]">
                        {/* Top: Name + Status */}
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2.5">
                            {/* Avatar */}
                            <div
                              className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold"
                              style={{
                                background: pColor.bg,
                                border: `1px solid ${pColor.border}`,
                                color: pColor.text,
                              }}
                            >
                              {getAgentInitials(node.name)}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-sm text-[var(--text-primary)]">
                                  {node.name}
                                </span>
                                {node.isSelf && (
                                  <span className="text-[8px] px-1 py-0.5 rounded bg-[rgba(0,240,255,0.08)] text-[var(--accent-primary)] font-semibold uppercase tracking-wider">
                                    self
                                  </span>
                                )}
                              </div>
                              <span
                                className="text-[10px] font-bold uppercase tracking-widest"
                                style={{ color: pColor.text }}
                              >
                                {pColor.label || node.personality}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`w-2 h-2 rounded-full ${isOnline ? "status-live" : ""}`}
                              style={{ backgroundColor: isOnline ? "#10b981" : "#64748b" }}
                            />
                            <span className="text-[10px] text-[var(--text-muted)]">
                              {isOnline ? "Live" : "Off"}
                            </span>
                          </div>
                        </div>

                        {/* Capabilities */}
                        {node.capabilities && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {node.capabilities.split(",").filter(c => c && c !== "cross-agent-discovery").slice(0, 3).map((cap) => (
                              <span
                                key={cap}
                                className="px-1.5 py-0.5 rounded text-[8px] font-medium uppercase tracking-wider"
                                style={{ background: "rgba(100,116,139,0.08)", color: "var(--text-muted)", border: "1px solid rgba(100,116,139,0.12)" }}
                              >
                                {cap.trim().replace(/-/g, " ")}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Score */}
                        <div className="flex flex-col items-center py-3">
                          {displayScore != null ? (
                            <ScoreRing score={displayScore} size={60} />
                          ) : (
                            <div className="w-[60px] h-[60px] rounded-full bg-[var(--bg-elevated)] flex items-center justify-center border border-[rgba(0,240,255,0.05)]">
                              <span className="text-lg text-[var(--text-muted)] font-light">-</span>
                            </div>
                          )}
                          <span className="text-[10px] text-[var(--text-muted)] mt-2 uppercase tracking-wider">
                            {displayScore != null
                              ? node.isSelf && !perf?.avgScore
                                ? "Network Avg"
                                : "A2A Score"
                              : "Awaiting"}
                          </span>
                        </div>

                        {/* Bottom stats */}
                        <div className="flex items-center justify-between pt-3 border-t border-[rgba(0,240,255,0.04)]">
                          <span className="text-[11px] text-[var(--text-muted)]">
                            {interactionCount > 0
                              ? `${interactionCount} challenge${interactionCount !== 1 ? "s" : ""}`
                              : "No activity"}
                          </span>
                          {node.verified && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[rgba(16,185,129,0.08)] text-[#10b981] border border-[rgba(16,185,129,0.15)] font-medium">
                              Verified
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Connection flow */}
            <div className="mx-5 mb-4">
              <div className="h-[2px] rounded-full bg-gradient-to-r from-[#ef4444]/10 via-[#3b82f6]/15 to-[#10b981]/10 relative overflow-hidden">
                <div
                  className="absolute top-0 bottom-0 w-1/4 bg-gradient-to-r from-transparent via-[rgba(0,240,255,0.35)] to-transparent rounded-full"
                  style={{ animation: "flowRight 3s linear infinite" }}
                />
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-5 pb-5">
              {[
                { label: "Total Challenges", value: summary.total_interactions, color: "var(--accent-primary)" },
                { label: "Avg A2A Score", value: avgJudgeScore != null ? `${avgJudgeScore}/100` : "-", color: avgJudgeScore ? getScoreColor(avgJudgeScore) : "#64748b" },
                { label: "Online Peers", value: summary.unique_peers, color: "#a855f7" },
                { label: "On-Chain", value: summary.successful_on_chain, color: "#10b981" },
              ].map((stat, i) => (
                <div
                  key={i}
                  className="px-4 py-3 rounded-xl bg-[var(--bg-surface)] border border-[rgba(0,240,255,0.04)]"
                >
                  <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">{stat.label}</p>
                  <p className="text-xl font-bold" style={{ color: stat.color }}>
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Interaction Feed */}
            <div className="px-5 pb-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                  Recent Challenges
                  {recentInteractions.length > 0 && (
                    <span className="px-1.5 py-0.5 text-[10px] rounded-md bg-[var(--bg-surface)] text-[var(--text-muted)] font-normal">
                      {recentInteractions.length}
                    </span>
                  )}
                </h3>
              </div>

              <div className="space-y-1 max-h-[500px] overflow-y-auto custom-scrollbar pr-1">
                {recentInteractions.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-[var(--text-muted)]">Waiting for A2A interactions...</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Agents challenge each other every ~2 minutes</p>
                  </div>
                ) : (
                  [...recentInteractions].reverse().map((interaction, idx) => (
                    <InteractionRow
                      key={interaction.timestamp + idx}
                      interaction={interaction}
                      isNew={newInteractionIds.has(interaction.timestamp)}
                    />
                  ))
                )}
              </div>
            </div>

            {/* Protocol info */}
            <div className="mx-5 mb-5 p-3.5 rounded-xl bg-[rgba(0,240,255,0.02)] border border-[rgba(0,240,255,0.06)]">
              <div className="flex items-start gap-3">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[var(--text-muted)] flex-shrink-0 mt-0.5">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                  <strong className="text-[var(--text-secondary)]">Challenge Flow:</strong>{" "}
                  Select domain-specific question &rarr; HTTP challenge &rarr; LLM Judge scores (0-100) &rarr; On-chain record (nonce-based PDA) &rarr; Reputation update.
                  Each agent specializes in a domain (DeFi, Security, Solana) and challenges peers on their weaknesses.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
