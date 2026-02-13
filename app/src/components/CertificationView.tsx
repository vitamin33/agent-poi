"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { DEMO_CERTIFICATIONS } from "@/lib/demoData";

interface DomainScore {
  weighted_score: number;
  certification_level: string;
  questions_correct: number;
  questions_total: number;
  difficulty_breakdown: {
    easy: number;
    medium: number;
    hard: number;
  };
  time_taken_ms: number;
  result_hash: string;
}

interface CertificationRecord {
  timestamp: string;
  agent: string;
  model?: string;
  model_hash: string;
  overall_score: number;
  overall_level: string;
  domain_scores: Record<string, DomainScore>;
  cert_hash: string;
  on_chain_tx: string | null;
}

interface AgentCertification {
  agent_name: string;
  model?: string;
  model_hash: string;
  total_certifications: number;
  latest_certification: CertificationRecord | null;
  certification_history: CertificationRecord[];
}

const LEVEL_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  Expert: { bg: "rgba(234,179,8,0.1)", border: "rgba(234,179,8,0.4)", text: "#eab308" },
  Proficient: { bg: "rgba(59,130,246,0.1)", border: "rgba(59,130,246,0.4)", text: "#3b82f6" },
  Basic: { bg: "rgba(168,85,247,0.1)", border: "rgba(168,85,247,0.4)", text: "#a855f7" },
  Uncertified: { bg: "rgba(107,114,128,0.1)", border: "rgba(107,114,128,0.4)", text: "#6b7280" },
};

const DOMAIN_COLORS: Record<string, string> = {
  defi: "#10b981",
  solana: "#a855f7",
  security: "#f59e0b",
};

function ScoreBar({ score, color, label }: { score: number; color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[var(--text-muted)] w-14 text-right">{label}</span>
      <div className="flex-1 h-2.5 rounded-full bg-[var(--bg-surface)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${Math.min(score, 100)}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-mono w-10 text-right" style={{ color }}>
        {score.toFixed(0)}%
      </span>
    </div>
  );
}

function CertBadge({ level }: { level: string }) {
  const colors = LEVEL_COLORS[level] || LEVEL_COLORS.Uncertified;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold"
      style={{ background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text }}
    >
      {level === "Expert" && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      )}
      {level === "Proficient" && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
          <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {level}
    </span>
  );
}

function ScoreGauge({ score, size = 64 }: { score: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const color = score >= 85 ? "#eab308" : score >= 70 ? "#3b82f6" : score >= 50 ? "#a855f7" : "#6b7280";

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--bg-surface)"
          strokeWidth="4"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-bold" style={{ color }}>
          {score.toFixed(0)}
        </span>
      </div>
    </div>
  );
}

