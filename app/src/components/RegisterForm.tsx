"use client";

import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { getProgram, getRegistryPDA, getAgentPDA, RegistryData } from "@/lib/program";

interface RegisterFormProps {
  onSuccess?: () => void;
}

export function RegisterForm({ onSuccess }: RegisterFormProps) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    modelHash: "sha256:",
    capabilities: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet.publicKey || !wallet.signTransaction) {
      setError("Please connect your wallet");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const program = getProgram(connection, wallet as any);
      const [registryPda] = getRegistryPDA();

      // Fetch registry to get current total_agents
      const registry = await program.account.registryState.fetch(registryPda) as RegistryData;
      const agentId = registry.totalAgents;

      const [agentPda] = getAgentPDA(wallet.publicKey, agentId);

      // Generate mock NFT for demo
      const mockNft = Keypair.generate();

      const tx = await program.methods
        .registerAgent(formData.name, formData.modelHash, formData.capabilities)
        .accounts({
          owner: wallet.publicKey,
          registry: registryPda,
          agent: agentPda,
          nftMint: mockNft.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setSuccess(`Agent registered! TX: ${tx.substring(0, 16)}...`);
      setFormData({ name: "", modelHash: "sha256:", capabilities: "" });
      onSuccess?.();
    } catch (err: any) {
      console.error("Registration error:", err);
      setError(err.message || "Failed to register agent");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Agent Name
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
          placeholder="My AI Agent"
          required
          maxLength={64}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Model Hash (SHA256)
        </label>
        <input
          type="text"
          value={formData.modelHash}
          onChange={(e) =>
            setFormData({ ...formData, modelHash: e.target.value })
          }
          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white font-mono text-sm focus:outline-none focus:border-purple-500"
          placeholder="sha256:abc123..."
          required
          minLength={71}
        />
        <p className="text-xs text-gray-500 mt-1">
          SHA256 hash of your model file (GGUF format)
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Capabilities
        </label>
        <input
          type="text"
          value={formData.capabilities}
          onChange={(e) =>
            setFormData({ ...formData, capabilities: e.target.value })
          }
          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
          placeholder="analysis, coding, trading"
          required
          maxLength={256}
        />
        <p className="text-xs text-gray-500 mt-1">
          Comma-separated list of capabilities
        </p>
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

      <button
        type="submit"
        disabled={loading || !wallet.publicKey}
        className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg transition-colors"
      >
        {loading ? "Registering..." : "Register Agent"}
      </button>
    </form>
  );
}
