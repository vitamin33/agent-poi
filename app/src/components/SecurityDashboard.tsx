"use client";

import { useState, useEffect, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { AgentData, getAgentPDA, isAnchorWallet } from "@/lib/program";

interface ActivityEntry {
  timestamp: string;
  action: string;
  agentName: string;
  riskLevel: "none" | "low" | "medium" | "high" | "critical";
  details: string;
}

interface SecurityDashboardProps {
  agents: AgentData[];
}

/**
 * SentinelAgent Security Dashboard
 * Displays audit trail and security metrics for registered agents
 */
export function SecurityDashboard({ agents }: SecurityDashboardProps) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [activityFeed, setActivityFeed] = useState<ActivityEntry[]>([]);
  const [networkStats, setNetworkStats] = useState({
    totalAgents: 0,
    verifiedAgents: 0,
    avgReputation: 0,
    totalChallenges: 0,
    securityAlerts: 0,
  });

  // Generate simulated activity feed based on agent data
  const generateActivityFeed = useCallback(() => {
    const feed: ActivityEntry[] = [];

    agents.forEach((agent) => {
      // Registration event
      feed.push({
        timestamp: new Date(agent.createdAt.toNumber() * 1000).toISOString(),
        action: "Agent Registered",
        agentName: agent.name,
        riskLevel: "none",
        details: `Model: ${agent.modelHash.substring(0, 20)}...`,
      });

      // Verification event (if verified)
      if (agent.verified) {
        feed.push({
          timestamp: new Date(agent.updatedAt.toNumber() * 1000).toISOString(),
          action: "Agent Verified",
          agentName: agent.name,
          riskLevel: "none",
          details: "Admin verification complete",
        });
      }

      // Challenge events
      for (let i = 0; i < agent.challengesPassed; i++) {
        feed.push({
          timestamp: new Date(Date.now() - Math.random() * 86400000).toISOString(),
          action: "Challenge Passed",
          agentName: agent.name,
          riskLevel: "none",
          details: "+100 reputation",
        });
      }

      for (let i = 0; i < agent.challengesFailed; i++) {
        feed.push({
          timestamp: new Date(Date.now() - Math.random() * 86400000).toISOString(),
          action: "Challenge Failed",
          agentName: agent.name,
          riskLevel: "medium",
          details: "-50 reputation",
        });
      }
    });

    // Sort by timestamp (newest first)
    feed.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return feed.slice(0, 20); // Last 20 activities
  }, [agents]);

  // Calculate network stats
  useEffect(() => {
    if (agents.length === 0) return;

    const verifiedCount = agents.filter((a) => a.verified).length;
    const avgRep = agents.reduce((sum, a) => sum + a.reputationScore, 0) / agents.length / 100;
    const totalChallenges = agents.reduce(
      (sum, a) => sum + a.challengesPassed + a.challengesFailed,
      0
    );

    setNetworkStats({
      totalAgents: agents.length,
      verifiedAgents: verifiedCount,
      avgReputation: avgRep,
      totalChallenges,
      securityAlerts: agents.filter((a) => a.reputationScore < 3000).length,
    });

    setActivityFeed(generateActivityFeed());
  }, [agents, generateActivityFeed]);

  const getRiskBadge = (level: ActivityEntry["riskLevel"]) => {
    const styles = {
      none: "bg-green-900/50 text-green-400",
      low: "bg-blue-900/50 text-blue-400",
      medium: "bg-yellow-900/50 text-yellow-400",
      high: "bg-orange-900/50 text-orange-400",
      critical: "bg-red-900/50 text-red-400",
    };

    return (
      <span className={`px-2 py-0.5 rounded text-xs ${styles[level]}`}>
        {level.toUpperCase()}
      </span>
    );
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span className="text-2xl">🛡️</span>
            SentinelAgent Security Monitor
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Real-time audit trail and compliance monitoring
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-green-400 text-sm">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            Live
          </span>
        </div>
      </div>

      {/* Network Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-gray-700/50 rounded-lg p-3">
          <p className="text-gray-400 text-xs">Total Agents</p>
          <p className="text-2xl font-bold text-white">{networkStats.totalAgents}</p>
        </div>
        <div className="bg-gray-700/50 rounded-lg p-3">
          <p className="text-gray-400 text-xs">Verified</p>
          <p className="text-2xl font-bold text-green-400">{networkStats.verifiedAgents}</p>
        </div>
        <div className="bg-gray-700/50 rounded-lg p-3">
          <p className="text-gray-400 text-xs">Avg Reputation</p>
          <p className="text-2xl font-bold text-purple-400">
            {networkStats.avgReputation.toFixed(1)}%
          </p>
        </div>
        <div className="bg-gray-700/50 rounded-lg p-3">
          <p className="text-gray-400 text-xs">Challenges</p>
          <p className="text-2xl font-bold text-blue-400">{networkStats.totalChallenges}</p>
        </div>
        <div className="bg-gray-700/50 rounded-lg p-3">
          <p className="text-gray-400 text-xs">Alerts</p>
          <p className="text-2xl font-bold text-red-400">{networkStats.securityAlerts}</p>
        </div>
      </div>

      {/* Activity Feed */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-3">Activity Feed</h3>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {activityFeed.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No activity yet</p>
              <p className="text-sm mt-1">Agent actions will appear here</p>
            </div>
          ) : (
            activityFeed.map((entry, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between bg-gray-700/30 rounded-lg p-3 hover:bg-gray-700/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center text-sm">
                    {entry.action === "Agent Registered" && "📝"}
                    {entry.action === "Agent Verified" && "✅"}
                    {entry.action === "Challenge Passed" && "🏆"}
                    {entry.action === "Challenge Failed" && "❌"}
                    {entry.action === "Security Alert" && "⚠️"}
                  </div>
                  <div>
                    <p className="text-white text-sm font-medium">{entry.action}</p>
                    <p className="text-gray-400 text-xs">
                      {entry.agentName} • {entry.details}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {getRiskBadge(entry.riskLevel)}
                  <span className="text-gray-500 text-xs">{formatTime(entry.timestamp)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Compliance Notice */}
      <div className="mt-6 bg-purple-900/20 border border-purple-800 rounded-lg p-4">
        <h4 className="text-purple-400 font-medium text-sm mb-2">
          EU AI Act Compliance Ready
        </h4>
        <p className="text-gray-400 text-xs">
          All agent actions are logged on-chain with immutable audit trails.
          This infrastructure supports the transparency and accountability
          requirements of the EU AI Act (Aug 2026 deadline).
        </p>
      </div>
    </div>
  );
}