export function CertificationView() {
  const [certifications, setCertifications] = useState<AgentCertification[]>([]);
  const [loading, setLoading] = useState(true);
  const [certifying, setCertifying] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [certResult, setCertResult] = useState<"success" | "error" | "timeout" | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const COOLDOWN_SEC = 300; // 5-minute cooldown between certifications
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchCertifications = useCallback(async () => {
    try {
      // Fetch certifications for all agents via aggregation endpoint
      const res = await fetch("/api/certifications");
      if (res.ok) {
        const data = await res.json();
        // Response is an array of AgentCertification objects
        if (Array.isArray(data)) {
          setCertifications(data);
        } else {
          // Single agent mode - wrap in array
          setCertifications([data]);
        }
        setIsDemo(false);
      } else {
        throw new Error("API error");
      }
    } catch {
      // Fallback to demo data when agents aren't running
      setCertifications(DEMO_CERTIFICATIONS as unknown as AgentCertification[]);
      setIsDemo(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCertifications();
    const interval = setInterval(fetchCertifications, 30000);
    return () => clearInterval(interval);
  }, [fetchCertifications]);

  const handleRunCertification = async () => {
    setCertifying(true);
    setCertResult(null);
    setElapsedSec(0);

    // Start elapsed timer
    elapsedRef.current = setInterval(() => {
      setElapsedSec((s) => s + 1);
    }, 1000);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 150_000); // 150s timeout

    try {
      const res = await fetch("/api/certifications", {
        method: "POST",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        setCertResult("success");
        await fetchCertifications();
        setTimeout(() => setCertResult(null), 5000);
      } else {
        setCertResult("error");
      }
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof DOMException && err.name === "AbortError") {
        setCertResult("timeout");
      } else {
        setCertResult("error");
      }
    } finally {
      setCertifying(false);
      if (elapsedRef.current) {
        clearInterval(elapsedRef.current);
        elapsedRef.current = null;
      }
      // Start cooldown
      setCooldownRemaining(COOLDOWN_SEC);
      cooldownRef.current = setInterval(() => {
        setCooldownRemaining((prev) => {
          if (prev <= 1) {
            if (cooldownRef.current) clearInterval(cooldownRef.current);
            cooldownRef.current = null;
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
  };

  // Collect all agents with certifications for leaderboard
  const leaderboard = certifications
    .filter((c) => c.latest_certification)
    .map((c) => ({
      name: c.agent_name,
      model: c.model || c.latest_certification!.model || "unknown",
      level: c.latest_certification!.overall_level,
      score: c.latest_certification!.overall_score,
      domains: c.latest_certification!.domain_scores,
      certHash: c.latest_certification!.cert_hash,
      onChainTx: c.latest_certification!.on_chain_tx,
      timestamp: c.latest_certification!.timestamp,
      totalCerts: c.total_certifications,
    }))
    .sort((a, b) => b.score - a.score);

  const hasCertifications = leaderboard.length > 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-[#eab308]">
              <path d="M12 15l-3.5 2 .67-3.89L6 10.11l3.91-.57L12 6l2.09 3.54 3.91.57-2.83 2.76.67 3.89z" fill="currentColor" />
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Intelligence Certification
            {isDemo && (
              <span className="px-2.5 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-wider bg-[rgba(245,158,11,0.1)] text-[#f59e0b] border border-[rgba(245,158,11,0.3)]">
                Demo Data
              </span>
            )}
          </h2>
          <p className="text-sm text-[var(--text-muted)]">
            On-chain verified AI capability assessment
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <button
            onClick={handleRunCertification}
            disabled={certifying || cooldownRemaining > 0}
            className="btn-primary px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
          >
            {certifying ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full border-2 border-t-transparent border-current animate-spin" />
                Certifying... {elapsedSec}s
              </span>
            ) : cooldownRemaining > 0 ? (
              <span className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-60">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                {Math.floor(cooldownRemaining / 60)}:{(cooldownRemaining % 60).toString().padStart(2, "0")}
              </span>
            ) : (
              "Run Certification"
            )}
          </button>
          {certResult === "success" && (
            <span className="text-xs text-[#10b981] font-medium">Certification complete</span>
          )}
          {certResult === "error" && (
            <span className="text-xs text-[#ef4444] font-medium">Failed - agents may be offline</span>
          )}
          {certResult === "timeout" && (
            <span className="text-xs text-[#f59e0b] font-medium">Request timed out - check agent status</span>
          )}
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="text-center py-12">
          <div className="relative w-12 h-12 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full border-4 border-[var(--bg-surface)]" />
            <div className="absolute inset-0 rounded-full border-4 border-t-[var(--accent-primary)] animate-spin" />
          </div>
          <p className="text-[var(--text-muted)] text-sm">Loading certifications...</p>
        </div>
      )}

      {/* No certifications yet */}
      {!loading && !hasCertifications && (
        <div className="text-center py-12 rounded-xl bg-[var(--bg-elevated)] border border-[rgba(0,240,255,0.1)]">
          <div className="text-4xl mb-4">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" className="mx-auto text-[var(--text-muted)]">
              <path d="M12 15l-3.5 2 .67-3.89L6 10.11l3.91-.57L12 6l2.09 3.54 3.91.57-2.83 2.76.67 3.89z" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold mb-2">No Certifications Yet</h3>
          <p className="text-[var(--text-muted)] text-sm mb-4 max-w-md mx-auto">
            Run an intelligence certification to assess agent capabilities across DeFi, Solana, and Security domains.
          </p>
          <button
            onClick={handleRunCertification}
            disabled={certifying || cooldownRemaining > 0}
            className="btn-primary px-6 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
          >
            {certifying ? "Certifying..." : cooldownRemaining > 0 ? `Cooldown ${Math.floor(cooldownRemaining / 60)}:${(cooldownRemaining % 60).toString().padStart(2, "0")}` : "Run First Certification"}
          </button>
        </div>
      )}

      {/* Certification Leaderboard */}
      {!loading && hasCertifications && (
        <div className="rounded-xl bg-[var(--bg-elevated)] border border-[rgba(0,240,255,0.1)] overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_minmax(180px,1.2fr)_80px_80px_80px_80px_100px] gap-2 px-4 py-3 border-b border-[rgba(0,240,255,0.05)] text-xs text-[var(--text-muted)] uppercase tracking-wider">
            <span>Agent</span>
            <span>Model</span>
            <span className="text-center">DeFi</span>
            <span className="text-center">Solana</span>
            <span className="text-center">Security</span>
            <span className="text-center">Cert Score</span>
            <span className="text-center">Level</span>
          </div>

          {/* Agent rows */}
          {leaderboard.map((agent, idx) => (
            <div
              key={agent.name}
              className="grid grid-cols-[1fr_minmax(180px,1.2fr)_80px_80px_80px_80px_100px] gap-2 px-4 py-4 items-center border-b border-[rgba(0,240,255,0.03)] hover:bg-[rgba(0,240,255,0.02)] transition-colors"
            >
              {/* Agent name + rank */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-[var(--text-muted)] w-5">
                  #{idx + 1}
                </span>
                <div>
                  <div className="font-semibold text-sm">{agent.name}</div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {agent.totalCerts} cert{agent.totalCerts !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>

              {/* Model */}
              <div className="text-xs text-[var(--text-secondary)] font-mono truncate">
                {agent.model}
              </div>

              {/* Domain scores */}
              {["defi", "solana", "security"].map((domain) => {
                const ds = agent.domains[domain];
                const score = ds?.weighted_score ?? 0;
                const color = DOMAIN_COLORS[domain];
                return (
                  <div key={domain} className="text-center">
                    <div className="text-sm font-bold" style={{ color }}>
                      {score.toFixed(0)}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)]">
                      {ds?.questions_correct ?? 0}/{ds?.questions_total ?? 0}
                    </div>
                  </div>
                );
              })}

              {/* Overall score gauge */}
              <div className="flex justify-center">
                <ScoreGauge score={agent.score} size={48} />
              </div>

              {/* Certification level */}
              <div className="flex justify-center">
                <CertBadge level={agent.level} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detailed breakdown for each certified agent */}
      {!loading && hasCertifications && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {leaderboard.map((agent) => (
            <div
              key={agent.name}
              className="rounded-xl p-4 bg-[var(--bg-elevated)] border border-[rgba(0,240,255,0.1)]"
            >
              {/* Agent header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="font-semibold">{agent.name}</div>
                  <div className="text-xs text-[var(--text-muted)] font-mono">
                    {agent.model}
                  </div>
                </div>
                <ScoreGauge score={agent.score} size={56} />
              </div>

              {/* Domain score bars */}
              <div className="space-y-2 mb-4">
                {["defi", "solana", "security"].map((domain) => {
                  const ds = agent.domains[domain];
                  return (
                    <ScoreBar
                      key={domain}
                      score={ds?.weighted_score ?? 0}
                      color={DOMAIN_COLORS[domain]}
                      label={domain.charAt(0).toUpperCase() + domain.slice(1)}
                    />
                  );
                })}
              </div>

              {/* Difficulty breakdown */}
              {agent.domains.defi && (
                <div className="mb-3 pt-3 border-t border-[rgba(0,240,255,0.05)]">
                  <div className="text-xs text-[var(--text-muted)] mb-2">Difficulty Breakdown (avg)</div>
                  <div className="flex gap-3">
                    {["easy", "medium", "hard"].map((tier) => {
                      const scores = Object.values(agent.domains)
                        .map((d) => d.difficulty_breakdown?.[tier as keyof typeof d.difficulty_breakdown] ?? 0);
                      const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
                      const tierColor = tier === "easy" ? "#10b981" : tier === "medium" ? "#3b82f6" : "#f59e0b";
                      return (
                        <div key={tier} className="flex-1 text-center">
                          <div className="text-xs font-bold" style={{ color: tierColor }}>
                            {avg.toFixed(0)}%
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)] capitalize">{tier}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Cert hash + on-chain */}
              <div className="pt-3 border-t border-[rgba(0,240,255,0.05)]">
                <div className="flex items-center justify-between">
                  <CertBadge level={agent.level} />
                  <div className="text-right">
                    {agent.onChainTx ? (
                      <a
                        href={`https://explorer.solana.com/tx/${agent.onChainTx}?cluster=devnet`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[var(--accent-primary)] hover:underline"
                      >
                        On-chain proof
                      </a>
                    ) : (
                      <span className="text-xs text-[var(--text-muted)]">Off-chain</span>
                    )}
                  </div>
                </div>
                <div className="mt-1 text-[10px] text-[var(--text-muted)] font-mono truncate">
                  Hash: {agent.certHash.slice(0, 24)}...
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
