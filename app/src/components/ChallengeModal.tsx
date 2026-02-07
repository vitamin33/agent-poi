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
        const expectedHash = await hashAnswer(formData.expectedAnswer.trim());
        const [challengePda] = getChallengePDA(agentPda, wallet.publicKey);

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

        setTimeout(() => {
          onSuccess?.();
          onClose();
        }, 2000);
      } catch (err: unknown) {
        console.error("Challenge creation error:", err);
        // Log more details for debugging
        if (err && typeof err === 'object' && 'logs' in err) {
          console.error("Transaction logs:", (err as { logs: string[] }).logs);
        }
        if (err && typeof err === 'object' && 'message' in err) {
          console.error("Error message:", (err as Error).message);
        }
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
    <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4">
      <div
        className="bg-[var(--bg-elevated)] rounded-2xl max-w-lg w-full border border-[rgba(0,240,255,0.1)] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-[rgba(0,240,255,0.1)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[var(--bg-deep)]">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                  Challenge Agent
                </h2>
                <p className="text-sm text-[var(--text-muted)]">
                  {agent.name}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-primary)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              aria-label="Close modal"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              Question
            </label>
            <textarea
              value={formData.question}
              onChange={(e) =>
                setFormData({ ...formData, question: e.target.value })
              }
              className="input-neural w-full rounded-lg px-4 py-3 text-[var(--text-primary)] resize-none"
              placeholder="Ask the agent a question to verify its intelligence..."
              rows={3}
              required
              minLength={10}
              maxLength={256}
            />
            <p className="text-xs text-[var(--text-muted)] mt-2">
              {formData.question.length}/256 characters
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              Expected Answer
            </label>
            <input
              type="text"
              value={formData.expectedAnswer}
              onChange={(e) =>
                setFormData({ ...formData, expectedAnswer: e.target.value })
              }
              className="input-neural w-full rounded-lg px-4 py-3 text-[var(--text-primary)]"
              placeholder="The correct answer the agent should provide"
              required
            />
            <p className="text-xs text-[var(--text-muted)] mt-2">
              The answer will be hashed (SHA256) before storing on-chain
            </p>
          </div>

          {/* How it works */}
          <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[rgba(0,240,255,0.05)]">
            <h4 className="font-medium text-[var(--accent-primary)] text-sm mb-3 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[var(--accent-primary)]">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              How Challenges Work
            </h4>
            <ol className="text-xs text-[var(--text-secondary)] space-y-2">
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-[rgba(0,240,255,0.1)] text-[var(--accent-primary)] flex items-center justify-center flex-shrink-0 text-[10px] font-bold">1</span>
                <span>Your question is stored on-chain with a hash of the expected answer</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-[rgba(0,240,255,0.1)] text-[var(--accent-primary)] flex items-center justify-center flex-shrink-0 text-[10px] font-bold">2</span>
                <span>The agent has 24 hours to respond with their answer</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-[rgba(16,185,129,0.1)] text-[#10b981] flex items-center justify-center flex-shrink-0 text-[10px] font-bold">3</span>
                <span>If the hash matches, the agent gains +100 reputation</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-[rgba(239,68,68,0.1)] text-[#ef4444] flex items-center justify-center flex-shrink-0 text-[10px] font-bold">4</span>
                <span>If it fails, the agent loses -50 reputation</span>
              </li>
            </ol>
          </div>

          {error && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#ef4444] flex-shrink-0">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <span className="text-sm text-[#ef4444]">{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-[rgba(16,185,129,0.1)] border border-[rgba(16,185,129,0.3)]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#10b981] flex-shrink-0">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="text-sm text-[#10b981]">{success}</span>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 btn-secondary py-3 rounded-xl font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !wallet.publicKey}
              className="flex-1 btn-primary py-3 rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                  </svg>
                  Creating...
                </span>
              ) : (
                "Create Challenge"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
