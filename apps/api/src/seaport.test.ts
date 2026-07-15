import { test } from "node:test";
import assert from "node:assert/strict";
import { buildListingOrder, ethToWei, ItemType } from "./seaport.js";

const TREASURY = "0x1111111111111111111111111111111111111111" as const;
const SELLER = "0x2222222222222222222222222222222222222222" as const;
const NFT = "0x3333333333333333333333333333333333333333" as const;

test("listing order: 1% fee goes to treasury, remainder to seller", () => {
  const priceWei = ethToWei(1); // 1 ETH
  const { parameters } = buildListingOrder({
    offerer: SELLER,
    nftContract: NFT,
    tokenId: "42",
    priceWei,
    marketplaceFee: { recipient: TREASURY, basisPoints: 100 },
    counter: 0n,
    nowSeconds: 1_700_000_000,
  });

  assert.equal(parameters.offer.length, 1);
  assert.equal(parameters.offer[0]!.itemType, ItemType.ERC721);
  assert.equal(parameters.offer[0]!.identifierOrCriteria, "42");

  assert.equal(parameters.consideration.length, 2);
  const [sellerItem, feeItem] = parameters.consideration;
  assert.equal(sellerItem!.recipient, SELLER);
  assert.equal(feeItem!.recipient, TREASURY);
  assert.equal(BigInt(feeItem!.startAmount), priceWei / 100n);
  assert.equal(
    BigInt(sellerItem!.startAmount) + BigInt(feeItem!.startAmount),
    priceWei,
  );
  assert.equal(parameters.totalOriginalConsiderationItems, 2);
});

test("extra required fees are appended and conserve total", () => {
  const priceWei = ethToWei(2);
  const creator = "0x4444444444444444444444444444444444444444" as const;
  const { parameters } = buildListingOrder({
    offerer: SELLER,
    nftContract: NFT,
    tokenId: "1",
    priceWei,
    marketplaceFee: { recipient: TREASURY, basisPoints: 100 },
    extraFees: [{ recipient: creator, basisPoints: 250 }],
    counter: 3n,
  });
  const total = parameters.consideration.reduce(
    (a, c) => a + BigInt(c.startAmount),
    0n,
  );
  assert.equal(total, priceWei);
  assert.equal(parameters.consideration.length, 3);
});

test("rejects fee sums >= 100%", () => {
  assert.throws(() =>
    buildListingOrder({
      offerer: SELLER,
      nftContract: NFT,
      tokenId: "1",
      priceWei: ethToWei(1),
      marketplaceFee: { recipient: TREASURY, basisPoints: 10_000 },
      counter: 0n,
    }),
  );
});

test("zero-amount fee items are dropped", () => {
  const { parameters } = buildListingOrder({
    offerer: SELLER,
    nftContract: NFT,
    tokenId: "1",
    priceWei: 1n, // 1 wei — 1% rounds to 0
    marketplaceFee: { recipient: TREASURY, basisPoints: 100 },
    counter: 0n,
  });
  assert.equal(parameters.consideration.length, 1);
});
