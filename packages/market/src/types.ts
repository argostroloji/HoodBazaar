import { z } from "zod";

export const CollectionStatsSchema = z.object({
  floorPriceEth: z.number().nullable(),
  floorChange24hPct: z.number().nullable(),
  volume24hEth: z.number(),
  sales24h: z.number(),
  totalVolumeEth: z.number(),
  numOwners: z.number(),
});
export type CollectionStats = z.infer<typeof CollectionStatsSchema>;

export const CollectionSchema = z.object({
  slug: z.string(),
  name: z.string(),
  contractAddress: z.string().nullable(),
  imageUrl: z.string().nullable(),
  openseaUrl: z.string(),
});
export type Collection = z.infer<typeof CollectionSchema>;

export const ListingSchema = z.object({
  orderHash: z.string(),
  chain: z.string(),
  contractAddress: z.string(),
  tokenId: z.string(),
  priceWei: z.bigint(),
  priceEth: z.number(),
  currency: z.string(),
  /** Raw Seaport protocol_data from OpenSea — passed through for fulfillment. */
  protocolData: z.unknown(),
  protocolAddress: z.string(),
});
export type Listing = z.infer<typeof ListingSchema>;

export const SaleSchema = z.object({
  eventTimestamp: z.number(),
  contractAddress: z.string(),
  tokenId: z.string(),
  buyer: z.string(),
  seller: z.string(),
  priceWei: z.bigint(),
  priceEth: z.number(),
  txHash: z.string().nullable(),
});
export type Sale = z.infer<typeof SaleSchema>;

export const NftHoldingSchema = z.object({
  contractAddress: z.string(),
  tokenId: z.string(),
  name: z.string().nullable(),
  collectionSlug: z.string().nullable(),
  imageUrl: z.string().nullable(),
});
export type NftHolding = z.infer<typeof NftHoldingSchema>;

export interface SweepEvent {
  collectionSlug: string | null;
  contractAddress: string;
  buyer: string;
  count: number;
  totalEth: number;
  windowSeconds: number;
  firstTimestamp: number;
  lastTimestamp: number;
}
