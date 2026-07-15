import type {
  Collection,
  CollectionStats,
  NftHolding,
  SweepEvent,
} from "@hoodbazaar/market";

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

export const HELP_TEXT = [
  "<b>HoodBazaar</b> — NFT market intelligence for Robinhood Chain.",
  "",
  "<code>floor &lt;collection&gt;</code> — floor, 24h change, volume",
  "<code>trending</code> — top collections by volume",
  "<code>buy &lt;n&gt; from &lt;collection&gt;</code> — prep a buy, sign in the Mini App",
  "<code>list my &lt;collection&gt; #&lt;id&gt; at &lt;price | floor+X%&gt;</code> — prep a listing",
  "<code>watch &lt;collection&gt;</code> — floor + sweep alerts",
  "<code>unwatch &lt;collection&gt;</code> — stop alerts",
  "<code>portfolio &lt;address&gt;</code> — read-only holdings",
  "",
  "🔐 Non-custodial by design: this bot never asks for keys or seed phrases and can never move your funds. All transactions are signed in your own wallet.",
].join("\n");
