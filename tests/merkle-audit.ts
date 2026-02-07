/**
 * Merkle Audit E2E Test
 *
 * Tests the complete flow:
 * 1. Register an agent
 * 2. Store Merkle audit root on-chain
 * 3. Verify the stored data
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { AgentRegistry } from "../target/types/agent_registry";
import { expect } from "chai";
import * as crypto from "crypto";

describe("Merkle Audit", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.AgentRegistry as Program<AgentRegistry>;
  const owner = provider.wallet.publicKey;

  // PDAs
  let registryPda: PublicKey;
  let agentPda: PublicKey;
  let merkleAuditSummaryPda: PublicKey;
  let merkleAuditRootPda: PublicKey;

  // Test data
  const testName = "MerkleTestAgent";
  const testModelHash = "sha256:" + crypto.randomBytes(32).toString("hex");
  const testCapabilities = "merkle,audit,testing";

  before(async () => {
    // Find registry PDA
    [registryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("registry")],
      program.programId
    );

    console.log("\n=== Merkle Audit Test ===");
    console.log("Program ID:", program.programId.toBase58());
    console.log("Registry PDA:", registryPda.toBase58());
  });

  it("Gets or initializes registry", async () => {
    try {
      const registry = await program.account.registryState.fetch(registryPda);
      console.log("Registry exists, total agents:", registry.totalAgents.toNumber());
    } catch {
      console.log("Registry not found, initializing...");
      await program.methods
        .initialize()
        .accounts({
          admin: owner,
          registry: registryPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log("Registry initialized");
    }
  });

  it("Registers a new agent", async () => {
    // Get current total agents to derive PDA
    const registry = await program.account.registryState.fetch(registryPda);
    const agentId = registry.totalAgents;

    // Derive agent PDA
    [agentPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("agent"),
        owner.toBuffer(),
        agentId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    // Generate a mock NFT mint
    const nftMint = anchor.web3.Keypair.generate().publicKey;

    console.log("\nRegistering agent:");
    console.log("  Name:", testName);
    console.log("  Model Hash:", testModelHash.substring(0, 30) + "...");
    console.log("  Agent PDA:", agentPda.toBase58());

    await program.methods
      .registerAgent(testName, testModelHash, testCapabilities)
      .accounts({
        owner,
        registry: registryPda,
        agent: agentPda,
        nftMint,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Verify
    const agent = await program.account.agentAccount.fetch(agentPda);
    expect(agent.name).to.equal(testName);
    expect(agent.modelHash).to.equal(testModelHash);
    console.log("  ✓ Agent registered successfully");
  });

  it("Stores Merkle audit root on-chain", async () => {
    // Derive Merkle audit PDAs
    [merkleAuditSummaryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("merkle_summary"), agentPda.toBuffer()],
      program.programId
    );

    // For first batch, batch_index = 0
    const batchIndex = new anchor.BN(0);
    [merkleAuditRootPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("merkle_audit"),
        agentPda.toBuffer(),
        batchIndex.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    // Create a test Merkle root (32 bytes)
    const merkleRoot = Array.from(crypto.randomBytes(32));
    const entriesCount = 10;

    console.log("\nStoring Merkle audit:");
    console.log("  Merkle Root:", Buffer.from(merkleRoot).toString("hex").substring(0, 32) + "...");
    console.log("  Entries Count:", entriesCount);
    console.log("  Summary PDA:", merkleAuditSummaryPda.toBase58());
    console.log("  Root PDA:", merkleAuditRootPda.toBase58());

    const tx = await program.methods
      .storeMerkleAudit(merkleRoot, entriesCount)
      .accounts({
        owner,
        agent: agentPda,
        auditSummary: merkleAuditSummaryPda,
        auditRoot: merkleAuditRootPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("  TX:", tx);

    // Verify the stored data
    const summary = await program.account.merkleAuditSummary.fetch(merkleAuditSummaryPda);
    expect(summary.totalBatches.toNumber()).to.equal(1);
    expect(summary.totalEntries.toNumber()).to.equal(entriesCount);
    console.log("  ✓ Summary verified");

    const root = await program.account.merkleAuditRoot.fetch(merkleAuditRootPda);
    expect(root.entriesCount).to.equal(entriesCount);
    expect(Array.from(root.merkleRoot)).to.deep.equal(merkleRoot);
    console.log("  ✓ Root verified");
  });

  it("Stores second Merkle audit batch", async () => {
    // Get current summary
    const summaryBefore = await program.account.merkleAuditSummary.fetch(merkleAuditSummaryPda);
    const batchIndex = summaryBefore.totalBatches;

    // Derive PDA for second batch
    [merkleAuditRootPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("merkle_audit"),
        agentPda.toBuffer(),
        batchIndex.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const merkleRoot = Array.from(crypto.randomBytes(32));
    const entriesCount = 25;

    console.log("\nStoring second batch:");
    console.log("  Batch Index:", batchIndex.toNumber());

    await program.methods
      .storeMerkleAudit(merkleRoot, entriesCount)
      .accounts({
        owner,
        agent: agentPda,
        auditSummary: merkleAuditSummaryPda,
        auditRoot: merkleAuditRootPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Verify updated summary
    const summaryAfter = await program.account.merkleAuditSummary.fetch(merkleAuditSummaryPda);
    expect(summaryAfter.totalBatches.toNumber()).to.equal(2);
    expect(summaryAfter.totalEntries.toNumber()).to.equal(10 + entriesCount);
    console.log("  ✓ Second batch stored");
    console.log("  Total batches:", summaryAfter.totalBatches.toNumber());
    console.log("  Total entries:", summaryAfter.totalEntries.toNumber());
  });
});
