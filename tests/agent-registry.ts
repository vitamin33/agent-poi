import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Keypair } from "@solana/web3.js";
import { expect } from "chai";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import BN from "bn.js";
import { createHash } from "crypto";

// ESM compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("agent-registry", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Load the program from IDL
  const idlPath = join(__dirname, "../target/idl/agent_registry.json");
  const idl = JSON.parse(readFileSync(idlPath, "utf-8"));
  const programId = new PublicKey(idl.address);
  const program = new anchor.Program(idl, provider);

  // PDAs
  const [registryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("registry")],
    programId
  );

  // Test data
  const testModelHash = "sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
  const testAgentName = "TestAgent";
  const testCapabilities = "analysis,coding";

  // Mock collection and NFT (in production these would be real Metaplex Core assets)
  const mockCollection = Keypair.generate();
  const mockNft = Keypair.generate();

  it("Initialize registry", async () => {
    try {
      const tx = await program.methods
        .initialize()
        .accounts({
          admin: provider.wallet.publicKey,
          registry: registryPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("Initialize tx:", tx);

      // Fetch registry state
      const registryState = await program.account.registryState.fetch(registryPda);
      expect(registryState.admin.toString()).to.equal(provider.wallet.publicKey.toString());
      expect(registryState.totalAgents.toNumber()).to.equal(0);
      expect(registryState.collectionInitialized).to.be.false;

      console.log("Registry initialized with admin:", registryState.admin.toString());
    } catch (err: any) {
      // If already initialized, that's okay
      if (err.message && err.message.includes("already in use")) {
        console.log("Registry already initialized");
      } else {
        throw err;
      }
    }
  });

  it("Set collection address (create_collection)", async () => {
    try {
      const tx = await program.methods
        .createCollection()
        .accounts({
          admin: provider.wallet.publicKey,
          registry: registryPda,
          collection: mockCollection.publicKey,
        })
        .rpc();

      console.log("Create collection tx:", tx);

      // Verify collection was set
      const registryState = await program.account.registryState.fetch(registryPda);
      expect(registryState.collection.toString()).to.equal(mockCollection.publicKey.toString());
      expect(registryState.collectionInitialized).to.be.true;

      console.log("Collection set:", registryState.collection.toString());
    } catch (err: any) {
      // If already set, that's okay for idempotent tests
      if (err.message && err.message.includes("CollectionAlreadyInitialized")) {
        console.log("Collection already initialized");
      } else {
        throw err;
      }
    }
  });

  it("Register a new agent with NFT reference", async () => {
    // Fetch registry to get total_agents for PDA derivation
    const registryState = await program.account.registryState.fetch(registryPda);
    const agentId = registryState.totalAgents;

    const [agentPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("agent"),
        provider.wallet.publicKey.toBuffer(),
        agentId.toArrayLike(Buffer, "le", 8),
      ],
      programId
    );

    const tx = await program.methods
      .registerAgent(testAgentName, testModelHash, testCapabilities)
      .accounts({
        owner: provider.wallet.publicKey,
        registry: registryPda,
        agent: agentPda,
        nftMint: mockNft.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("Register agent tx:", tx);

    // Fetch agent account
    const agentAccount = await program.account.agentAccount.fetch(agentPda);
    expect(agentAccount.name).to.equal(testAgentName);
    expect(agentAccount.modelHash).to.equal(testModelHash);
    expect(agentAccount.capabilities).to.equal(testCapabilities);
    expect(agentAccount.reputationScore).to.equal(5000); // Initial 50%
    expect(agentAccount.verified).to.be.false;
    expect(agentAccount.nftMint.toString()).to.equal(mockNft.publicKey.toString());

    console.log("Agent registered:", {
      id: agentAccount.agentId.toNumber(),
      name: agentAccount.name,
      modelHash: agentAccount.modelHash.substring(0, 20) + "...",
      reputation: agentAccount.reputationScore / 100 + "%",
      nftMint: agentAccount.nftMint.toString().substring(0, 12) + "...",
    });
  });

  it("Update agent metadata", async () => {
    // Get agent ID 0
    const agentId = new BN(0);

    const [agentPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("agent"),
        provider.wallet.publicKey.toBuffer(),
        agentId.toArrayLike(Buffer, "le", 8),
      ],
      programId
    );

    const newName = "UpdatedAgent";
    const newCapabilities = "analysis,coding,trading";

    const tx = await program.methods
      .updateAgent(newName, newCapabilities)
      .accounts({
        owner: provider.wallet.publicKey,
        agent: agentPda,
      })
      .rpc();

    console.log("Update agent tx:", tx);

    // Verify update
    const agentAccount = await program.account.agentAccount.fetch(agentPda);
    expect(agentAccount.name).to.equal(newName);
    expect(agentAccount.capabilities).to.equal(newCapabilities);

    console.log("Agent updated:", {
      name: agentAccount.name,
      capabilities: agentAccount.capabilities,
    });
  });

  it("Verify agent (admin only)", async () => {
    const agentId = new BN(0);

    const [agentPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("agent"),
        provider.wallet.publicKey.toBuffer(),
        agentId.toArrayLike(Buffer, "le", 8),
      ],
      programId
    );

    const tx = await program.methods
      .verifyAgent()
      .accounts({
        admin: provider.wallet.publicKey,
        registry: registryPda,
        agent: agentPda,
      })
      .rpc();

    console.log("Verify agent tx:", tx);

    // Verify the agent is now verified
    const agentAccount = await program.account.agentAccount.fetch(agentPda);
    expect(agentAccount.verified).to.be.true;

    console.log("Agent verified:", agentAccount.verified);
  });

  it("Update reputation", async () => {
    const agentId = new BN(0);

    const [agentPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("agent"),
        provider.wallet.publicKey.toBuffer(),
        agentId.toArrayLike(Buffer, "le", 8),
      ],
      programId
    );

    // Get initial reputation
    const agentBefore = await program.account.agentAccount.fetch(agentPda);
    const initialReputation = agentBefore.reputationScore;

    // Increase reputation by 100
    const tx = await program.methods
      .updateReputation(100)
      .accounts({
        authority: provider.wallet.publicKey,
        registry: registryPda,
        agent: agentPda,
      })
      .rpc();

    console.log("Update reputation tx:", tx);

    // Verify reputation increased
    const agentAfter = await program.account.agentAccount.fetch(agentPda);
    expect(agentAfter.reputationScore).to.equal(initialReputation + 100);
    expect(agentAfter.challengesPassed).to.equal(1);

    console.log("Reputation updated:", {
      before: initialReputation / 100 + "%",
      after: agentAfter.reputationScore / 100 + "%",
      challengesPassed: agentAfter.challengesPassed,
    });
  });

  // ============================================
  // Day 3: Challenge-Response System Tests
  // ============================================

  const challengeAnswer = "The answer to life, the universe, and everything is 42";
  const expectedHash = createHash("sha256").update(challengeAnswer).digest("hex");

  it("Create a challenge for an agent", async () => {
    const agentId = new BN(0);

    const [agentPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("agent"),
        provider.wallet.publicKey.toBuffer(),
        agentId.toArrayLike(Buffer, "le", 8),
      ],
      programId
    );

    const [challengePda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("challenge"),
        agentPda.toBuffer(),
        provider.wallet.publicKey.toBuffer(),
      ],
      programId
    );

    const question = "What is the meaning of life?";

    const tx = await program.methods
      .createChallenge(question, expectedHash)
      .accounts({
        challenger: provider.wallet.publicKey,
        agent: agentPda,
        challenge: challengePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("Create challenge tx:", tx);

    // Fetch challenge state
    const challengeAccount = await program.account.challenge.fetch(challengePda);
    expect(challengeAccount.question).to.equal(question);
    expect(challengeAccount.expectedHash).to.equal(expectedHash);
    expect(challengeAccount.status).to.deep.equal({ pending: {} });
    expect(challengeAccount.agent.toString()).to.equal(agentPda.toString());

    console.log("Challenge created:", {
      question: challengeAccount.question,
      expectedHash: challengeAccount.expectedHash.substring(0, 16) + "...",
      status: "Pending",
      expiresAt: new Date(challengeAccount.expiresAt.toNumber() * 1000).toISOString(),
    });
  });

  it("Submit correct response to challenge (PASS)", async () => {
    const agentId = new BN(0);

    const [agentPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("agent"),
        provider.wallet.publicKey.toBuffer(),
        agentId.toArrayLike(Buffer, "le", 8),
      ],
      programId
    );

    const [challengePda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("challenge"),
        agentPda.toBuffer(),
        provider.wallet.publicKey.toBuffer(),
      ],
      programId
    );

    // Get agent state before
    const agentBefore = await program.account.agentAccount.fetch(agentPda);
    const reputationBefore = agentBefore.reputationScore;

    // Submit the correct response hash
    const responseHash = createHash("sha256").update(challengeAnswer).digest("hex");

    const tx = await program.methods
      .submitResponse(responseHash)
      .accounts({
        owner: provider.wallet.publicKey,
        registry: registryPda,
        agent: agentPda,
        challenge: challengePda,
      })
      .rpc();

    console.log("Submit response tx:", tx);

    // Verify challenge status
    const challengeAccount = await program.account.challenge.fetch(challengePda);
    expect(challengeAccount.status).to.deep.equal({ passed: {} });

    // Verify agent reputation increased
    const agentAfter = await program.account.agentAccount.fetch(agentPda);
    expect(agentAfter.reputationScore).to.equal(reputationBefore + 100); // +100 for passing
    expect(agentAfter.challengesPassed).to.equal(agentBefore.challengesPassed + 1);

    console.log("Challenge PASSED:", {
      reputationBefore: reputationBefore / 100 + "%",
      reputationAfter: agentAfter.reputationScore / 100 + "%",
      challengesPassed: agentAfter.challengesPassed,
    });
  });

  it("Create and fail a challenge (wrong answer)", async () => {
    const agentId = new BN(0);

    const [agentPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("agent"),
        provider.wallet.publicKey.toBuffer(),
        agentId.toArrayLike(Buffer, "le", 8),
      ],
      programId
    );

    // Use a different challenger to create a new challenge
    const challenger2 = Keypair.generate();

    // Airdrop SOL to challenger2
    const airdropSig = await provider.connection.requestAirdrop(
      challenger2.publicKey,
      1000000000 // 1 SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    const [challengePda2] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("challenge"),
        agentPda.toBuffer(),
        challenger2.publicKey.toBuffer(),
      ],
      programId
    );

    const question2 = "What is 2 + 2?";
    const correctAnswer = "4";
    const expectedHash2 = createHash("sha256").update(correctAnswer).digest("hex");

    // Create challenge with challenger2
    const createTx = await program.methods
      .createChallenge(question2, expectedHash2)
      .accounts({
        challenger: challenger2.publicKey,
        agent: agentPda,
        challenge: challengePda2,
        systemProgram: SystemProgram.programId,
      })
      .signers([challenger2])
      .rpc();

    console.log("Create challenge 2 tx:", createTx);

    // Get agent state before
    const agentBefore = await program.account.agentAccount.fetch(agentPda);
    const reputationBefore = agentBefore.reputationScore;

    // Submit WRONG answer
    const wrongAnswer = "5";
    const wrongHash = createHash("sha256").update(wrongAnswer).digest("hex");

    const submitTx = await program.methods
      .submitResponse(wrongHash)
      .accounts({
        owner: provider.wallet.publicKey,
        registry: registryPda,
        agent: agentPda,
        challenge: challengePda2,
      })
      .rpc();

    console.log("Submit wrong response tx:", submitTx);

    // Verify challenge status
    const challengeAccount = await program.account.challenge.fetch(challengePda2);
    expect(challengeAccount.status).to.deep.equal({ failed: {} });

    // Verify agent reputation decreased
    const agentAfter = await program.account.agentAccount.fetch(agentPda);
    expect(agentAfter.reputationScore).to.equal(reputationBefore - 50); // -50 for failing
    expect(agentAfter.challengesFailed).to.equal(agentBefore.challengesFailed + 1);

    console.log("Challenge FAILED:", {
      reputationBefore: reputationBefore / 100 + "%",
      reputationAfter: agentAfter.reputationScore / 100 + "%",
      challengesFailed: agentAfter.challengesFailed,
    });
  });
});
