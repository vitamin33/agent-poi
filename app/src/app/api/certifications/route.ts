import { NextRequest, NextResponse } from "next/server";

const AGENT_API_URL =
  process.env.NEXT_PUBLIC_AGENT_API_URL || "http://localhost:10000";

const AGENT_SLUGS = ["alpha", "beta", "gamma"];

/**
 * GET /api/certifications?slug=alpha
 *
 * Proxies certification requests to the Python agent API.
 * If slug is provided, returns certifications for that agent.
 * If no slug, returns certifications for all agents.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");

  try {
    if (slug) {
      // Single agent certifications
      const targetUrl = `${AGENT_API_URL}/${slug}/certifications`;
      const response = await fetch(targetUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return NextResponse.json(
          { error: `Agent API returned ${response.status}`, agent_url: targetUrl },
          { status: response.status }
        );
      }

      return NextResponse.json(await response.json());
    }

    // All agents - fetch in parallel
    const results = await Promise.allSettled(
      AGENT_SLUGS.map(async (s) => {
        const res = await fetch(`${AGENT_API_URL}/${s}/certifications`, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) throw new Error(`${s}: ${res.status}`);
        return res.json();
      })
    );

    const certifications = results
      .filter((r): r is PromiseFulfilledResult<unknown> => r.status === "fulfilled")
      .map((r) => r.value);

    return NextResponse.json(certifications);
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

/**
 * POST /api/certifications?slug=alpha
 *
 * Triggers a new certification run on the Python agent.
 * If slug is provided, certifies that specific agent.
 * If no slug, certifies all agents sequentially.
 */
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");

  try {
    const slugsToRun = slug ? [slug] : AGENT_SLUGS;
    const results = [];

    for (const s of slugsToRun) {
      const targetUrl = `${AGENT_API_URL}/${s}/certify`;
      const response = await fetch(targetUrl, {
        method: "POST",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(120000),
      });

      if (response.ok) {
        results.push(await response.json());
      } else {
        results.push({ agent: s, error: `Agent API returned ${response.status}` });
      }
    }

    return NextResponse.json(slug ? results[0] : results);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to reach agent API";

    return NextResponse.json(
      {
        error: message,
        agent_url: AGENT_API_URL,
        hint: "Certification may take up to 2 minutes per agent",
      },
      { status: 503 }
    );
  }
}
