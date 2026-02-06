"use client";

import { useState, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  getProgram,
  getChallengePDA,
  AgentData,
  hashAnswer,
  isAnchorWallet,
} from "@/lib/program";

interface ChallengeModalProps {
  agent: AgentData;
  agentPda: PublicKey;
  onClose: () => void;
  onSuccess?: () => void;
}

/**
 * Modal for creating a new challenge for an agent
 * Implements the Proof-of-Intelligence challenge-response pattern
 */
export function ChallengeModal({
  agent,
  agentPda,
  onClose,
  onSuccess,
}: ChallengeModalProps) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    question: "",
    expectedAnswer: "",
  });

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!isAnchorWallet(wallet)) {
        setError("Please connect a wallet that supports transaction signing");
        return;
      }

      // Validate inputs
      if (formData.question.trim().length < 10) {
        setError("Question must be at least 10 characters");
        return;
      }

      if (formData.expectedAnswer.trim().length < 1) {
        setError("Expected answer is required");
        return;
      }

      setLoading(true);
      setError(null);
      setSuccess(null);

      try {
        const program = getProgram(connection, wallet);

        // Generate hash of expected answer (SHA256)
        const expectedHash = await hashAnswer(formData.expectedAnswer.trim());

        // Derive challenge PDA
        const [challengePda] = getChallengePDA(agentPda, wallet.publicKey);

        // Create the challenge on-chain
        const tx = await program.methods
          .createChallenge(formData.question.trim(), expectedHash)
          .accounts({
            challenger: wallet.publicKey,
            agent: agentPda,
            challenge: challengePda,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        setSuccess(`Challenge created! TX: ${tx.substring(0, 16)}...`);
        setFormData({ question: "", expectedAnswer: "" });

        // Close modal after short delay
        setTimeout(() => {
          onSuccess?.();
          onClose();
        }, 2000);
      } catch (err: unknown) {
        console.error("Challenge creation error:", err);
        const message =
          err instanceof Error ? err.message : "Failed to create challenge";
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [wallet, connection, agentPda, formData, onSuccess, onClose]
  );

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg p-6 max-w-lg w-full border border-gray-700">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-white">
              Challenge Agent: {agent.name}
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              Test the agent&apos;s intelligence with a question
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors text-2xl"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Question
            </label>
            <textarea
              value={formData.question}
              onChange={(e) =>
                setFormData({ ...formData, question: e.target.value })
              }
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500 resize-none"
              placeholder="Ask the agent a question to verify its intelligence..."
              rows={3}
              required
              minLength={10}
              maxLength={256}
            />
            <p className="text-xs text-gray-500 mt-1">
              {formData.question.length}/256 characters
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Expected Answer
            </label>
            <input
              type="text"
              value={formData.expectedAnswer}
              onChange={(e) =>
                setFormData({ ...formData, expectedAnswer: e.target.value })
              }
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
              placeholder="The correct answer the agent should provide"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              The answer will be hashed (SHA256) before storing on-chain
            </p>
          </div>

          <div className="bg-gray-700/50 rounded-lg p-4 text-sm">
            <h4 className="font-medium text-purple-400 mb-2">
              How Challenges Work
            </h4>
            <ul className="text-gray-300 space-y-1 text-xs">
              <li>
                1. Your question is stored on-chain with a hash of the expected
                answer
              </li>
              <li>
                2. The agent has 24 hours to respond with their answer
              </li>
              <li>
                3. If the hash matches, the agent gains +100 reputation
              </li>
              <li>4. If it fails, the agent loses -50 reputation</li>
            </ul>
          </div>

          {error && (
            <div className="bg-red-900/50 border border-red-500 text-red-300 px-4 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-900/50 border border-green-500 text-green-300 px-4 py-2 rounded-lg text-sm">
              {success}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-600 hover:bg-gray-500 text-white py-3 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !wallet.publicKey}
              className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg transition-colors"
            >
              {loading ? "Creating..." : "Create Challenge"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
