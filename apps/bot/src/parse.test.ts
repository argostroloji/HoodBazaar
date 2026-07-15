import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCommand } from "./parse.js";

test("floor command", () => {
  assert.deepEqual(parseCommand("floor Trader Cards"), {
    kind: "floor",
    collection: "trader-cards",
  });
});

test("trending", () => {
  assert.deepEqual(parseCommand("trending"), { kind: "trending" });
});

test("buy command", () => {
  assert.deepEqual(parseCommand("buy 3 from trader cards"), {
    kind: "buy",
    count: 3,
    collection: "trader-cards",
  });
});

test("buy rejects absurd counts", () => {
  assert.equal(parseCommand("buy 999 from x"), null);
});

test("list at absolute price", () => {
  assert.deepEqual(parseCommand("list my trader-cards #42 at 1.5 eth"), {
    kind: "list",
    contractOrSlug: "trader-cards",
    tokenId: "42",
    price: { type: "absolute", eth: 1.5 },
  });
});

test("list at floor+10%", () => {
  assert.deepEqual(parseCommand("list my trader-cards #42 at floor+10%"), {
    kind: "list",
    contractOrSlug: "trader-cards",
    tokenId: "42",
    price: { type: "floorPct", pct: 10 },
  });
});

test("portfolio requires a valid address", () => {
  assert.equal(parseCommand("portfolio not-an-address"), null);
  assert.deepEqual(
    parseCommand("portfolio 0x1111111111111111111111111111111111111111"),
    {
      kind: "portfolio",
      address: "0x1111111111111111111111111111111111111111",
    },
  );
});
