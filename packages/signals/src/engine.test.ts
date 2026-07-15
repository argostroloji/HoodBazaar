import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSignal, classify } from "./engine.js";
import type { CollectionStats, Sale } from "@hoodbazaar/market";

test("sweeps + rising floor → accumulation", () => {
  const r = classify({
    floorChange24hPct: 8,
    sweepCount: 2,
    sweepTotalEth: 5,
    volume24hEth: 10,
    sales24h: 15,
  });
  assert.equal(r.signal, "accumulation");
  assert.ok(r.confidence > 0.5);
  assert.ok(r.reasons.length >= 2);
});

test("falling floor + heavy selling → distribution", () => {
  const r = classify({
    floorChange24hPct: -12,
    sweepCount: 0,
    sweepTotalEth: 0,
    volume24hEth: 4,
    sales24h: 40,
  });
  assert.equal(r.signal, "distribution");
});

test("quiet market → neutral with low confidence", () => {
  const r = classify({
    floorChange24hPct: 0.5,
    sweepCount: 0,
    sweepTotalEth: 0,
    volume24hEth: 0.2,
    sales24h: 2,
  });
  assert.equal(r.signal, "neutral");
  assert.ok(r.confidence < 0.5);
});

test("buildSignal filters sales outside 24h and detects sweeps", () => {
  const nowMs = 1_700_000_000_000;
  const nowSec = nowMs / 1000;
  const stats: CollectionStats = {
    floorPriceEth: 1,
    floorChange24hPct: 6,
    volume24hEth: 12,
    sales24h: 10,
    totalVolumeEth: 100,
    numOwners: 50,
  };
  const mkSale = (ts: number, tokenId: string): Sale => ({
    eventTimestamp: ts,
    contractAddress: "0xC",
    tokenId,
    buyer: "0xB",
    seller: "0xS",
    priceWei: 10n ** 18n,
    priceEth: 1,
    txHash: null,
  });
  const sales = [
    mkSale(nowSec - 100, "1"),
    mkSale(nowSec - 200, "2"),
    mkSale(nowSec - 300, "3"),
    // stale — 2 days old, must be ignored
    mkSale(nowSec - 2 * 86400, "4"),
  ];
  const sig = buildSignal("test-collection", stats, sales, nowMs);
  assert.equal(sig.sweeps.length, 1);
  assert.equal(sig.sweeps[0]!.count, 3);
  assert.equal(sig.signal, "accumulation");
});
