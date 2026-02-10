"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Connection, PublicKey, AccountInfo } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { PROGRAM_ID, getRegistryPDA, fetchAgentAccount, AgentData } from "@/lib/program";

/**
 * Event types for the live feed
 */
export type SolanaEventType =
  | "agent_registered"
  | "agent_updated"
  | "reputation_changed"
  | "challenge_created"
  | "challenge_responded"
  | "connection_status";

export interface SolanaEvent {
  id: string;
  type: SolanaEventType;
  timestamp: Date;
  data: {
    agentName?: string;
    agentId?: number;
    oldReputation?: number;
    newReputation?: number;
    challengeQuestion?: string;
    status?: string;
    txSignature?: string;
    accountKey?: string;
  };
}

export interface UseSolanaEventsOptions {
  maxEvents?: number;
  enabled?: boolean;
}

/**
 * Hook to subscribe to Solana program account changes via WebSocket
 *
 * This demonstrates real-time blockchain integration:
 * - Subscribes to program account changes
 * - Parses account data to detect events
 * - Provides a feed of live events for the UI
 */
export function useSolanaEvents(
  connection: Connection | null,
  options: UseSolanaEventsOptions = {}
) {
  const { maxEvents = 50, enabled = true } = options;

  const [events, setEvents] = useState<SolanaEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [lastEventTime, setLastEventTime] = useState<Date | null>(null);

  // Track known agents to detect changes
  const knownAgentsRef = useRef<Map<string, AgentData>>(new Map());
  const subscriptionIdRef = useRef<number | null>(null);
  const eventCounterRef = useRef(0);

  /**
   * Add a new event to the feed
   */
  const addEvent = useCallback((type: SolanaEventType, data: SolanaEvent["data"]) => {
    const event: SolanaEvent = {
      id: `evt-${Date.now()}-${eventCounterRef.current++}`,
      type,
      timestamp: new Date(),
      data,
    };

    setEvents(prev => {
      const newEvents = [event, ...prev].slice(0, maxEvents);
      return newEvents;
    });
    setLastEventTime(new Date());

    return event;
  }, [maxEvents]);

  /**
   * Parse account change and emit appropriate event
   */
  const handleAccountChange = useCallback(async (
    accountInfo: AccountInfo<Buffer>,
    accountKey: PublicKey
  ) => {
    if (!connection) return;

    try {
      // Try to parse as agent account
      const agentData = await fetchAgentAccount(connection, accountKey);
      if (!agentData) return;

      const agentKey = accountKey.toBase58();
      const previousAgent = knownAgentsRef.current.get(agentKey);

      if (!previousAgent) {
        // New agent registered
        addEvent("agent_registered", {
          agentName: agentData.name,
          agentId: agentData.agentId.toNumber(),
          newReputation: agentData.reputationScore,
          accountKey: agentKey,
        });
        knownAgentsRef.current.set(agentKey, agentData);
      } else {
        // Check what changed
        if (previousAgent.reputationScore !== agentData.reputationScore) {
          // Reputation changed (challenge result)
          const reputationDelta = agentData.reputationScore - previousAgent.reputationScore;

          if (agentData.challengesPassed > previousAgent.challengesPassed) {
            addEvent("challenge_responded", {
              agentName: agentData.name,
              agentId: agentData.agentId.toNumber(),
              oldReputation: previousAgent.reputationScore,
              newReputation: agentData.reputationScore,
              status: "passed",
              accountKey: agentKey,
            });
          } else if (agentData.challengesFailed > previousAgent.challengesFailed) {
            addEvent("challenge_responded", {
              agentName: agentData.name,
              agentId: agentData.agentId.toNumber(),
              oldReputation: previousAgent.reputationScore,
              newReputation: agentData.reputationScore,
              status: "failed",
              accountKey: agentKey,
            });
          } else {
            addEvent("reputation_changed", {
              agentName: agentData.name,
              agentId: agentData.agentId.toNumber(),
              oldReputation: previousAgent.reputationScore,
              newReputation: agentData.reputationScore,
              accountKey: agentKey,
            });
          }
        } else if (
          previousAgent.name !== agentData.name ||
          previousAgent.capabilities !== agentData.capabilities
        ) {
          addEvent("agent_updated", {
            agentName: agentData.name,
            agentId: agentData.agentId.toNumber(),
            accountKey: agentKey,
          });
        }

        // Update known state
        knownAgentsRef.current.set(agentKey, agentData);
      }
    } catch (error) {
      // Not a valid agent account, might be registry or challenge
      console.debug("Account change (non-agent):", accountKey.toBase58());
    }
  }, [connection, addEvent]);

  /**
   * Subscribe to program account changes
   */
  useEffect(() => {
    if (!connection || !enabled) return;

    let isActive = true;

    const subscribe = async () => {
      try {
        // Suppress noisy WebSocket errors from Solana public devnet RPC
        const origConsoleError = console.error;
        const wsErrorFilter = (...args: unknown[]) => {
          const msg = String(args[0] ?? "");
          if (msg.includes("ws error") || msg.includes("WebSocket")) return;
          origConsoleError.apply(console, args);
        };
        console.error = wsErrorFilter;

        // Subscribe to all program accounts
        const subscriptionId = connection.onProgramAccountChange(
          PROGRAM_ID,
          (accountInfo, context) => {
            if (!isActive) return;
            handleAccountChange(accountInfo.accountInfo, accountInfo.accountId);
          },
          "confirmed"
        );

        subscriptionIdRef.current = subscriptionId;
        setIsConnected(true);

        addEvent("connection_status", {
          status: "connected",
        });

        console.log("WebSocket subscribed to program:", PROGRAM_ID.toBase58());

      } catch (error) {
        // WebSocket subscription failures are non-critical - devnet RPC is flaky
        console.debug("WebSocket subscription unavailable:", error);
        setIsConnected(false);

        addEvent("connection_status", {
          status: "disconnected",
        });
      }
    };

    subscribe();

    return () => {
      isActive = false;

      if (subscriptionIdRef.current !== null && connection) {
        connection.removeProgramAccountChangeListener(subscriptionIdRef.current)
          .catch(console.error);
        subscriptionIdRef.current = null;
      }

      setIsConnected(false);
    };
  }, [connection, enabled, handleAccountChange, addEvent]);

  /**
   * Clear all events
   */
  const clearEvents = useCallback(() => {
    setEvents([]);
    eventCounterRef.current = 0;
  }, []);

  /**
   * Manually trigger a simulated event (for demo purposes)
   */
  const simulateEvent = useCallback((type: SolanaEventType, data: SolanaEvent["data"]) => {
    return addEvent(type, data);
  }, [addEvent]);

  return {
    events,
    isConnected,
    lastEventTime,
    clearEvents,
    simulateEvent,
    eventCount: events.length,
  };
}
