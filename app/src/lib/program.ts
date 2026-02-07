import { Program, AnchorProvider, BN, Idl } from "@coral-xyz/anchor";
import { Connection, PublicKey, TransactionInstruction, SystemProgram, Transaction } from "@solana/web3.js";
import { AnchorWallet } from "@solana/wallet-adapter-react";
import { WalletContextState } from "@solana/wallet-adapter-react";
import { createHash } from "crypto";

// Import the actual IDL from Anchor build (has discriminators for Anchor 0.32+)
import IDL_JSON from "./agent_registry.json";

// Cast the imported JSON to Idl type
export const IDL = IDL_JSON as Idl;

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

/**
 * Manually fetch and parse registry state
 * This bypasses Anchor's account parsing which may have IDL format issues
 */
export async function fetchRegistryState(
  connection: Connection
): Promise<RegistryData | null> {
  const [registryPda] = getRegistryPDA();

  try {
    const accountInfo = await connection.getAccountInfo(registryPda);
    if (!accountInfo) {
      return null;
    }

    // Skip 8-byte discriminator
    const data = accountInfo.data.slice(8);

    // Parse registry state manually
    // Layout: admin (32) + totalAgents (8) + collection (32) + collectionInitialized (1) + bump (1)
    const admin = new PublicKey(data.slice(0, 32));
    const totalAgents = new BN(data.slice(32, 40), "le");
    const collection = new PublicKey(data.slice(40, 72));
    const collectionInitialized = data[72] === 1;
    const bump = data[73];

    return {
      admin,
      totalAgents,
      collection,
      collectionInitialized,
      bump,
    };
  } catch (error) {
    console.error("Error fetching registry:", error);
    return null;
  }
}

/**
 * Manually fetch and parse agent account
 */
export async function fetchAgentAccount(
  connection: Connection,
  agentPda: PublicKey
): Promise<AgentData | null> {
  try {
    const accountInfo = await connection.getAccountInfo(agentPda);
    if (!accountInfo) {
      return null;
    }

    return parseAgentAccountData(accountInfo.data);
  } catch (error) {
    console.error("Error fetching agent:", error);
    return null;
  }
}

/**
 * Parse agent account from raw data buffer
 */
function parseAgentAccountData(rawData: Buffer): AgentData | null {
  try {
    // Skip 8-byte discriminator
    const data = rawData.slice(8);

    // Parse agent account manually
    let offset = 0;

    const agentId = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    const owner = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    // String fields: length (4 bytes) + data
    const nameLen = data.readUInt32LE(offset);
    offset += 4;
    const name = data.slice(offset, offset + nameLen).toString("utf8");
    offset += nameLen;

    const modelHashLen = data.readUInt32LE(offset);
    offset += 4;
    const modelHash = data.slice(offset, offset + modelHashLen).toString("utf8");
    offset += modelHashLen;

    const capabilitiesLen = data.readUInt32LE(offset);
    offset += 4;
    const capabilities = data.slice(offset, offset + capabilitiesLen).toString("utf8");
    offset += capabilitiesLen;

    const reputationScore = data.readUInt32LE(offset);
    offset += 4;

    const challengesPassed = data.readUInt32LE(offset);
    offset += 4;

    const challengesFailed = data.readUInt32LE(offset);
    offset += 4;

    const verified = data[offset] === 1;
    offset += 1;

    const createdAt = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    const updatedAt = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    const nftMint = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const bump = data[offset];

    return {
      agentId,
      owner,
      name,
      modelHash,
      capabilities,
      reputationScore,
      challengesPassed,
      challengesFailed,
      verified,
      createdAt,
      updatedAt,
      nftMint,
      bump,
    };
  } catch (error) {
    console.error("Error parsing agent data:", error);
    return null;
  }
}

/**
 * AgentAccount discriminator (first 8 bytes)
 * From IDL: accounts[0].discriminator for AgentAccount
 */
const AGENT_ACCOUNT_DISCRIMINATOR = Buffer.from([
  241, 119, 69, 140, 233, 9, 112, 50
]);

/**
 * Fetch ALL agent accounts from the program using getProgramAccounts
 * This returns all agents regardless of owner
 */
export async function fetchAllAgents(
  connection: Connection
): Promise<AgentData[]> {
  try {
    // Use dataSize filter to match AgentAccount size
    // This is more reliable than memcmp with discriminator
    const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
      filters: [
        {
          memcmp: {
            offset: 0,
            bytes: Buffer.from(AGENT_ACCOUNT_DISCRIMINATOR).toString("base64"),
            encoding: "base64",
          },
        },
      ],
    });

    const agents: AgentData[] = [];
    for (const { account } of accounts) {
      const parsed = parseAgentAccountData(account.data as Buffer);
      if (parsed) {
        agents.push(parsed);
      }
    }

    console.log(`Fetched ${agents.length} agents from on-chain`);
    return agents;
  } catch (error) {
    console.error("Error fetching all agents:", error);
    // Fallback: return empty array, don't break the app
    return [];
  }
}

/**
 * Calculate Anchor instruction discriminator
 * Anchor uses sighash("global:<instruction_name>")
 */
function getInstructionDiscriminator(name: string): Buffer {
  // In browser, we can't use Node's crypto, so use a pre-computed value
  // or implement SHA256 using Web Crypto
  const discriminators: Record<string, number[]> = {
    "register_agent": [135, 157, 66, 195, 2, 113, 175, 30],
  };

  if (discriminators[name]) {
    return Buffer.from(discriminators[name]);
  }

  // Fallback - this won't work in browser but helps with debugging
  throw new Error(`Unknown instruction: ${name}`);
}

/**
 * Encode a string for Anchor (4-byte length prefix + UTF-8 data)
 */
function encodeString(str: string): Buffer {
  const strBytes = Buffer.from(str, "utf8");
  const lenBuffer = Buffer.alloc(4);
  lenBuffer.writeUInt32LE(strBytes.length, 0);
  return Buffer.concat([lenBuffer, strBytes]);
}

/**
 * Build registerAgent transaction instruction manually
 */
export function buildRegisterAgentInstruction(
  owner: PublicKey,
  registryPda: PublicKey,
  agentPda: PublicKey,
  nftMint: PublicKey,
  name: string,
  modelHash: string,
  capabilities: string
): TransactionInstruction {
  // Build instruction data
  const discriminator = getInstructionDiscriminator("register_agent");
  const nameData = encodeString(name);
  const modelHashData = encodeString(modelHash);
  const capabilitiesData = encodeString(capabilities);

  const data = Buffer.concat([
    discriminator,
    nameData,
    modelHashData,
    capabilitiesData,
  ]);

  const keys = [
    { pubkey: owner, isSigner: true, isWritable: true },
    { pubkey: registryPda, isSigner: false, isWritable: true },
    { pubkey: agentPda, isSigner: false, isWritable: true },
    { pubkey: nftMint, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId: PROGRAM_ID,
    data,
  });
}

/**
 * Send a transaction and confirm it
 */
export async function sendAndConfirmTransaction(
  connection: Connection,
  wallet: AnchorWallet,
  instruction: TransactionInstruction
): Promise<string> {
  const transaction = new Transaction().add(instruction);

  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = wallet.publicKey;

  const signedTx = await wallet.signTransaction(transaction);
  const signature = await connection.sendRawTransaction(signedTx.serialize());

  await connection.confirmTransaction(signature, "confirmed");
  return signature;
}
