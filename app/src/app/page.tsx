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
import { AgentCard } from "@/components/AgentCard";
import { RegisterForm } from "@/components/RegisterForm";
import { SecurityDashboard } from "@/components/SecurityDashboard";
import { LiveEventsFeed } from "@/components/LiveEventsFeed";
import { useSolanaEvents, SolanaEventType } from "@/hooks/useSolanaEvents";

export default function Home() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRegister, setShowRegister] = useState(false);
  const [registryInfo, setRegistryInfo] = useState<RegistryData | null>(null);

  // WebSocket live events subscription
  const {
    events,
    isConnected: wsConnected,
    lastEventTime,
    clearEvents,
    simulateEvent,
  } = useSolanaEvents(connection, { enabled: !!wallet.publicKey });

  // Demo event simulation for hackathon judges
  const handleSimulateEvent = useCallback(() => {
    const demoEvents: Array<{ type: SolanaEventType; data: Record<string, unknown> }> = [
      {
        type: "agent_registered",
        data: { agentName: "DemoAgent-" + Math.floor(Math.random() * 1000), agentId: Math.floor(Math.random() * 100), newReputation: 5000 },
      },
      {
        type: "challenge_responded",
        data: { agentName: "SolanaBot", oldReputation: 5000, newReputation: 5100, status: "passed" },
      },
      {
        type: "reputation_changed",
        data: { agentName: "TradingAgent", oldReputation: 4800, newReputation: 4900 },
      },
      {
        type: "challenge_created",
        data: { agentName: "SecurityGuard", challengeQuestion: "What is your model hash?" },
      },
    ];
    const randomEvent = demoEvents[Math.floor(Math.random() * demoEvents.length)];
    simulateEvent(randomEvent.type, randomEvent.data);
  }, [simulateEvent]);

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
            <WalletMultiButton />
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
                    EU AI Act Compliant
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

              {/* Pass Rate */}
              <div className="stat-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#f59e0b]">
                    <path d="M18 20V10M12 20V4M6 20v-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Pass Rate</span>
                </div>
                <div className="text-2xl font-bold text-[#f59e0b]">
                  {agents.length > 0
                    ? Math.round(
                        (agents.reduce((sum, a) => sum + a.challengesPassed, 0) /
                        Math.max(1, agents.reduce((sum, a) => sum + a.challengesPassed + a.challengesFailed, 0))) * 100
                      ) + "%"
                    : "0%"}
                </div>
              </div>

              {/* Avg Score */}
              <div className="stat-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#a855f7]">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Avg Score</span>
                </div>
                <div className="text-2xl font-bold text-[#a855f7]">
                  {agents.length > 0
                    ? (agents.reduce((sum, a) => sum + a.reputationScore, 0) / agents.length / 100).toFixed(1)
                    : "0"}
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
                  href="https://github.com/vitaliiserbynassisterr/assisterr-agent-hackathon"
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

        {/* Live Events Feed */}
        {wallet.publicKey && (
          <div className="mb-10">
            <LiveEventsFeed
              events={events}
              isConnected={wsConnected}
              lastEventTime={lastEventTime}
              onClear={clearEvents}
              onSimulate={handleSimulateEvent}
            />
          </div>
        )}

        {/* Agent Leaderboard Section */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Agent Leaderboard</h2>
            <p className="text-sm text-[var(--text-muted)]">Ranked by reputation score</p>
          </div>
          {wallet.publicKey && (
            <button
              onClick={() => setShowRegister(!showRegister)}
              className={`btn-primary px-6 py-3 rounded-xl text-sm font-semibold ${showRegister ? "opacity-70" : ""}`}
            >
              {showRegister ? "Close Form" : "+ Register Agent"}
            </button>
          )}
        </div>

        {/* Register Form */}
        {showRegister && wallet.publicKey && (
          <div className="mb-8 p-6 rounded-xl bg-[var(--bg-elevated)] border border-[rgba(0,240,255,0.1)]">
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

        {/* Agent Grid */}
        {!wallet.publicKey ? (
          <div className="text-center py-20">
            <div className="relative w-24 h-24 mx-auto mb-6">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] opacity-20 animate-pulse" />
              <div className="absolute inset-4 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-[var(--accent-primary)]">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" stroke="currentColor" strokeWidth="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="2"/>
                </svg>
              </div>
            </div>
            <h3 className="text-xl font-semibold mb-2">Connect Your Wallet</h3>
            <p className="text-[var(--text-muted)] mb-6 max-w-md mx-auto">
              Connect your Solana wallet to view registered agents and create new entries
            </p>
            <WalletMultiButton />
          </div>
        ) : loading ? (
          <div className="text-center py-20">
            <div className="relative w-16 h-16 mx-auto mb-6">
              <div className="absolute inset-0 rounded-full border-4 border-[var(--bg-surface)]" />
              <div className="absolute inset-0 rounded-full border-4 border-t-[var(--accent-primary)] animate-spin" />
            </div>
            <p className="text-[var(--text-muted)]">Loading agents from Solana...</p>
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-20">
            <div className="relative w-24 h-24 mx-auto mb-6">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] opacity-20" />
              <div className="absolute inset-4 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center text-4xl">
                🤖
              </div>
            </div>
            <h3 className="text-xl font-semibold mb-2">No Agents Registered</h3>
            <p className="text-[var(--text-muted)] mb-6 max-w-md mx-auto">
              Be the first to register an AI agent on-chain and establish its verified identity
            </p>
            <button
              onClick={() => setShowRegister(true)}
              className="btn-primary px-8 py-3 rounded-xl text-sm font-semibold"
            >
              Register First Agent
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {agents.map((agent, idx) => (
              <AgentCard
                key={agent.agentId.toString()}
                agent={agent}
                rank={idx + 1}
                onChallengeCreated={loadAgents}
              />
            ))}
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
            Agent Proof-of-Intelligence Protocol • Assisterr Team
          </p>
        </div>
      </footer>
    </div>
  );
}
