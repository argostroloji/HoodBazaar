import {
  OpenSeaClient,
  detectSweeps,
  type CollectionStats,
  type Sale,
  type SweepEvent,
} from "@hoodbazaar/market";

export type SignalKind = "accumulation" | "distribution" | "neutral";

export interface CollectionSignal {
  collection: string;
  generatedAt: number;
  floorEth: number | null;
  floorChange24hPct: number | null;
  volume24hEth: number;
  sales24h: number;
  sweeps: SweepEvent[];
  signal: SignalKind;
  /** 0..1 — how strongly the inputs agree. */
  confidence: number;
  reasons: string[];
}

export interface ClassifyInputs {
  floorChange24hPct: number | null;
  sweepCount: number;
  sweepTotalEth: number;
  volume24hEth: number;
  sales24h: number;
}

/**
 * Pure classification core — deterministic and unit-testable.
 * Heuristic v1: sweeps + rising floor = accumulation; falling floor with
 * high sales = distribution; otherwise neutral.
 */
export function classify(i: ClassifyInputs): {
  signal: SignalKind;
  confidence: number;
  reasons: string[];
} {
  const reasons: string[] = [];
  let score = 0;

  if (i.sweepCount > 0) {
    score += Math.min(i.sweepCount, 3);
    reasons.push(`${i.sweepCount} sweep(s) detected (${i.sweepTotalEth.toFixed(2)} ETH)`);
  }
  if (i.floorChange24hPct != null) {
    if (i.floorChange24hPct >= 5) {
      score += 2;
      reasons.push(`floor up ${i.floorChange24hPct.toFixed(1)}% in 24h`);
    } else if (i.floorChange24hPct <= -5) {
      score -= 2;
      reasons.push(`floor down ${Math.abs(i.floorChange24hPct).toFixed(1)}% in 24h`);
    }
  }
  if (i.sales24h >= 20 && (i.floorChange24hPct ?? 0) < 0) {
    score -= 1;
    reasons.push(`heavy selling: ${i.sales24h} sales into a falling floor`);
  }
  if (i.volume24hEth === 0 && i.sales24h === 0) {
    reasons.push("no 24h activity");
  }

  const signal: SignalKind =
    score >= 2 ? "accumulation" : score <= -2 ? "distribution" : "neutral";
  const confidence = Math.min(Math.abs(score) / 5, 1);
  return { signal, confidence, reasons };
}

export function buildSignal(
  collection: string,
  stats: CollectionStats,
  recentSales: Sale[],
  now = Date.now(),
): CollectionSignal {
  const cutoff = Math.floor(now / 1000) - 24 * 3600;
  const daySales = recentSales.filter((s) => s.eventTimestamp >= cutoff);
  const sweeps = detectSweeps(daySales);
  const { signal, confidence, reasons } = classify({
    floorChange24hPct: stats.floorChange24hPct,
    sweepCount: sweeps.length,
    sweepTotalEth: sweeps.reduce((a, s) => a + s.totalEth, 0),
    volume24hEth: stats.volume24hEth,
    sales24h: stats.sales24h,
  });
  return {
    collection,
    generatedAt: now,
    floorEth: stats.floorPriceEth,
    floorChange24hPct: stats.floorChange24hPct,
    volume24hEth: stats.volume24hEth,
    sales24h: stats.sales24h,
    sweeps,
    signal,
    confidence,
    reasons,
  };
}

/** Live signal for one collection — the unit of value agents pay for. */
export async function computeSignal(
  os: OpenSeaClient,
  collection: string,
): Promise<CollectionSignal> {
  const [stats, sales] = await Promise.all([
    os.getCollectionStats(collection),
    os.getRecentSales(collection, 50),
  ]);
  return buildSignal(collection, stats, sales);
}
