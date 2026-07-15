import type { Bot } from "grammy";
import { OpenSeaClient, detectSweeps } from "@hoodbazaar/market";
import type { WatchStore } from "./store.js";
import { formatFloorAlert, formatSweepAlert } from "./format.js";

const FLOOR_ALERT_THRESHOLD_PCT = 5;
const POLL_INTERVAL_MS = 60_000;

/** Polls OpenSea for watched collections and pushes alerts. */
export function startWatcher(bot: Bot, store: WatchStore, os: OpenSeaClient) {
  let running = false;

  async function tick() {
    if (running) return; // skip overlapping ticks
    running = true;
    try {
      // De-dupe collections across subscribers so we hit the API once each.
      const collections = [...new Set(store.all().map((s) => s.collection))];
      for (const collection of collections) {
        try {
          const [stats, sales] = await Promise.all([
            os.getCollectionStats(collection),
            os.getRecentSales(collection, 50),
          ]);
          const subs = store.all().filter((s) => s.collection === collection);
          for (const sub of subs) {
            // Floor movement
            if (stats.floorPriceEth != null) {
              if (
                sub.lastFloorEth != null &&
                sub.lastFloorEth > 0 &&
                Math.abs(
                  ((stats.floorPriceEth - sub.lastFloorEth) / sub.lastFloorEth) *
                    100,
                ) >= FLOOR_ALERT_THRESHOLD_PCT
              ) {
                await bot.api.sendMessage(
                  sub.chatId,
                  formatFloorAlert(collection, sub.lastFloorEth, stats.floorPriceEth),
                  { parse_mode: "HTML" },
                );
              }
              sub.lastFloorEth = stats.floorPriceEth;
            }
            // Sweeps among sales newer than the last processed timestamp
            const fresh = sales.filter(
              (s) => s.eventTimestamp > sub.lastSaleTimestamp,
            );
            for (const sweep of detectSweeps(fresh)) {
              await bot.api.sendMessage(
                sub.chatId,
                formatSweepAlert(collection, sweep),
                { parse_mode: "HTML" },
              );
            }
            if (sales.length > 0) {
              sub.lastSaleTimestamp = Math.max(
                sub.lastSaleTimestamp,
                ...sales.map((s) => s.eventTimestamp),
              );
            }
            store.update(sub);
          }
        } catch (err) {
          console.error(`watcher: ${collection} failed`, err);
        }
      }
    } finally {
      running = false;
    }
  }

  const timer = setInterval(tick, POLL_INTERVAL_MS);
  return () => clearInterval(timer);
}
