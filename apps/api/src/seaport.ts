import {
  createPublicClient,
  http,
  parseEther,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import {
  OPENSEA_CONDUIT_KEY,
  SEAPORT_ADDRESS,
  robinhoodChain,
} from "@hoodbazaar/market";
import { randomBytes } from "node:crypto";

/** Seaport ItemType enum (subset we use). */
export const ItemType = {
  NATIVE: 0,
  ERC20: 1,
  ERC721: 2,
} as const;

/** Seaport OrderType — FULL_OPEN: anyone can fulfill, no zone gating. */
export const ORDER_TYPE_FULL_OPEN = 0;

export interface FeeRecipient {
  recipient: Address;
  basisPoints: number;
}

export interface BuildListingArgs {
  offerer: Address;
  nftContract: Address;
  tokenId: string;
  priceWei: bigint;
  /** Our marketplace fee. */
  marketplaceFee: FeeRecipient;
  /** Required collection/creator fees from OpenSea collection data. */
  extraFees?: FeeRecipient[];
  counter: bigint;
  /** Listing duration in seconds (default 30 days). */
  durationSeconds?: number;
  nowSeconds?: number;
}

/**
 * Build unsigned Seaport 1.6 OrderComponents for an ERC-721 listing priced in
 * native ETH. The marketplace fee is a consideration item paid to the
 * treasury — no escrow contract, no custody. The user signs this EIP-712
 * struct in their own wallet (Mini App), never here.
 */
export function buildListingOrder(args: BuildListingArgs) {
  const now = args.nowSeconds ?? Math.floor(Date.now() / 1000);
  const duration = args.durationSeconds ?? 30 * 24 * 3600;

  const fees = [args.marketplaceFee, ...(args.extraFees ?? [])];
  const totalFeeBps = fees.reduce((a, f) => a + f.basisPoints, 0);
  if (totalFeeBps >= 10_000) throw new Error("fees exceed 100%");

  const feeItems = fees
    .map((f) => ({
      itemType: ItemType.NATIVE,
      token: "0x0000000000000000000000000000000000000000" as Address,
      identifierOrCriteria: "0",
      startAmount: ((args.priceWei * BigInt(f.basisPoints)) / 10_000n).toString(),
      endAmount: ((args.priceWei * BigInt(f.basisPoints)) / 10_000n).toString(),
      recipient: f.recipient,
    }))
    .filter((i) => i.startAmount !== "0");

  const feeTotal = feeItems.reduce((a, i) => a + BigInt(i.startAmount), 0n);
  const sellerAmount = args.priceWei - feeTotal;

  const parameters = {
    offerer: args.offerer,
    zone: "0x0000000000000000000000000000000000000000" as Address,
    offer: [
      {
        itemType: ItemType.ERC721,
        token: args.nftContract,
        identifierOrCriteria: args.tokenId,
        startAmount: "1",
        endAmount: "1",
      },
    ],
    consideration: [
      {
        itemType: ItemType.NATIVE,
        token: "0x0000000000000000000000000000000000000000" as Address,
        identifierOrCriteria: "0",
        startAmount: sellerAmount.toString(),
        endAmount: sellerAmount.toString(),
        recipient: args.offerer,
      },
      ...feeItems,
    ],
    orderType: ORDER_TYPE_FULL_OPEN,
    startTime: String(now),
    endTime: String(now + duration),
    zoneHash:
      "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex,
    salt: ("0x" + randomBytes(32).toString("hex")) as Hex,
    conduitKey: OPENSEA_CONDUIT_KEY,
    totalOriginalConsiderationItems: 1 + feeItems.length,
  };

  return { parameters, counter: args.counter.toString() };
}

/** EIP-712 domain + types for signing Seaport OrderComponents client-side. */
export function seaportEip712(chainId: number) {
  return {
    domain: {
      name: "Seaport",
      version: "1.6",
      chainId,
      verifyingContract: SEAPORT_ADDRESS as Address,
    },
    types: {
      OrderComponents: [
        { name: "offerer", type: "address" },
        { name: "zone", type: "address" },
        { name: "offer", type: "OfferItem[]" },
        { name: "consideration", type: "ConsiderationItem[]" },
        { name: "orderType", type: "uint8" },
        { name: "startTime", type: "uint256" },
        { name: "endTime", type: "uint256" },
        { name: "zoneHash", type: "bytes32" },
        { name: "salt", type: "uint256" },
        { name: "conduitKey", type: "bytes32" },
        { name: "counter", type: "uint256" },
      ],
      OfferItem: [
        { name: "itemType", type: "uint8" },
        { name: "token", type: "address" },
        { name: "identifierOrCriteria", type: "uint256" },
        { name: "startAmount", type: "uint256" },
        { name: "endAmount", type: "uint256" },
      ],
      ConsiderationItem: [
        { name: "itemType", type: "uint8" },
        { name: "token", type: "address" },
        { name: "identifierOrCriteria", type: "uint256" },
        { name: "startAmount", type: "uint256" },
        { name: "endAmount", type: "uint256" },
        { name: "recipient", type: "address" },
      ],
    },
    primaryType: "OrderComponents" as const,
  };
}

const seaportCounterAbi = [
  {
    name: "getCounter",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "offerer", type: "address" }],
    outputs: [{ name: "counter", type: "uint256" }],
  },
] as const;

export function makeRpcClient(rpcUrl?: string): PublicClient {
  return createPublicClient({
    chain: robinhoodChain,
    transport: http(rpcUrl ?? robinhoodChain.rpcUrls.default.http[0]),
  }) as PublicClient;
}

export async function getSeaportCounter(
  client: PublicClient,
  offerer: Address,
): Promise<bigint> {
  return client.readContract({
    address: SEAPORT_ADDRESS,
    abi: seaportCounterAbi,
    functionName: "getCounter",
    args: [offerer],
  });
}

export const ethToWei = (eth: number): bigint => parseEther(eth.toString());
