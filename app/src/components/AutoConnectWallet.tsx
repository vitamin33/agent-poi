"use client";

import { useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { isTestMode, MockWalletName } from "@/lib/mock-wallet-adapter";

/**
 * Auto-connects the mock wallet in test mode
 * This component should be rendered inside WalletProvider
 */
export function AutoConnectWallet({ children }: { children: React.ReactNode }) {
  const { wallets, select, connect, connected, connecting } = useWallet();
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (!isTestMode()) return;
    if (connected || connecting || attemptedRef.current) return;

    // Find the mock wallet
    const mockWallet = wallets.find((w) => w.adapter.name === MockWalletName);
    if (!mockWallet) {
      console.warn("AutoConnectWallet: Mock wallet not found in wallet list");
      return;
    }

    attemptedRef.current = true;

    // Select and connect
    const doConnect = async () => {
      try {
        console.log("AutoConnectWallet: Selecting mock wallet...");
        select(MockWalletName);

        // Wait a tick for selection to propagate
        await new Promise((r) => setTimeout(r, 100));

        console.log("AutoConnectWallet: Connecting...");
        await connect();
        console.log("AutoConnectWallet: Connected successfully!");
      } catch (error) {
        console.error("AutoConnectWallet: Failed to connect:", error);
        attemptedRef.current = false; // Allow retry on error
      }
    };

    doConnect();
  }, [wallets, select, connect, connected, connecting]);

  return <>{children}</>;
}
