import { randomUUID } from "node:crypto";

export interface BuyIntent {
  id: string;
  type: "buy";
  collection: string;
  collectionName: string;
  count: number;
  /** Listings selected at intent-creation time (cheapest first). */
  listings: Array<{
    orderHash: string;
    protocolAddress: string;
    contractAddress: string;
    tokenId: string;
    priceWei: string;
    priceEth: number;
  }>;
  totalEth: number;
  createdAt: number;
}

export interface ListIntent {
  id: string;
  type: "list";
  collection: string;
  collectionName: string;
  nftContract: string;
  tokenId: string;
  priceEth: number;
  feeBps: number;
  feeRecipient: string;
  /** Unsigned Seaport order parameters — completed with counter at fetch time. */
  orderParameters: unknown;
  createdAt: number;
}

export type TradeIntent = BuyIntent | ListIntent;

const TTL_MS = 30 * 60 * 1000;

/** In-memory intent store with TTL. Intents are ephemeral prep data only. */
export class IntentStore {
  private readonly map = new Map<string, TradeIntent>();

  create<T extends Omit<BuyIntent, "id" | "createdAt"> | Omit<ListIntent, "id" | "createdAt">>(
    intent: T,
  ): TradeIntent {
    const full = {
      ...intent,
      id: randomUUID(),
      createdAt: Date.now(),
    } as TradeIntent;
    this.map.set(full.id, full);
    return full;
  }

  get(id: string): TradeIntent | null {
    const intent = this.map.get(id);
    if (!intent) return null;
    if (Date.now() - intent.createdAt > TTL_MS) {
      this.map.delete(id);
      return null;
    }
    return intent;
  }

  /** Periodic cleanup so the map doesn't grow unbounded. */
  startJanitor() {
    const t = setInterval(() => {
      const now = Date.now();
      for (const [id, i] of this.map) {
        if (now - i.createdAt > TTL_MS) this.map.delete(id);
      }
    }, 60_000);
    t.unref?.();
    return t;
  }
}
