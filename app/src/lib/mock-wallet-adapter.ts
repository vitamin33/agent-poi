/**
 * Mock Wallet Adapter for Automated Testing
 *
 * This adapter allows Playwright tests to sign transactions programmatically
 * without requiring a browser wallet extension.
 *
 * SECURITY: Only use this in test environments. Never expose private keys in production.
 */

import {
  BaseMessageSignerWalletAdapter,
  WalletName,
  WalletReadyState,
} from "@solana/wallet-adapter-base";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";

export const MockWalletName = "MockWallet" as WalletName<"MockWallet">;

export class MockWalletAdapter extends BaseMessageSignerWalletAdapter {
  name = MockWalletName;
  url = "https://test.assisterr.ai";
  icon =
    "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxNiIgY3k9IjE2IiByPSIxNiIgZmlsbD0iIzhCNUNGNiIvPjx0ZXh0IHg9IjE2IiB5PSIyMCIgZm9udC1zaXplPSIxMiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiPk08L3RleHQ+PC9zdmc+";
  supportedTransactionVersions = new Set<"legacy" | 0>(["legacy", 0]);

  private _keypair: Keypair | null = null;
  private _publicKey: PublicKey | null = null;
  private _connecting = false;
  private _connected = false;

  constructor(privateKeyBase58?: string) {
    super();
    if (privateKeyBase58) {
      try {
        const secretKey = bs58.decode(privateKeyBase58);
        this._keypair = Keypair.fromSecretKey(secretKey);
        this._publicKey = this._keypair.publicKey;
      } catch (error) {
        console.error("Invalid private key format:", error);
      }
    }
  }

  get publicKey(): PublicKey | null {
    return this._publicKey;
  }

  get connecting(): boolean {
    return this._connecting;
  }

  get connected(): boolean {
    return this._connected;
  }

  get readyState(): WalletReadyState {
    return this._keypair ? WalletReadyState.Installed : WalletReadyState.NotDetected;
  }

  async connect(): Promise<void> {
    if (this._connected || this._connecting) return;
    if (!this._keypair) {
      throw new Error("MockWallet: No private key configured");
    }

    this._connecting = true;
    try {
      this._connected = true;
      this.emit("connect", this._publicKey!);
    } finally {
      this._connecting = false;
    }
  }

  async disconnect(): Promise<void> {
    if (!this._connected) return;
    this._connected = false;
    this.emit("disconnect");
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(
    transaction: T
  ): Promise<T> {
    if (!this._keypair) {
      throw new Error("MockWallet: No private key configured");
    }

    if (transaction instanceof Transaction) {
      transaction.partialSign(this._keypair);
    } else {
      // VersionedTransaction
      transaction.sign([this._keypair]);
    }

    return transaction;
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(
    transactions: T[]
  ): Promise<T[]> {
    return Promise.all(transactions.map((tx) => this.signTransaction(tx)));
  }

  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    if (!this._keypair) {
      throw new Error("MockWallet: No private key configured");
    }

    // Use nacl or tweetnacl for ed25519 signing
    const { sign } = await import("tweetnacl");
    return sign.detached(message, this._keypair.secretKey);
  }
}

/**
 * Create a mock wallet from environment variable
 */
export function createMockWallet(): MockWalletAdapter | null {
  const privateKey = process.env.NEXT_PUBLIC_TEST_WALLET_PRIVATE_KEY;
  if (!privateKey) {
    console.warn("MockWallet: NEXT_PUBLIC_TEST_WALLET_PRIVATE_KEY not set");
    return null;
  }
  return new MockWalletAdapter(privateKey);
}

/**
 * Check if we're in test/mock mode
 */
export function isTestMode(): boolean {
  return (
    process.env.NEXT_PUBLIC_AUTH_MOCK === "true" ||
    process.env.NODE_ENV === "test"
  );
}

/**
 * Generate a new test wallet keypair and return as base58
 */
export function generateTestWallet(): { publicKey: string; privateKey: string } {
  const keypair = Keypair.generate();
  return {
    publicKey: keypair.publicKey.toBase58(),
    privateKey: bs58.encode(keypair.secretKey),
  };
}
