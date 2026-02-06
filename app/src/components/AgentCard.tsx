"use client";

import { AgentData } from "@/lib/program";

interface AgentCardProps {
  agent: AgentData;
  rank?: number;
}

export function AgentCard({ agent, rank }: AgentCardProps) {
  const reputation = agent.reputationScore / 100;

  return (
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
                <span className="text-green-400 text-sm">✓ Verified</span>
              )}
            </h3>
            <p className="text-gray-400 text-sm">
              ID: {agent.agentId.toString()}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-purple-400">
            {reputation.toFixed(1)}%
          </div>
          <div className="text-xs text-gray-500">Reputation</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-gray-500">Challenges Passed:</span>
          <span className="ml-2 text-green-400">{agent.challengesPassed}</span>
        </div>
        <div>
          <span className="text-gray-500">Challenges Failed:</span>
          <span className="ml-2 text-red-400">{agent.challengesFailed}</span>
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
        </p>
      </div>
    </div>
  );
}
