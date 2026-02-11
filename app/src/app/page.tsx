"use client";

import { useEffect, useState, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  AgentData,
  RegistryData,
  isAnchorWallet,
  fetchRegistryState,
  fetchAllAgents,
} from "@/lib/program";
import { RegisterForm } from "@/components/RegisterForm";
import { SecurityDashboard } from "@/components/SecurityDashboard";
import { A2ANetworkView } from "@/components/A2ANetworkView";
import { CertificationView } from "@/components/CertificationView";
import { AuditTrailView } from "@/components/AuditTrailView";

export default function Home() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRegister, setShowRegister] = useState(false);
  const [registryInfo, setRegistryInfo] = useState<RegistryData | null>(null);
  const [a2aInteractionCount, setA2aInteractionCount] = useState<number>(0);

  // Fetch A2A interaction count (independent of wallet)
  useEffect(() => {
    const fetchA2aCount = async () => {
      try {
        const res = await fetch("/api/a2a?endpoint=interactions");
        if (res.ok) {
          const data = await res.json();
          setA2aInteractionCount(data.summary?.total_interactions ?? 0);
        }
      } catch {
        // Agent may not be running - silently ignore
      }
    };
    fetchA2aCount();
    const interval = setInterval(fetchA2aCount, 15000);
    return () => clearInterval(interval);
  }, []);

  // Debug wallet state
  useEffect(() => {
    console.log("Home: Wallet state changed", {
      connected: wallet.connected,
      connecting: wallet.connecting,
      publicKey: wallet.publicKey?.toBase58() || null,
      walletName: wallet.wallet?.adapter?.name || null,
    });
  }, [wallet.connected, wallet.connecting, wallet.publicKey, wallet.wallet]);

  const loadAgents = useCallback(async () => {
    if (!isAnchorWallet(wallet)) {
      setLoading(false);
      return;
    }

    try {
      // Fetch registry state and all agents in parallel
      const [registry, allAgents] = await Promise.all([
        fetchRegistryState(connection),
        fetchAllAgents(connection),
      ]);

      if (!registry) {
        console.log("Registry not initialized yet");
        setLoading(false);
        return;
      }
      setRegistryInfo(registry);

      // Sort agents by reputation score (highest first)
      allAgents.sort((a, b) => b.reputationScore - a.reputationScore);
      setAgents(allAgents);
    } catch (err: unknown) {
      console.error("Error loading agents:", err instanceof Error ? err.message : err);
    } finally {
      setLoading(false);
    }
  }, [connection, wallet]);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-[rgba(0,240,255,0.1)] bg-[var(--bg-primary)]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Logo */}
            <div className="relative w-12 h-12 rounded-xl overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)]" />
              <div className="absolute inset-[2px] bg-[var(--bg-primary)] rounded-[10px] flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-[var(--accent-primary)]">
                  <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                <span className="text-[var(--accent-primary)]">Agent</span>{" "}
                <span className="text-[var(--text-primary)]">PoI</span>
              </h1>
              <p className="text-xs text-[var(--text-muted)]">Proof-of-Intelligence Protocol</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[rgba(0,240,255,0.1)]">
              <span className="w-2 h-2 rounded-full bg-[var(--accent-primary)] status-live" />
              <span className="text-sm text-[var(--text-secondary)]">Devnet</span>
            </div>
            {/* suppressHydrationWarning: wallet state differs between server/client */}
            <div suppressHydrationWarning>
              <WalletMultiButton />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Hero Section */}
        <div className="relative rounded-2xl overflow-hidden mb-10">
          {/* Background pattern */}
          <div className="absolute inset-0 bg-gradient-to-br from-[rgba(0,240,255,0.05)] via-transparent to-[rgba(168,85,247,0.05)]" />
          <div className="absolute inset-0 opacity-30"
            style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, rgba(0,240,255,0.15) 1px, transparent 0)`,
              backgroundSize: "24px 24px"
            }}
          />

          <div className="relative p-8 md:p-12 border border-[rgba(0,240,255,0.1)] rounded-2xl">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
              <div className="max-w-2xl">
                <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-[var(--text-primary)] mb-4">
                  Verify AI Agent{" "}
                  <span className="bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] bg-clip-text text-transparent">
                    Intelligence
                  </span>
                </h1>
                <p className="text-lg text-[var(--text-secondary)] leading-relaxed mb-6">
                  On-chain cryptographic verification that AI agents are who they claim to be.
                  Model hash validation, challenge-response protocols, and reputation scoring
                  built on Solana.
                </p>
                <div className="flex flex-wrap gap-3">
                  <span className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[rgba(16,185,129,0.1)] border border-[rgba(16,185,129,0.3)] text-[#10b981]">
                    <span className="w-2 h-2 rounded-full bg-current status-live" />
                    A2A Protocol Ready
                  </span>
                  <span className="px-4 py-2 rounded-lg bg-[rgba(59,130,246,0.1)] border border-[rgba(59,130,246,0.3)] text-[#3b82f6]">
                    On-Chain Audit Trail
                  </span>
                  <span className="px-4 py-2 rounded-lg bg-[rgba(168,85,247,0.1)] border border-[rgba(168,85,247,0.3)] text-[#a855f7]">
                    NFT Identity
                  </span>
                </div>
              </div>

              {/* Hero visual */}
              <div className="relative hidden lg:block">
                <div className="w-48 h-48 relative">
                  {/* Animated rings */}
                  <div className="absolute inset-0 rounded-full border-2 border-[rgba(0,240,255,0.2)] animate-ping" style={{ animationDuration: "3s" }} />
                  <div className="absolute inset-4 rounded-full border-2 border-[rgba(168,85,247,0.2)] animate-ping" style={{ animationDuration: "3s", animationDelay: "0.5s" }} />
                  <div className="absolute inset-8 rounded-full border-2 border-[rgba(0,240,255,0.3)] animate-ping" style={{ animationDuration: "3s", animationDelay: "1s" }} />
                  {/* Center */}
                  <div className="absolute inset-12 rounded-full bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] flex items-center justify-center">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" className="text-[var(--bg-deep)]">
                      <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="currentColor"/>
                      <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2"/>
                      <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2"/>
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Dashboard */}
        {registryInfo && (
          <div className="mb-10">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
              {/* Agents */}
              <div className="stat-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[var(--accent-primary)]">
                    <rect x="3" y="4" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="2"/>
                    <circle cx="9" cy="10" r="2" fill="currentColor"/>
                    <circle cx="15" cy="10" r="2" fill="currentColor"/>
                    <path d="M8 20h8M12 16v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Agents</span>
                </div>
                <div className="text-2xl font-bold text-[var(--accent-primary)]">
                  {registryInfo.totalAgents.toString()}
                </div>
              </div>

              {/* Verified */}
              <div className="stat-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#10b981]">
                    <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" stroke="currentColor" strokeWidth="2"/>
                    <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Verified</span>
                </div>
                <div className="text-2xl font-bold text-[#10b981]">
                  {agents.filter(a => a.verified).length}
                </div>
              </div>

              {/* Challenges */}
              <div className="stat-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#3b82f6]">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Challenges</span>
                </div>
                <div className="text-2xl font-bold text-[#3b82f6]">
                  {agents.reduce((sum, a) => sum + a.challengesPassed + a.challengesFailed, 0)}
                </div>
              </div>

              {/* On-Chain Challenges */}
              <div className="stat-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#f59e0b]">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Certified</span>
                </div>
                <div className="text-2xl font-bold text-[#f59e0b]">
                  3
                </div>
              </div>

              {/* A2A Interactions */}
              <div className="stat-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#ec4899]">
                    <circle cx="5" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
                    <circle cx="19" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
                    <circle cx="12" cy="5" r="3" stroke="currentColor" strokeWidth="2"/>
                    <path d="M7.5 10.5L10.5 6.5M16.5 10.5L13.5 6.5M7 13L17 13" stroke="currentColor" strokeWidth="1.5"/>
                  </svg>
                  <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">A2A</span>
                </div>
                <div className="text-2xl font-bold text-[#ec4899]">
                  {a2aInteractionCount}
                </div>
              </div>

              {/* Network */}
              <div className="stat-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#22d3ee]">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                    <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                  <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Network</span>
                </div>
                <div className="text-2xl font-bold text-[#22d3ee]">
                  Devnet
                </div>
              </div>
            </div>

            {/* Program info bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-[var(--bg-elevated)] border border-[rgba(0,240,255,0.1)]">
              <div className="flex items-center gap-3">
                <span className="text-[var(--text-muted)] text-sm">Program:</span>
                <code className="px-3 py-1 rounded bg-[var(--bg-surface)] text-[var(--accent-primary)] font-mono text-sm">
                  EQ2Zv3c...BACL38
                </code>
                <a
                  href="https://explorer.solana.com/address/EQ2Zv3cTDBzY1PafPz2WDoup6niUv6X8t9id4PBACL38?cluster=devnet"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[var(--accent-primary)] hover:underline"
                >
                  Explorer →
                </a>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <a href="/skill.json" className="text-[var(--text-secondary)] hover:text-[var(--accent-primary)] transition-colors">
                  skill.json
                </a>
                <a href="/skill.md" className="text-[var(--text-secondary)] hover:text-[var(--accent-primary)] transition-colors">
                  skill.md
                </a>
                <a
                  href="https://github.com/vitamin33/agent-poi"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--text-secondary)] hover:text-[var(--accent-primary)] transition-colors"
                >
                  GitHub
                </a>
              </div>
            </div>
          </div>
        )}

        {/* A2A Network View - shown regardless of wallet connection */}
        <div className="mb-10">
          <A2ANetworkView />
        </div>

        {/* Intelligence Certification Leaderboard */}
        <div className="mb-10">
          <CertificationView />
        </div>

        {/* Verifiable Audit Trail */}
        <div className="mb-10">
          <AuditTrailView />
        </div>

        {/* Register Agent */}
        {wallet.publicKey && (
          <div>
            <button
              onClick={() => setShowRegister(!showRegister)}
              className={`btn-secondary px-5 py-2.5 rounded-lg text-sm font-medium ${showRegister ? "opacity-70" : ""}`}
            >
              {showRegister ? "Close Form" : "+ Register New Agent"}
            </button>
            {showRegister && (
              <div className="mt-4 p-6 rounded-xl bg-[var(--bg-elevated)] border border-[rgba(0,240,255,0.1)]">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[var(--accent-primary)]" />
                  Register New Agent
                </h3>
                <RegisterForm
                  onSuccess={() => {
                    setShowRegister(false);
                    loadAgents();
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* Security Dashboard */}
        {wallet.publicKey && agents.length > 0 && (
          <div className="mt-12">
            <SecurityDashboard agents={agents} />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[rgba(0,240,255,0.1)] mt-20 py-8">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-[var(--text-muted)] text-sm">
            Built for{" "}
            <a
              href="https://www.colosseum.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent-primary)] hover:underline"
            >
              Colosseum Agent Hackathon
            </a>
          </p>
          <p className="text-[var(--text-muted)] text-xs mt-2">
            Agent Proof-of-Intelligence Protocol • built by AI Jesus
          </p>
        </div>
      </footer>
    </div>
  );
}
