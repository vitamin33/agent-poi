"use client";

import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { AgentData, getAgentPDA } from "@/lib/program";
import { ChallengeModal } from "./ChallengeModal";

interface AgentCardProps {
  agent: AgentData;
  rank?: number;
  onChallengeCreated?: () => void;
}

export function AgentCard({ agent, rank, onChallengeCreated }: AgentCardProps) {
  const wallet = useWallet();
  const [showChallengeModal, setShowChallengeModal] = useState(false);

  const reputation = agent.reputationScore / 100;
  const isOwner = wallet.publicKey?.equals(agent.owner);

  // Derive agent PDA for challenge creation
  const [agentPda] = getAgentPDA(agent.owner, agent.agentId);

  const getReputationColor = () => {
    if (reputation >= 70) return "text-green-400";
    if (reputation >= 50) return "text-yellow-400";
    return "text-red-400";
  };

  const getReputationBar = () => {
    return (
      <div className="w-full bg-gray-700 rounded-full h-2 mt-1">
        <div
          className={`h-2 rounded-full transition-all ${
            reputation >= 70
              ? "bg-green-500"
              : reputation >= 50
              ? "bg-yellow-500"
              : "bg-red-500"
          }`}
          style={{ width: `${Math.min(reputation, 100)}%` }}
        />
      </div>
    );
  };

  return (
    <>
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 hover:border-purple-500 transition-colors">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {rank && (
              <span className="text-2xl font-bold text-purple-400">#{rank}</span>
            )}
            <div>
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                {agent.name}
                {agent.verified && (
                  <span className="bg-green-900/50 text-green-400 text-xs px-2 py-0.5 rounded-full">
                    Verified
                  </span>
                )}
              </h3>
              <p className="text-gray-400 text-sm">
                ID: {agent.agentId.toString()}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className={`text-2xl font-bold ${getReputationColor()}`}>
              {reputation.toFixed(1)}%
            </div>
            <div className="text-xs text-gray-500">Reputation</div>
            {getReputationBar()}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div className="bg-gray-700/30 rounded-lg p-2">
            <span className="text-gray-500">Challenges Passed:</span>
            <span className="ml-2 text-green-400 font-medium">
              {agent.challengesPassed}
            </span>
          </div>
          <div className="bg-gray-700/30 rounded-lg p-2">
            <span className="text-gray-500">Challenges Failed:</span>
            <span className="ml-2 text-red-400 font-medium">
              {agent.challengesFailed}
            </span>
          </div>
        </div>

        <div className="mt-4">
          <p className="text-xs text-gray-500">Capabilities</p>
          <div className="flex flex-wrap gap-2 mt-1">
            {agent.capabilities.split(",").map((cap) => (
              <span
                key={cap}
                className="bg-purple-900/50 text-purple-300 px-2 py-1 rounded text-xs"
              >
                {cap.trim()}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-700">
          <p className="text-xs text-gray-500 truncate">
            Model: {agent.modelHash.substring(0, 32)}...
          </p>
          <p className="text-xs text-gray-500 truncate mt-1">
            Owner: {agent.owner.toString().substring(0, 16)}...
            {isOwner && (
              <span className="ml-2 text-purple-400">(You)</span>
            )}
          </p>
        </div>

        {/* Action buttons */}
        <div className="mt-4 flex gap-2">
          {!isOwner && wallet.publicKey && (
            <button
              onClick={() => setShowChallengeModal(true)}
              className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg text-sm transition-colors"
            >
              Challenge Agent
            </button>
          )}
          <a
            href={`https://explorer.solana.com/address/${agentPda.toString()}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg text-sm text-center transition-colors"
          >
            View on Explorer
          </a>
        </div>
      </div>

      {/* Challenge Modal */}
      {showChallengeModal && (
        <ChallengeModal
          agent={agent}
          agentPda={agentPda}
          onClose={() => setShowChallengeModal(false)}
          onSuccess={() => {
            setShowChallengeModal(false);
            onChallengeCreated?.();
          }}
        />
      )}
    </>
  );
}
