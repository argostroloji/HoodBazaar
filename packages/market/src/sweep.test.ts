import { test } from "node:test";
import assert from "node:assert/strict";
import { detectSweeps } from "./sweep.js";
import type { Sale } from "./types.js";

const sale = (over: Partial<Sale>): Sale => ({
  eventTimestamp: 1000,
  contractAddress: "0xCollection",
  tokenId: "1",
  buyer: "0xBuyer",
  seller: "0xSeller",
  priceWei: 10n ** 18n,
  priceEth: 1,
  txHash: null,
  ...over,
});

test("detects a 3-buy sweep inside the window", () => {
  const sales = [
    sale({ tokenId: "1", eventTimestamp: 1000 }),
    sale({ tokenId: "2", eventTimestamp: 1100 }),
    sale({ tokenId: "3", eventTimestamp: 1500 }),
  ];
  const sweeps = detectSweeps(sales, { minCount: 3, windowSeconds: 600 });
  assert.equal(sweeps.length, 1);
  assert.equal(sweeps[0]!.count, 3);
  assert.equal(sweeps[0]!.totalEth, 3);
});

test("ignores purchases spread beyond the window", () => {
  const sales = [
    sale({ tokenId: "1", eventTimestamp: 1000 }),
    sale({ tokenId: "2", eventTimestamp: 2000 }),
    sale({ tokenId: "3", eventTimestamp: 3000 }),
  ];
  assert.equal(
    detectSweeps(sales, { minCount: 3, windowSeconds: 600 }).length,
    0,
  );
});

test("separates buyers and collections", () => {
  const sales = [
    sale({ buyer: "0xA", tokenId: "1" }),
    sale({ buyer: "0xB", tokenId: "2" }),
    sale({ buyer: "0xA", contractAddress: "0xOther", tokenId: "3" }),
  ];
  assert.equal(detectSweeps(sales, { minCount: 2 }).length, 0);
});

test("case-insensitive buyer/contract grouping", () => {
  const sales = [
    sale({ buyer: "0xAbC", eventTimestamp: 1000 }),
    sale({ buyer: "0xabc", eventTimestamp: 1001, tokenId: "2" }),
    sale({ buyer: "0xABC", eventTimestamp: 1002, tokenId: "3" }),
  ];
  const sweeps = detectSweeps(sales, { minCount: 3, windowSeconds: 60 });
  assert.equal(sweeps.length, 1);
});
