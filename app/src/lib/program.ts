import { Program, AnchorProvider, Idl, BN } from "@coral-xyz/anchor";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import { AnchorWallet } from "@solana/wallet-adapter-react";

// Program ID from deployed contract
export const PROGRAM_ID = new PublicKey(
  "EQ2Zv3cTDBzY1PafPz2WDoup6niUv6X8t9id4PBACL38"
);

// IDL - simplified for client usage (typed as any for hackathon)
export const IDL: any = {
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

export function getProgram(connection: Connection, wallet: AnchorWallet): any {
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  return new Program(IDL, provider);
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
