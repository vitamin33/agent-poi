/**
 * Initialize the Agent Registry on Devnet
 *
 * This script initializes the registry state account, which is required
 * before any agents can be registered.
 */

import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

const PROGRAM_ID = new PublicKey("EQ2Zv3cTDBzY1PafPz2WDoup6niUv6X8t9id4PBACL38");

async function main() {
  // Connect to devnet
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");

  // Load keypair from default location or test-wallet.json
  let keypair: Keypair;
  const testWalletPath = path.join(__dirname, "..", "test-wallet.json");
  const defaultPath = `${process.env.HOME}/.config/solana/id.json`;

  if (fs.existsSync(testWalletPath)) {
    const secretKey = JSON.parse(fs.readFileSync(testWalletPath, "utf-8"));
    keypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));
    console.log("Using test-wallet.json");
  } else if (fs.existsSync(defaultPath)) {
    const secretKey = JSON.parse(fs.readFileSync(defaultPath, "utf-8"));
    keypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));
    console.log("Using default Solana keypair");
  } else {
    throw new Error("No keypair found");
  }

  console.log("Admin wallet:", keypair.publicKey.toBase58());

  // Derive registry PDA
  const [registryPda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from("registry")],
    PROGRAM_ID
  );
  console.log("Registry PDA:", registryPda.toBase58());

  // Check if registry already exists
  const registryAccount = await connection.getAccountInfo(registryPda);
  if (registryAccount) {
    console.log("Registry already initialized!");
    return;
  }

  // Build the initialize instruction
  // Instruction discriminator for "initialize" in Anchor: first 8 bytes of SHA256("global:initialize")
  const discriminator = Buffer.from([175, 175, 109, 31, 13, 152, 155, 237]);

  const keys = [
    { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
    { pubkey: registryPda, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  const instruction = new TransactionInstruction({
    keys,
    programId: PROGRAM_ID,
    data: discriminator,
  });

  const transaction = new Transaction().add(instruction);

  // Get recent blockhash
  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = keypair.publicKey;

  // Sign and send
  transaction.sign(keypair);

  console.log("Sending initialize transaction...");
  try {
    const signature = await connection.sendRawTransaction(transaction.serialize());
    console.log("Transaction signature:", signature);

    // Wait for confirmation
    await connection.confirmTransaction(signature, "confirmed");
    console.log("Registry initialized successfully!");

    // Verify
    const newAccount = await connection.getAccountInfo(registryPda);
    if (newAccount) {
      console.log("Registry account size:", newAccount.data.length, "bytes");
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

main().catch(console.error);
