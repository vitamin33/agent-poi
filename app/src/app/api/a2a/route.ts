import { NextRequest, NextResponse } from "next/server";

const AGENT_API_URL =
  process.env.NEXT_PUBLIC_AGENT_API_URL || "http://localhost:8001";

/**
 * GET /api/a2a?endpoint=peers|interactions|info
 *
 * Proxies A2A requests to the Python agent API.
 * Supports fetching peer registry, interaction audit trail, and agent discovery info.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get("endpoint");

  const validEndpoints: Record<string, string> = {
    peers: "/peers",
    interactions: "/a2a/interactions",
    info: "/a2a/info",
    status: "/status",
    health: "/health",
  };

  if (!endpoint || !validEndpoints[endpoint]) {
    return NextResponse.json(
      {
        error: "Invalid endpoint",
        valid_endpoints: Object.keys(validEndpoints),
        usage: "/api/a2a?endpoint=peers",
      },
      { status: 400 }
    );
  }

  try {
    const targetUrl = `${AGENT_API_URL}${validEndpoints[endpoint]}`;
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
        hint: "Ensure the Python agent is running (e.g. localhost:8001)",
      },
      { status: 503 }
    );
  }
}
