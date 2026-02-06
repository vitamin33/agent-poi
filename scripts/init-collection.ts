/**
 * Initialize the NFT Collection for Agent Identity
 *
 * This script initializes the collection, which is required
 * before agents can be registered.
 */

import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

const PROGRAM_ID = new PublicKey("EQ2Zv3cTDBzY1PafPz2WDoup6niUv6X8t9id4PBACL38");

async function main() {
  // Connect to devnet
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");

  // Load keypair from test-wallet.json
  const testWalletPath = path.join(__dirname, "..", "test-wallet.json");
  if (!fs.existsSync(testWalletPath)) {
    throw new Error("test-wallet.json not found");
  }

  const secretKey = JSON.parse(fs.readFileSync(testWalletPath, "utf-8"));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));
  console.log("Admin wallet:", keypair.publicKey.toBase58());

  // Derive registry PDA
  const [registryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("registry")],
    PROGRAM_ID
  );
  console.log("Registry PDA:", registryPda.toBase58());

  // Generate a collection keypair (for mock NFT collection)
  const collectionKeypair = Keypair.generate();
  console.log("Collection:", collectionKeypair.publicKey.toBase58());

  // Build the create_collection instruction
  // Discriminator for "create_collection"
  const discriminator = Buffer.from([156, 251, 92, 54, 233, 2, 16, 82]);

  const keys = [
    { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
    { pubkey: registryPda, isSigner: false, isWritable: true },
    { pubkey: collectionKeypair.publicKey, isSigner: false, isWritable: false },
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

  console.log("Sending create_collection transaction...");
  try {
    const signature = await connection.sendRawTransaction(transaction.serialize());
    console.log("Transaction signature:", signature);

    // Wait for confirmation
    await connection.confirmTransaction(signature, "confirmed");
    console.log("Collection initialized successfully!");
    console.log("Collection address:", collectionKeypair.publicKey.toBase58());
  } catch (error) {
    console.error("Error:", error);
  }
}

main().catch(console.error);
