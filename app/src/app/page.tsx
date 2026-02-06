"use client";

import { useEffect, useState, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { BN } from "@coral-xyz/anchor";
import {
  getProgram,
  getRegistryPDA,
  getAgentPDA,
  AgentData,
  RegistryData,
  isAnchorWallet,
} from "@/lib/program";
import { AgentCard } from "@/components/AgentCard";
import { RegisterForm } from "@/components/RegisterForm";
import { SecurityDashboard } from "@/components/SecurityDashboard";

export default function Home() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRegister, setShowRegister] = useState(false);
  const [registryInfo, setRegistryInfo] = useState<RegistryData | null>(null);

  const loadAgents = useCallback(async () => {
    if (!isAnchorWallet(wallet)) {
      setLoading(false);
      return;
    }

    try {
      const program = getProgram(connection, wallet);
      const [registryPda] = getRegistryPDA();

      // Fetch registry state
      const registry = await program.account.registryState.fetch(registryPda) as RegistryData;
      setRegistryInfo(registry);

      const totalAgents = registry.totalAgents.toNumber();
      const fetchedAgents: AgentData[] = [];

      // Fetch all agents (simple approach for demo)
      // In production, use getProgramAccounts with filters
      for (let i = 0; i < Math.min(totalAgents, 50); i++) {
        try {
          // We need to find agents by iterating through possible owners
          // For demo, we'll try to fetch our own agents and some known ones
          const [agentPda] = getAgentPDA(registry.admin, i);
          const agent = await program.account.agentAccount.fetch(agentPda) as AgentData;
          fetchedAgents.push(agent);
        } catch {
          // Agent might be owned by different user, skip
        }
      }

      // Also try to fetch current user's agents
      if (wallet.publicKey && !wallet.publicKey.equals(registry.admin)) {
        for (let i = 0; i < 10; i++) {
          try {
            const [agentPda] = getAgentPDA(wallet.publicKey, i);
            const agent = await program.account.agentAccount.fetch(agentPda) as AgentData;
            if (!fetchedAgents.find(a => a.agentId.eq(agent.agentId))) {
              fetchedAgents.push(agent);
            }
          } catch {
            break;
          }
        }
      }

      // Sort by reputation (descending)
      fetchedAgents.sort((a, b) => b.reputationScore - a.reputationScore);
      setAgents(fetchedAgents);
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
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
              <span className="text-xl">🤖</span>
            </div>
            <div>
              <h1 className="text-xl font-bold">Agent PoI</h1>
              <p className="text-xs text-gray-500">Proof-of-Intelligence on Solana</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 bg-gray-800 px-3 py-1 rounded-full">
              Devnet
            </span>
            <WalletMultiButton />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Hero Section */}
        <div className="bg-gradient-to-r from-purple-900/30 via-gray-900 to-pink-900/30 rounded-2xl p-8 mb-8 border border-purple-800/30">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
                Agent Proof-of-Intelligence
              </h1>
              <p className="text-gray-400 max-w-xl">
                On-chain verification that AI agents are who they claim to be.
                Cryptographic model hashing, challenge-response verification, and
                SLM evaluation benchmarks on Solana.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="bg-green-900/50 text-green-400 px-3 py-1 rounded-full text-sm border border-green-700/50 flex items-center gap-1">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                A2A Ready
              </span>
              <span className="bg-blue-900/50 text-blue-400 px-3 py-1 rounded-full text-sm border border-blue-700/50">
                EU AI Act
              </span>
              <span className="bg-purple-900/50 text-purple-400 px-3 py-1 rounded-full text-sm border border-purple-700/50">
                NFT Identity
              </span>
              <span className="bg-yellow-900/50 text-yellow-400 px-3 py-1 rounded-full text-sm border border-yellow-700/50">
                SLM Eval
              </span>
            </div>
          </div>
        </div>

        {/* Enhanced Stats - Verifiable Metrics */}
        {registryInfo && (
          <div className="mb-8">
            {/* Primary Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-4">
              <div className="bg-gradient-to-br from-purple-900/50 to-purple-800/30 rounded-lg p-4 border border-purple-700/50">
                <p className="text-purple-300 text-xs uppercase tracking-wide">Agents Registered</p>
                <p className="text-3xl font-bold text-white">
                  {registryInfo.totalAgents.toString()}
                </p>
              </div>
              <div className="bg-gradient-to-br from-green-900/50 to-green-800/30 rounded-lg p-4 border border-green-700/50">
                <p className="text-green-300 text-xs uppercase tracking-wide">Verified</p>
                <p className="text-3xl font-bold text-green-400">
                  {agents.filter(a => a.verified).length}
                </p>
              </div>
              <div className="bg-gradient-to-br from-blue-900/50 to-blue-800/30 rounded-lg p-4 border border-blue-700/50">
                <p className="text-blue-300 text-xs uppercase tracking-wide">Challenges</p>
                <p className="text-3xl font-bold text-blue-400">
                  {agents.reduce((sum, a) => sum + a.challengesPassed + a.challengesFailed, 0)}
                </p>
              </div>
              <div className="bg-gradient-to-br from-yellow-900/50 to-yellow-800/30 rounded-lg p-4 border border-yellow-700/50">
                <p className="text-yellow-300 text-xs uppercase tracking-wide">Pass Rate</p>
                <p className="text-3xl font-bold text-yellow-400">
                  {agents.length > 0
                    ? Math.round(
                        (agents.reduce((sum, a) => sum + a.challengesPassed, 0) /
                        Math.max(1, agents.reduce((sum, a) => sum + a.challengesPassed + a.challengesFailed, 0))) * 100
                      )
                    : 0}%
                </p>
              </div>
              <div className="bg-gradient-to-br from-pink-900/50 to-pink-800/30 rounded-lg p-4 border border-pink-700/50">
                <p className="text-pink-300 text-xs uppercase tracking-wide">Avg Reputation</p>
                <p className="text-3xl font-bold text-pink-400">
                  {agents.length > 0
                    ? (agents.reduce((sum, a) => sum + a.reputationScore, 0) / agents.length / 100).toFixed(1)
                    : 0}%
                </p>
              </div>
              <div className="bg-gradient-to-br from-cyan-900/50 to-cyan-800/30 rounded-lg p-4 border border-cyan-700/50">
                <p className="text-cyan-300 text-xs uppercase tracking-wide">Network</p>
                <p className="text-2xl font-bold text-cyan-400">Devnet</p>
              </div>
            </div>

            {/* Program Info Bar */}
            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-gray-500">Program:</span>
                <code className="text-purple-400 bg-gray-900 px-2 py-1 rounded font-mono">
                  EQ2Zv3c...BACL38
                </code>
                <a
                  href="https://explorer.solana.com/address/EQ2Zv3cTDBzY1PafPz2WDoup6niUv6X8t9id4PBACL38?cluster=devnet"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline"
                >
                  View on Explorer
                </a>
              </div>
              <div className="flex items-center gap-4">
                <a href="/skill.json" className="text-green-400 hover:underline">skill.json</a>
                <a href="/skill.md" className="text-green-400 hover:underline">skill.md</a>
                <a
                  href="https://github.com/vitaliiserbynassisterr/assisterr-agent-hackathon"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-white"
                >
                  GitHub
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Agent Leaderboard</h2>
          {wallet.publicKey && (
            <button
              onClick={() => setShowRegister(!showRegister)}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              {showRegister ? "Close" : "+ Register Agent"}
            </button>
          )}
        </div>

        {/* Register Form */}
        {showRegister && wallet.publicKey && (
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-8">
            <h3 className="text-lg font-semibold mb-4">Register New Agent</h3>
            <RegisterForm
              onSuccess={() => {
                setShowRegister(false);
                loadAgents();
              }}
            />
          </div>
        )}

        {/* Agent List */}
        {!wallet.publicKey ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🔐</div>
            <h3 className="text-xl font-semibold mb-2">Connect Your Wallet</h3>
            <p className="text-gray-400 mb-6">
              Connect your Solana wallet to view and register agents
            </p>
            <WalletMultiButton />
          </div>
        ) : loading ? (
          <div className="text-center py-20">
            <div className="animate-spin text-4xl mb-4">⚡</div>
            <p className="text-gray-400">Loading agents...</p>
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🤖</div>
            <h3 className="text-xl font-semibold mb-2">No Agents Yet</h3>
            <p className="text-gray-400 mb-6">
              Be the first to register an AI agent on-chain!
            </p>
            <button
              onClick={() => setShowRegister(true)}
              className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg transition-colors"
            >
              Register First Agent
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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

        {/* Security Dashboard - SentinelAgent Layer */}
        {wallet.publicKey && agents.length > 0 && (
          <div className="mt-12">
            <SecurityDashboard agents={agents} />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 mt-20 py-8 text-center text-gray-500 text-sm">
        <p>
          Built for{" "}
          <a
            href="https://www.colosseum.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-400 hover:underline"
          >
            Colosseum Agent Hackathon
          </a>
        </p>
        <p className="mt-2">
          Agent Proof-of-Intelligence | Assisterr Team
        </p>
      </footer>
    </div>
  );
}
