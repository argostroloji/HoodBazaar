import type { Sale, SweepEvent } from "./types.js";

export interface SweepOptions {
  /** Minimum purchases by one buyer to count as a sweep. */
  minCount?: number;
  /** Time window in seconds. */
  windowSeconds?: number;
}

/**
 * Detect sweeps: the same buyer purchasing >= minCount items from one
 * collection within windowSeconds. Pure function over sales data so it is
 * trivially testable and reusable by the signals engine.
 */
export function detectSweeps(
  sales: Sale[],
  opts: SweepOptions = {},
): SweepEvent[] {
  const minCount = opts.minCount ?? 3;
  const windowSeconds = opts.windowSeconds ?? 600;

  // Group by buyer+contract, then slide over sorted timestamps.
  const groups = new Map<string, Sale[]>();
  for (const s of sales) {
    if (!s.buyer || !s.contractAddress) continue;
    const key = `${s.buyer.toLowerCase()}|${s.contractAddress.toLowerCase()}`;
    const arr = groups.get(key);
    if (arr) arr.push(s);
    else groups.set(key, [s]);
  }

  const sweeps: SweepEvent[] = [];
  for (const [key, group] of groups) {
    if (group.length < minCount) continue;
    const sorted = [...group].sort((a, b) => a.eventTimestamp - b.eventTimestamp);
    let start = 0;
    let best: Sale[] | null = null;
    for (let end = 0; end < sorted.length; end++) {
      while (
        sorted[end]!.eventTimestamp - sorted[start]!.eventTimestamp >
        windowSeconds
      ) {
        start++;
      }
      const size = end - start + 1;
      if (size >= minCount && (!best || size > best.length)) {
        best = sorted.slice(start, end + 1);
      }
    }
    if (best) {
      const [buyer, contractAddress] = key.split("|") as [string, string];
      sweeps.push({
        collectionSlug: null,
        contractAddress,
        buyer,
        count: best.length,
        totalEth: best.reduce((acc, s) => acc + s.priceEth, 0),
        windowSeconds,
        firstTimestamp: best[0]!.eventTimestamp,
        lastTimestamp: best[best.length - 1]!.eventTimestamp,
      });
    }
  }
  return sweeps.sort((a, b) => b.totalEth - a.totalEth);
}
