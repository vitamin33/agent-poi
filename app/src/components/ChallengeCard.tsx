"use client";

import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import {
  getProgram,
  getRegistryPDA,
  ChallengeData,
  parseChallengeStatus,
  hashAnswer,
  isAnchorWallet,
} from "@/lib/program";

interface ChallengeCardProps {
  challenge: ChallengeData;
  challengePda: PublicKey;
  agentPda: PublicKey;
  agentName: string;
  isOwner: boolean;
  onUpdate?: () => void;
}

/**
 * Card displaying a challenge with response functionality
 */
export function ChallengeCard({
  challenge,
  challengePda,
  agentPda,
  agentName,
  isOwner,
  onUpdate,
}: ChallengeCardProps) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = parseChallengeStatus(challenge.status);
  const isExpired = Date.now() / 1000 > challenge.expiresAt.toNumber();
  const canRespond = isOwner && status === "pending" && !isExpired;

  const handleSubmitResponse = async () => {
    if (!isAnchorWallet(wallet)) {
      setError("Please connect your wallet");
      return;
    }

    if (response.trim().length === 0) {
      setError("Please enter your response");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const program = getProgram(connection, wallet);
      const [registryPda] = getRegistryPDA();

      // Hash the response
      const responseHash = await hashAnswer(response.trim());

      // Submit response on-chain
      const tx = await program.methods
        .submitResponse(responseHash)
        .accounts({
          owner: wallet.publicKey,
          registry: registryPda,
          agent: agentPda,
          challenge: challengePda,
        })
        .rpc();

      console.log("Response submitted:", tx);
      setResponse("");
      onUpdate?.();
    } catch (err: unknown) {
      console.error("Response submission error:", err);
      const message =
        err instanceof Error ? err.message : "Failed to submit response";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = () => {
    switch (status) {
      case "pending":
        return (
          <span className="bg-yellow-900/50 text-yellow-300 px-2 py-1 rounded text-xs">
            Pending
          </span>
        );
      case "passed":
        return (
          <span className="bg-green-900/50 text-green-300 px-2 py-1 rounded text-xs">
            Passed +100
          </span>
        );
      case "failed":
        return (
          <span className="bg-red-900/50 text-red-300 px-2 py-1 rounded text-xs">
            Failed -50
          </span>
        );
      case "expired":
        return (
          <span className="bg-gray-700 text-gray-400 px-2 py-1 rounded text-xs">
            Expired
          </span>
        );
    }
  };

  const formatTimeLeft = () => {
    const expiresAt = challenge.expiresAt.toNumber() * 1000;
    const now = Date.now();
    const diff = expiresAt - now;

    if (diff <= 0) return "Expired";

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) return `${hours}h ${minutes}m left`;
    return `${minutes}m left`;
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="font-medium text-white">{agentName}</h4>
          <p className="text-xs text-gray-500">
            From: {challenge.challenger.toString().substring(0, 12)}...
          </p>
        </div>
        <div className="flex items-center gap-2">
          {status === "pending" && !isExpired && (
            <span className="text-xs text-gray-400">{formatTimeLeft()}</span>
          )}
          {getStatusBadge()}
        </div>
      </div>

      <div className="bg-gray-700/50 rounded-lg p-3 mb-3">
        <p className="text-sm text-gray-200">{challenge.question}</p>
      </div>

      {canRespond && (
        <div className="space-y-2">
          <input
            type="text"
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            placeholder="Enter your response..."
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
            disabled={loading}
          />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button
            onClick={handleSubmitResponse}
            disabled={loading}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white py-2 rounded-lg text-sm transition-colors"
          >
            {loading ? "Submitting..." : "Submit Response"}
          </button>
        </div>
      )}

      {status !== "pending" && challenge.respondedAt && (
        <p className="text-xs text-gray-500 mt-2">
          Responded:{" "}
          {new Date(challenge.respondedAt.toNumber() * 1000).toLocaleString()}
        </p>
      )}
    </div>
  );
}
