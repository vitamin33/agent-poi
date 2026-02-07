"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { MockWalletName } from "@/lib/mock-wallet-adapter";

// Check test mode synchronously
const TEST_MODE = process.env.NEXT_PUBLIC_AUTH_MOCK === "true";

/**
 * Auto-connects the mock wallet in test mode
 * This component should be rendered inside WalletProvider
 *
 * Flow:
 * 1. Wait for hydration
 * 2. Select the mock wallet (don't call connect yet)
 * 3. When wallet state updates (wallet is set), call connect
 */
export function AutoConnectWallet({ children }: { children: React.ReactNode }) {
  const { wallets, select, connect, connected, connecting, wallet } = useWallet();
  const selectedRef = useRef(false);
  const connectAttemptedRef = useRef(false);
  const [isHydrated, setIsHydrated] = useState(false);

  // Mark as hydrated after first render on client
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // Step 1: Select the mock wallet (only once)
  useEffect(() => {
    if (!TEST_MODE) return;
    if (!isHydrated) return;
    if (selectedRef.current) return;
    if (wallet) return; // Already have a wallet selected

    // Find the mock wallet
    const mockWallet = wallets.find((w) => w.adapter.name === MockWalletName);
    if (!mockWallet) {
      console.log("AutoConnectWallet: Waiting for mock wallet in list...");
      return;
    }

    console.log("AutoConnectWallet: Selecting mock wallet...");
    selectedRef.current = true;
    select(MockWalletName);
  }, [wallets, select, wallet, isHydrated]);

  // Step 2: Connect when wallet is selected (wallet state is set)
  useEffect(() => {
    if (!TEST_MODE) return;
    if (!isHydrated) return;
    if (!wallet) return; // No wallet selected yet
    if (connected) return; // Already connected
    if (connecting) return; // Connection in progress
    if (connectAttemptedRef.current) return; // Already tried

    // Verify it's the mock wallet
    if (wallet.adapter.name !== MockWalletName) {
      console.log("AutoConnectWallet: Non-mock wallet selected, skipping auto-connect");
      return;
    }

    console.log("AutoConnectWallet: Mock wallet selected, connecting...");
    connectAttemptedRef.current = true;

    connect()
      .then(() => {
        console.log("AutoConnectWallet: Connected successfully!");
      })
      .catch((err) => {
        console.error("AutoConnectWallet: Connect failed:", err);
        connectAttemptedRef.current = false; // Allow retry
      });
  }, [wallet, connected, connecting, connect, isHydrated]);

  return <>{children}</>;
}
