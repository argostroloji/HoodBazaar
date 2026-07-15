import { formatEther } from "viem";
import { OPENSEA_API_BASE, OPENSEA_CHAIN } from "./constants.js";
import type {
  Collection,
  CollectionStats,
  Listing,
  NftHolding,
  Sale,
} from "./types.js";

export interface OpenSeaClientOptions {
  apiKey: string;
  /** Override for tests. */
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

/**
 * Thin OpenSea API v2 client scoped to Robinhood Chain.
 * The API key must only ever live server-side (bot/api processes).
 */
export class OpenSeaClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: OpenSeaClientOptions) {
    if (!opts.apiKey) throw new Error("OPENSEA_API_KEY is required");
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl ?? OPENSEA_API_BASE;
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  private async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
    const res = await this.fetchFn(url.toString(), {
      headers: { accept: "application/json", "x-api-key": this.apiKey },
    });
    if (res.status === 429) {
      // One respectful retry after the advertised delay.
      const retryAfter = Number(res.headers.get("retry-after") ?? "2");
      await new Promise((r) => setTimeout(r, Math.min(retryAfter, 10) * 1000));
      const retry = await this.fetchFn(url.toString(), {
        headers: { accept: "application/json", "x-api-key": this.apiKey },
      });
      if (!retry.ok) throw new Error(`OpenSea ${path} failed: ${retry.status}`);
      return (await retry.json()) as T;
    }
    if (!res.ok) {
      throw new Error(`OpenSea ${path} failed: ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as T;
  }

  async getCollection(slug: string): Promise<Collection> {
    const c = await this.get<any>(`/collections/${slug}`);
    return {
      slug: c.collection,
      name: c.name ?? c.collection,
      contractAddress: c.contracts?.[0]?.address ?? null,
      imageUrl: c.image_url ?? null,
      openseaUrl: c.opensea_url ?? `https://opensea.io/collection/${slug}`,
    };
  }

  async getCollectionStats(slug: string): Promise<CollectionStats> {
    const s = await this.get<any>(`/collections/${slug}/stats`);
    const day = (s.intervals ?? []).find((i: any) => i.interval === "one_day");
    const floor = s.total?.floor_price ?? null;
    return {
      floorPriceEth: typeof floor === "number" ? floor : null,
      floorChange24hPct:
        typeof day?.price_change === "number" ? day.price_change * 100 : null,
      volume24hEth: day?.volume ?? 0,
      sales24h: day?.sales ?? 0,
      totalVolumeEth: s.total?.volume ?? 0,
      numOwners: s.total?.num_owners ?? 0,
    };
  }

  /** Top Robinhood Chain collections. OpenSea v2 sorts by 1d/7d volume. */
  async getTopCollections(limit = 10): Promise<Collection[]> {
    const r = await this.get<any>(`/collections`, {
      chain: OPENSEA_CHAIN,
      order_by: "one_day_volume",
      limit: String(limit),
    });
    return (r.collections ?? []).map((c: any) => ({
      slug: c.collection,
      name: c.name ?? c.collection,
      contractAddress: c.contracts?.[0]?.address ?? null,
      imageUrl: c.image_url ?? null,
      openseaUrl: c.opensea_url ?? `https://opensea.io/collection/${c.collection}`,
    }));
  }

  /** Cheapest active listings for a collection (ascending price). */
  async getBestListings(slug: string, limit = 10): Promise<Listing[]> {
    const r = await this.get<any>(`/listings/collection/${slug}/best`, {
      limit: String(limit),
    });
    return (r.listings ?? []).map((l: any) => {
      const wei = BigInt(l.price?.current?.value ?? "0");
      const offer = l.protocol_data?.parameters?.offer?.[0];
      return {
        orderHash: l.order_hash,
        chain: l.chain,
        contractAddress: offer?.token ?? "",
        tokenId: offer?.identifierOrCriteria ?? "",
        priceWei: wei,
        priceEth: Number(formatEther(wei)),
        currency: l.price?.current?.currency ?? "ETH",
        protocolData: l.protocol_data,
        protocolAddress: l.protocol_address,
      } satisfies Listing;
    });
  }

  /** Recent sales for a collection, newest first. */
  async getRecentSales(slug: string, limit = 50): Promise<Sale[]> {
    const r = await this.get<any>(`/events/collection/${slug}`, {
      event_type: "sale",
      limit: String(limit),
    });
    return (r.asset_events ?? [])
      .filter((e: any) => e.event_type === "sale")
      .map((e: any) => {
        const wei = BigInt(e.payment?.quantity ?? "0");
        return {
          eventTimestamp: e.event_timestamp,
          contractAddress: e.nft?.contract ?? "",
          tokenId: e.nft?.identifier ?? "",
          buyer: e.buyer ?? "",
          seller: e.seller ?? "",
          priceWei: wei,
          priceEth: Number(formatEther(wei)),
          txHash: e.transaction ?? null,
        } satisfies Sale;
      });
  }

  /** Read-only holdings for any address on Robinhood Chain. */
  async getHoldings(address: string, limit = 50): Promise<NftHolding[]> {
    const r = await this.get<any>(
      `/chain/${OPENSEA_CHAIN}/account/${address}/nfts`,
      { limit: String(limit) },
    );
    return (r.nfts ?? []).map((n: any) => ({
      contractAddress: n.contract,
      tokenId: n.identifier,
      name: n.name ?? null,
      collectionSlug: n.collection ?? null,
      imageUrl: n.image_url ?? null,
    }));
  }

  /** Collection fee schedule (creator/marketplace fees OpenSea reports). */
  async getCollectionFees(
    slug: string,
  ): Promise<Array<{ recipient: string; basisPoints: number; required: boolean }>> {
    const c = await this.get<any>(`/collections/${slug}`);
    return (c.fees ?? []).map((f: any) => ({
      recipient: f.recipient,
      basisPoints: Math.round((f.fee ?? 0) * 100),
      required: Boolean(f.required),
    }));
  }

  /**
   * Publish a SIGNED listing to the OpenSea orderbook. The signature is
   * produced by the user's wallet in the Mini App — this method only relays.
   */
  async postListing(body: {
    parameters: unknown;
    signature: string;
    protocol_address: string;
  }): Promise<unknown> {
    const res = await this.fetchFn(
      `${this.baseUrl}/orders/${OPENSEA_CHAIN}/seaport/listings`,
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-api-key": this.apiKey,
        },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      throw new Error(`postListing failed: ${res.status} ${await res.text()}`);
    }
    return res.json();
  }

  /**
   * Fulfillment data for buying a specific listing — returns the exact
   * Seaport call the BUYER signs client-side. Backend never signs anything.
   */
  async getFulfillmentData(orderHash: string, fulfillerAddress: string, protocolAddress: string) {
    const url = new URL(this.baseUrl + "/listings/fulfillment_data");
    const res = await this.fetchFn(url.toString(), {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-api-key": this.apiKey,
      },
      body: JSON.stringify({
        listing: { hash: orderHash, chain: OPENSEA_CHAIN, protocol_address: protocolAddress },
        fulfiller: { address: fulfillerAddress },
      }),
    });
    if (!res.ok) {
      throw new Error(`fulfillment_data failed: ${res.status} ${await res.text()}`);
    }
    return res.json();
  }
}
