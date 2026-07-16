/**
 * HoodBazaar signals — x402 paid endpoint (GET ?collection=<opensea-slug>)
 *
 * Returns an accumulation/distribution read for a Robinhood Chain NFT
 * collection: floor, 24h stats, detected sweeps and a heuristic signal with
 * confidence + reasons. Mirrors packages/signals in the HoodBazaar monorepo;
 * kept self-contained (no imports) for Bankr bundling.
 */

const OPENSEA = "https://api.opensea.io/api/v2";

interface Sale {
  ts: number;
  buyer: string;
  contract: string;
  tokenId: string;
  priceEth: number;
}

interface Sweep {
  buyer: string;
  count: number;
  totalEth: number;
  firstTs: number;
  lastTs: number;
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const collection = url.searchParams.get("collection") ?? "";
  if (!/^[a-z0-9-]{1,100}$/.test(collection)) {
    return Response.json(
      { error: "collection must be an OpenSea slug, e.g. ascii-cats-robinhood" },
      { status: 400 },
    );
  }
  const apiKey = process.env.OPENSEA_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "endpoint misconfigured" }, { status: 500 });
  }
  const headers = { accept: "application/json", "x-api-key": apiKey };

  try {
    const [statsRes, eventsRes] = await Promise.all([
      fetch(`${OPENSEA}/collections/${collection}/stats`, { headers }),
      fetch(`${OPENSEA}/events/collection/${collection}?event_type=sale&limit=50`, { headers }),
    ]);
    if (!statsRes.ok) {
      return Response.json(
        { error: `collection not found (${statsRes.status})` },
        { status: 404 },
      );
    }
    const stats: any = await statsRes.json();
    const events: any = eventsRes.ok ? await eventsRes.json() : { asset_events: [] };

    const day = (stats.intervals ?? []).find((i: any) => i.interval === "one_day");
    const floorEth: number | null =
      typeof stats.total?.floor_price === "number" ? stats.total.floor_price : null;
    const floorChange24hPct: number | null =
      typeof day?.price_change === "number" ? day.price_change * 100 : null;
    const volume24hEth: number = day?.volume ?? 0;
    const sales24h: number = day?.sales ?? 0;

    const cutoff = Math.floor(Date.now() / 1000) - 24 * 3600;
    const sales: Sale[] = (events.asset_events ?? [])
      .filter((e: any) => e.event_type === "sale" && e.buyer && e.nft)
      .map((e: any) => ({
        ts: e.event_timestamp,
        buyer: String(e.buyer).toLowerCase(),
        contract: String(e.nft?.contract ?? "").toLowerCase(),
        tokenId: e.nft?.identifier ?? "",
        priceEth: Number(e.payment?.quantity ?? 0) / 1e18,
      }))
      .filter((s: Sale) => s.ts >= cutoff);

    const sweeps = detectSweeps(sales, 3, 1800);
    const sweepTotalEth = sweeps.reduce((a, s) => a + s.totalEth, 0);

    // Heuristic scoring — mirrors @hoodbazaar/signals classify()
    const reasons: string[] = [];
    let score = 0;
    if (sweeps.length > 0) {
      score += Math.min(sweeps.length, 3);
      reasons.push(`${sweeps.length} sweep(s) detected (${sweepTotalEth.toFixed(2)} ETH)`);
    }
    if (floorChange24hPct != null) {
      if (floorChange24hPct >= 5) {
        score += 2;
        reasons.push(`floor up ${floorChange24hPct.toFixed(1)}% in 24h`);
      } else if (floorChange24hPct <= -5) {
        score -= 2;
        reasons.push(`floor down ${Math.abs(floorChange24hPct).toFixed(1)}% in 24h`);
      }
    }
    if (sales24h >= 20 && (floorChange24hPct ?? 0) < 0) {
      score -= 1;
      reasons.push(`heavy selling: ${sales24h} sales into a falling floor`);
    }
    if (volume24hEth === 0 && sales24h === 0) reasons.push("no 24h activity");

    const signal = score >= 2 ? "accumulation" : score <= -2 ? "distribution" : "neutral";
    const confidence = Math.min(Math.abs(score) / 5, 1);

    return Response.json({
      collection,
      generatedAt: Date.now(),
      chain: "robinhood",
      floorEth,
      floorChange24hPct,
      volume24hEth,
      sales24h,
      sweeps,
      signal,
      confidence,
      reasons,
      disclaimer: "Heuristic signal, not financial advice.",
    });
  } catch (err: any) {
    return Response.json(
      { error: `signal computation failed: ${err?.message ?? "unknown"}` },
      { status: 502 },
    );
  }
}

/** Same buyer buying >= minCount items within windowSeconds. */
function detectSweeps(sales: Sale[], minCount: number, windowSeconds: number): Sweep[] {
  const groups = new Map<string, Sale[]>();
  for (const s of sales) {
    if (!s.buyer || !s.contract) continue;
    const key = `${s.buyer}|${s.contract}`;
    const arr = groups.get(key);
    if (arr) arr.push(s);
    else groups.set(key, [s]);
  }
  const sweeps: Sweep[] = [];
  for (const [key, group] of groups) {
    if (group.length < minCount) continue;
    const sorted = [...group].sort((a, b) => a.ts - b.ts);
    let start = 0;
    let best: Sale[] | null = null;
    for (let end = 0; end < sorted.length; end++) {
      while (sorted[end]!.ts - sorted[start]!.ts > windowSeconds) start++;
      const size = end - start + 1;
      if (size >= minCount && (!best || size > best.length)) {
        best = sorted.slice(start, end + 1);
      }
    }
    if (best) {
      sweeps.push({
        buyer: key.split("|")[0]!,
        count: best.length,
        totalEth: best.reduce((a, s) => a + s.priceEth, 0),
        firstTs: best[0]!.ts,
        lastTs: best[best.length - 1]!.ts,
      });
    }
  }
  return sweeps.sort((a, b) => b.totalEth - a.totalEth);
}
