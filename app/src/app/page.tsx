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
        {/* Stats */}
        {registryInfo && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <p className="text-gray-400 text-sm">Total Agents</p>
              <p className="text-3xl font-bold text-white">
                {registryInfo.totalAgents.toString()}
              </p>
            </div>
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <p className="text-gray-400 text-sm">Collection</p>
              <p className="text-sm font-mono text-purple-400 truncate">
                {registryInfo.collectionInitialized
                  ? registryInfo.collection.toString().substring(0, 20) + "..."
                  : "Not initialized"}
              </p>
            </div>
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <p className="text-gray-400 text-sm">Network</p>
              <p className="text-2xl font-bold text-green-400">Devnet</p>
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
