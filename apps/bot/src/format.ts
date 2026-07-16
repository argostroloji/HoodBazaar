import type {
  Collection,
  CollectionStats,
  Listing,
  NftHolding,
  Sale,
  SweepEvent,
} from "@hoodbazaar/market";
import type { CollectionSignal } from "@hoodbazaar/signals";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function formatFloor(c: Collection, s: CollectionStats): string {
  const floor =
    s.floorPriceEth != null ? `${s.floorPriceEth} ETH` : "no listings";
  const change =
    s.floorChange24hPct != null
      ? ` (${s.floorChange24hPct >= 0 ? "+" : ""}${s.floorChange24hPct.toFixed(1)}% 24h)`
      : "";
  return [
    `<b>${esc(c.name)}</b>`,
    `Floor: <b>${floor}</b>${change}`,
    `24h volume: ${s.volume24hEth.toFixed(3)} ETH · ${s.sales24h} sales`,
    `Owners: ${s.numOwners} · Total volume: ${s.totalVolumeEth.toFixed(1)} ETH`,
    `<a href="${c.openseaUrl}">View on OpenSea</a>`,
  ].join("\n");
}

export function formatTrending(rows: Array<{ c: Collection; s: CollectionStats }>): string {
  if (rows.length === 0) return "No active collections found on Robinhood Chain yet.";
  const lines = rows.map(({ c, s }, i) => {
    const floor = s.floorPriceEth != null ? `${s.floorPriceEth} ETH` : "—";
    return `${i + 1}. <b>${esc(c.name)}</b> · floor ${floor} · ${s.volume24hEth.toFixed(2)} ETH 24h`;
  });
  return "<b>Trending on Robinhood Chain</b>\n" + lines.join("\n");
}

export function formatPortfolio(address: string, holdings: NftHolding[]): string {
  if (holdings.length === 0) return `No NFTs found for <code>${esc(address)}</code> on Robinhood Chain.`;
  const byCollection = new Map<string, NftHolding[]>();
  for (const h of holdings) {
    const key = h.collectionSlug ?? h.contractAddress;
    (byCollection.get(key) ?? byCollection.set(key, []).get(key)!).push(h);
  }
  const lines = [...byCollection.entries()].map(
    ([slug, items]) => `• <b>${esc(slug)}</b> — ${items.length} item${items.length > 1 ? "s" : ""}`,
  );
  return [
    `<b>Portfolio</b> <code>${esc(address)}</code>`,
    ...lines,
    `<i>Read-only view — no wallet connection needed.</i>`,
  ].join("\n");
}

export function formatSweepAlert(collection: string, sw: SweepEvent): string {
  return [
    `🧹 <b>Sweep detected</b> in <b>${esc(collection)}</b>`,
    `${sw.count} items bought by <code>${esc(sw.buyer)}</code>`,
    `Total: ${sw.totalEth.toFixed(3)} ETH in ${Math.round((sw.lastTimestamp - sw.firstTimestamp) / 60)} min`,
  ].join("\n");
}

export function formatFloorAlert(collection: string, from: number, to: number): string {
  const pct = ((to - from) / from) * 100;
  const arrow = pct >= 0 ? "📈" : "📉";
  return `${arrow} <b>${esc(collection)}</b> floor moved ${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%: ${from} → ${to} ETH`;
}

export function formatListings(c: Collection, listings: Listing[]): string {
  if (listings.length === 0) return `No active listings for <b>${esc(c.name)}</b>.`;
  const lines = listings.map(
    (l, i) => `${i + 1}. #${esc(l.tokenId)} — <b>${l.priceEth} ETH</b>`,
  );
  return [
    `<b>Cheapest listings · ${esc(c.name)}</b>`,
    ...lines,
    `<a href="${c.openseaUrl}">View on OpenSea</a>`,
  ].join("\n");
}

