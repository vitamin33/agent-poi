import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorWallet } from "@solana/wallet-adapter-react";
import { WalletContextState } from "@solana/wallet-adapter-react";

// Program ID from deployed contract
export const PROGRAM_ID = new PublicKey(
  "EQ2Zv3cTDBzY1PafPz2WDoup6niUv6X8t9id4PBACL38"
);

/**
 * Model hash validation regex
 * Format: sha256: followed by exactly 64 hex characters
 */
export const MODEL_HASH_REGEX = /^sha256:[a-f0-9]{64}$/i;

/**
 * Validate model hash format
 */
export function isValidModelHash(hash: string): boolean {
  return MODEL_HASH_REGEX.test(hash);
}

// IDL - simplified for client usage
// Note: Full type generation requires anchor-client-gen or similar tooling
// For hackathon demo, using Idl type with runtime validation
export const IDL = {
  version: "0.1.0",
  name: "agent_registry",
  address: "EQ2Zv3cTDBzY1PafPz2WDoup6niUv6X8t9id4PBACL38",
  instructions: [
    {
      name: "initialize",
      accounts: [
        { name: "admin", isMut: true, isSigner: true },
        { name: "registry", isMut: true, isSigner: false },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [],
    },
    {
      name: "createCollection",
      accounts: [
        { name: "admin", isMut: true, isSigner: true },
        { name: "registry", isMut: true, isSigner: false },
        { name: "collection", isMut: false, isSigner: false },
      ],
      args: [],
    },
    {
      name: "registerAgent",
      accounts: [
        { name: "owner", isMut: true, isSigner: true },
        { name: "registry", isMut: true, isSigner: false },
        { name: "agent", isMut: true, isSigner: false },
        { name: "nftMint", isMut: false, isSigner: false },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [
        { name: "name", type: "string" },
        { name: "modelHash", type: "string" },
        { name: "capabilities", type: "string" },
      ],
    },
    {
      name: "createChallenge",
      accounts: [
        { name: "challenger", isMut: true, isSigner: true },
        { name: "agent", isMut: false, isSigner: false },
        { name: "challenge", isMut: true, isSigner: false },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [
        { name: "question", type: "string" },
        { name: "expectedHash", type: "string" },
      ],
    },
  ],
  accounts: [
    {
      name: "RegistryState",
      type: {
        kind: "struct",
        fields: [
          { name: "admin", type: "publicKey" },
          { name: "totalAgents", type: "u64" },
          { name: "collection", type: "publicKey" },
          { name: "collectionInitialized", type: "bool" },
          { name: "bump", type: "u8" },
        ],
      },
    },
    {
      name: "AgentAccount",
      type: {
        kind: "struct",
        fields: [
          { name: "agentId", type: "u64" },
          { name: "owner", type: "publicKey" },
          { name: "name", type: "string" },
          { name: "modelHash", type: "string" },
          { name: "capabilities", type: "string" },
          { name: "reputationScore", type: "u32" },
          { name: "challengesPassed", type: "u32" },
          { name: "challengesFailed", type: "u32" },
          { name: "verified", type: "bool" },
          { name: "createdAt", type: "i64" },
          { name: "updatedAt", type: "i64" },
          { name: "nftMint", type: "publicKey" },
          { name: "bump", type: "u8" },
        ],
      },
    },
  ],
};

export interface AgentData {
  agentId: BN;
  owner: PublicKey;
  name: string;
  modelHash: string;
  capabilities: string;
  reputationScore: number;
  challengesPassed: number;
  challengesFailed: number;
  verified: boolean;
  createdAt: BN;
  updatedAt: BN;
  nftMint: PublicKey;
  bump: number;
}

export interface RegistryData {
  admin: PublicKey;
  totalAgents: BN;
  collection: PublicKey;
  collectionInitialized: boolean;
  bump: number;
}

export interface ChallengeData {
  agent: PublicKey;
  challenger: PublicKey;
  question: string;
  expectedHash: string;
  status: { pending: object } | { passed: object } | { failed: object } | { expired: object };
  createdAt: BN;
  expiresAt: BN;
  respondedAt: BN | null;
  bump: number;
}

export type ChallengeStatus = "pending" | "passed" | "failed" | "expired";

/**
 * Parse challenge status from on-chain data
 */
export function parseChallengeStatus(status: ChallengeData["status"]): ChallengeStatus {
  if ("pending" in status) return "pending";
  if ("passed" in status) return "passed";
  if ("failed" in status) return "failed";
  return "expired";
}

/**
 * Generate SHA256 hash for challenge answer (client-side)
 * Uses Web Crypto API for browser compatibility
 */
export async function hashAnswer(answer: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(answer);
  // Cast to satisfy strict TypeScript - TextEncoder always returns ArrayBuffer-backed Uint8Array
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new Uint8Array(data).buffer as ArrayBuffer
  );
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Type guard to check if a wallet has the required properties for AnchorWallet
 */
export function isAnchorWallet(wallet: WalletContextState): wallet is WalletContextState & AnchorWallet {
  return !!(
    wallet.publicKey &&
    wallet.signTransaction &&
    wallet.signAllTransactions
  );
}

/**
 * Get the Anchor program instance
 * @throws Error if wallet is not connected or doesn't support signing
 *
 * Note: Returns `any` because we don't have generated types from anchor-client-gen.
 * In production, use `anchor build && anchor idl generate` to create proper types.
 */
export function getProgram(connection: Connection, wallet: AnchorWallet): ReturnType<typeof createProgram> {
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  return new Program(IDL, provider) as unknown as ReturnType<typeof createProgram>;
}

// Type helper for the program instance (accounts are dynamically accessed)
function createProgram() {
  return null as unknown as {
    methods: Record<string, (...args: unknown[]) => { accounts: (accounts: Record<string, unknown>) => { rpc: () => Promise<string> } }>;
    account: {
      registryState: { fetch: (address: PublicKey) => Promise<RegistryData> };
      agentAccount: { fetch: (address: PublicKey) => Promise<AgentData> };
      challenge: { fetch: (address: PublicKey) => Promise<ChallengeData> };
    };
  };
}

export function getRegistryPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("registry")], PROGRAM_ID);
}

export function getAgentPDA(
  owner: PublicKey,
  agentId: number | BN
): [PublicKey, number] {
  const id = typeof agentId === "number" ? new BN(agentId) : agentId;
  return PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), owner.toBuffer(), id.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID
  );
}

export function getChallengePDA(
  agent: PublicKey,
  challenger: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("challenge"), agent.toBuffer(), challenger.toBuffer()],
    PROGRAM_ID
  );
}
