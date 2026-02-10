import { NextRequest, NextResponse } from "next/server";

const AGENT_API_URL =
  process.env.NEXT_PUBLIC_AGENT_API_URL || "http://localhost:10000";

const AGENT_SLUGS = ["alpha", "beta", "gamma"];

interface InteractionsSummary {
  total_interactions: number;
  successful_on_chain: number;
  http_only: number;
  unique_peers: number;
}

interface AgentInteractions {
  agent_name: string;
  a2a_protocol: boolean;
  summary: InteractionsSummary;
  recent_interactions: Record<string, unknown>[];
}

/**
 * Fetch interactions from all agents and merge into a single response.
 * Combines summaries and sorts all interactions by timestamp descending.
 */
async function fetchAggregatedInteractions(): Promise<AgentInteractions> {
  const results = await Promise.allSettled(
    AGENT_SLUGS.map(async (s) => {
      const res = await fetch(`${AGENT_API_URL}/${s}/a2a/interactions`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`${s}: ${res.status}`);
      return res.json() as Promise<AgentInteractions>;
    })
  );

  const fulfilled = results
    .filter((r): r is PromiseFulfilledResult<AgentInteractions> => r.status === "fulfilled")
    .map((r) => r.value);

  // Merge all interactions and sort by timestamp descending
  const allInteractions = fulfilled
    .flatMap((d) => d.recent_interactions)
    .sort((a, b) => {
      const ta = String((a as Record<string, unknown>).timestamp || "");
      const tb = String((b as Record<string, unknown>).timestamp || "");
      return tb.localeCompare(ta);
    })
    .slice(0, 50);

  // Aggregate summaries
  const summary: InteractionsSummary = {
    total_interactions: fulfilled.reduce((s, d) => s + d.summary.total_interactions, 0),
    successful_on_chain: fulfilled.reduce((s, d) => s + d.summary.successful_on_chain, 0),
    http_only: fulfilled.reduce((s, d) => s + d.summary.http_only, 0),
    unique_peers: fulfilled.reduce((s, d) => s + d.summary.unique_peers, 0),
  };

  return {
    agent_name: "All Agents",
    a2a_protocol: true,
    summary,
    recent_interactions: allInteractions,
  };
}

/**
 * GET /api/a2a?endpoint=peers|interactions|info|status|health|certifications&slug=alpha
 *
 * Proxies A2A requests to the Python agent API.
 * For `interactions` endpoint without slug, aggregates from all agents.
 * For other endpoints, uses the `slug` param (default: "alpha") to route
 * to the correct agent sub-app (e.g. /alpha/peers, /beta/certifications).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get("endpoint");
  const slug = searchParams.get("slug");

  const validEndpoints: Record<string, string> = {
    peers: "/peers",
    interactions: "/a2a/interactions",
    info: "/a2a/info",
    status: "/status",
    health: "/health",
    certifications: "/certifications",
  };

  if (!endpoint || !validEndpoints[endpoint]) {
    return NextResponse.json(
      {
        error: "Invalid endpoint",
        valid_endpoints: Object.keys(validEndpoints),
        usage: "/api/a2a?endpoint=peers&slug=alpha",
      },
      { status: 400 }
    );
  }

  try {
    // For interactions without a specific slug, aggregate from all agents
    if (endpoint === "interactions" && !slug) {
      const aggregated = await fetchAggregatedInteractions();
      return NextResponse.json(aggregated);
    }

    // Route through agent slug for multi-agent gateway
    const targetSlug = slug || "alpha";
    const targetUrl = `${AGENT_API_URL}/${targetSlug}${validEndpoints[endpoint]}`;
    const response = await fetch(targetUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `Agent API returned ${response.status}`,
          agent_url: targetUrl,
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to reach agent API";

    return NextResponse.json(
      {
        error: message,
        agent_url: AGENT_API_URL,
        hint: "Ensure the Python agent is running on port 10000 (multi_main.py)",
      },
      { status: 503 }
    );
  }
}
