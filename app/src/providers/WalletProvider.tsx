"use client";

import { FC, ReactNode, useMemo, useEffect, useState } from "react";
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
import { MockWalletAdapter, isTestMode } from "@/lib/mock-wallet-adapter";
import { AutoConnectWallet } from "@/components/AutoConnectWallet";

// Import wallet adapter styles
import "@solana/wallet-adapter-react-ui/styles.css";

interface Props {
  children: ReactNode;
}

export const AppWalletProvider: FC<Props> = ({ children }) => {
  // Use devnet for hackathon
  const endpoint = useMemo(() => clusterApiUrl("devnet"), []);
  const [testMode, setTestMode] = useState(false);

  // Check test mode on client side only
  useEffect(() => {
    setTestMode(isTestMode());
  }, []);

  // Configure supported wallets
  const wallets = useMemo(() => {
    const standardWallets = [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ];

    // In test mode, add mock wallet at the beginning
    if (testMode) {
      const privateKey = process.env.NEXT_PUBLIC_TEST_WALLET_PRIVATE_KEY;
      if (privateKey) {
        const mockWallet = new MockWalletAdapter(privateKey);
        return [mockWallet, ...standardWallets];
      }
    }

    return standardWallets;
  }, [testMode]);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>
          <AutoConnectWallet>
            {testMode && (
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
