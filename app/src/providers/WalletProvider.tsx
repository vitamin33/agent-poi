"use client";

import { FC, ReactNode, useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";
import { MockWalletAdapter } from "@/lib/mock-wallet-adapter";
import { AutoConnectWallet } from "@/components/AutoConnectWallet";

// Import wallet adapter styles
import "@solana/wallet-adapter-react-ui/styles.css";

// Check test mode synchronously using env var (available at build time)
const TEST_MODE = process.env.NEXT_PUBLIC_AUTH_MOCK === "true";
const TEST_WALLET_KEY = process.env.NEXT_PUBLIC_TEST_WALLET_PRIVATE_KEY;

interface Props {
  children: ReactNode;
}

export const AppWalletProvider: FC<Props> = ({ children }) => {
  // Use devnet for hackathon
  const endpoint = useMemo(() => clusterApiUrl("devnet"), []);

  // Configure supported wallets - include mock wallet if in test mode
  const wallets = useMemo(() => {
    const standardWallets = [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ];

    // In test mode, add mock wallet at the beginning
    if (TEST_MODE && TEST_WALLET_KEY) {
      console.log("WalletProvider: Test mode enabled, adding mock wallet");
      const mockWallet = new MockWalletAdapter(TEST_WALLET_KEY);
      return [mockWallet, ...standardWallets];
    }

    return standardWallets;
  }, []);

  // Solana devnet public WebSocket is flaky; configure with longer keepalive
  const connectionConfig = useMemo(
    () => ({
      wsEndpoint: endpoint.replace("https", "wss"),
      commitment: "confirmed" as const,
    }),
    [endpoint]
  );

  return (
    <ConnectionProvider endpoint={endpoint} config={connectionConfig}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>
          <AutoConnectWallet>
            {TEST_MODE && (
              <div className="fixed top-0 left-0 right-0 bg-yellow-600 text-black text-center text-xs py-1 z-[9999]">
                TEST MODE - Mock Wallet Active
              </div>
            )}
            {children}
          </AutoConnectWallet>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};