export function formatSales(c: Collection, sales: Sale[]): string {
  if (sales.length === 0) return `No recent sales for <b>${esc(c.name)}</b>.`;
  const lines = sales.slice(0, 10).map((s) => {
    const ago = Math.max(1, Math.round((Date.now() / 1000 - s.eventTimestamp) / 60));
    return `• #${esc(s.tokenId)} — ${s.priceEth} ETH <i>(${ago}m ago)</i>`;
  });
  return [`<b>Recent sales · ${esc(c.name)}</b>`, ...lines].join("\n");
}

export function formatSweeps(c: Collection, sweeps: SweepEvent[]): string {
  if (sweeps.length === 0) {
    return `No sweeps detected in <b>${esc(c.name)}</b> over the last 50 sales.`;
  }
  const lines = sweeps.slice(0, 3).map(
    (s) =>
      `🧹 <code>${esc(s.buyer.slice(0, 10))}…</code> bought <b>${s.count}</b> for ${s.totalEth.toFixed(3)} ETH in ${Math.max(1, Math.round((s.lastTimestamp - s.firstTimestamp) / 60))}m`,
  );
  return [`<b>Sweeps · ${esc(c.name)}</b>`, ...lines].join("\n");
}

export function formatSignal(sig: CollectionSignal): string {
  const icon =
    sig.signal === "accumulation" ? "🟢" : sig.signal === "distribution" ? "🔴" : "⚪";
  const lines = [
    `${icon} <b>${esc(sig.collection)}</b> — <b>${sig.signal.toUpperCase()}</b> (confidence ${(sig.confidence * 100).toFixed(0)}%)`,
    `Floor: ${sig.floorEth ?? "—"} ETH · 24h vol: ${sig.volume24hEth.toFixed(3)} ETH · ${sig.sales24h} sales`,
  ];
  if (sig.reasons.length > 0) {
    lines.push(...sig.reasons.map((r) => `• ${esc(r)}`));
  }
  lines.push(`<i>Heuristic signal — not financial advice.</i>`);
  return lines.join("\n");
}

export function formatWatchlist(collections: string[]): string {
  if (collections.length === 0) {
    return "Your watchlist is empty. Add one with <code>watch &lt;collection&gt;</code>.";
  }
  return [
    "<b>Your watchlist</b>",
    ...collections.map((c) => `👀 ${esc(c)}`),
    "<i>Alerts: floor moves ±5% and sweeps.</i>",
  ].join("\n");
}

export function formatGas(gasWei: bigint, blockNumber: bigint): string {
  const gwei = Number(gasWei) / 1e9;
  return [
    `⛽ <b>Robinhood Chain gas</b>: ${gwei.toFixed(4)} gwei`,
    `Block: ${blockNumber}`,
    `<i>A typical NFT buy costs well under $0.01 here.</i>`,
  ].join("\n");
}

export const HELP_TEXT = [
  "<b>HoodBazaar</b> — NFT market intelligence for Robinhood Chain.",
  "",
  "<code>floor &lt;collection&gt;</code> — floor, 24h change, volume",
  "<code>trending</code> — top collections by volume",
  "<code>signal &lt;collection&gt;</code> — accumulation/distribution read",
  "<code>sweeps &lt;collection&gt;</code> — recent bulk-buy activity",
  "<code>listings &lt;collection&gt;</code> — cheapest live listings",
  "<code>sales &lt;collection&gt;</code> — latest sales",
  "<code>buy &lt;n&gt; from &lt;collection&gt;</code> — prep a buy, sign in the Mini App",
  "<code>list my &lt;collection&gt; #&lt;id&gt; at &lt;price | floor+X%&gt;</code> — prep a listing",
  "<code>watch &lt;collection&gt;</code> — floor + sweep alerts",
  "<code>unwatch &lt;collection&gt;</code> — stop alerts",
  "<code>watchlist</code> — your active alerts",
  "<code>portfolio &lt;address&gt;</code> — read-only holdings",
  "<code>gas</code> — current network gas",
  "<code>mint</code> — mint a Trader Card 🎴 (dynamic on-chain NFT)",
  "",
  "🔐 Non-custodial by design: this bot never asks for keys or seed phrases and can never move your funds. All transactions are signed in your own wallet.",
].join("\n");
