import "dotenv/config";
import { Bot, InlineKeyboard } from "grammy";
import { OpenSeaClient } from "@hoodbazaar/market";
import { parseCommand } from "./parse.js";
import {
  HELP_TEXT,
  formatFloor,
  formatPortfolio,
  formatTrending,
} from "./format.js";
import { WatchStore } from "./store.js";
import { startWatcher } from "./watcher.js";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OPENSEA_API_KEY = process.env.OPENSEA_API_KEY;
const API_URL = process.env.API_URL ?? "http://localhost:8787";
const MINIAPP_URL = process.env.MINIAPP_URL ?? "";

if (!BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN missing (see .env.example)");
if (!OPENSEA_API_KEY) throw new Error("OPENSEA_API_KEY missing (see .env.example)");

const bot = new Bot(BOT_TOKEN);
const os = new OpenSeaClient({ apiKey: OPENSEA_API_KEY });
const store = new WatchStore();

async function createTradeIntent(body: unknown): Promise<{ id: string; summary: string }> {
  const res = await fetch(`${API_URL}/v1/trade-intents`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<{ id: string; summary: string }>;
}

function signButton(intentId: string): InlineKeyboard {
  const url = `${MINIAPP_URL}?intent=${encodeURIComponent(intentId)}`;
  return new InlineKeyboard().webApp("✍️ Sign in Mini App", url);
}

bot.command(["start", "help"], (ctx) =>
  ctx.reply(HELP_TEXT, { parse_mode: "HTML", link_preview_options: { is_disabled: true } }),
);

bot.on("message:text", async (ctx) => {
  const cmd = parseCommand(ctx.message.text);
  if (!cmd) {
    return ctx.reply(
      "I didn't understand that. Send <code>help</code> for commands.",
      { parse_mode: "HTML" },
    );
  }

  try {
    switch (cmd.kind) {
      case "help":
        return await ctx.reply(HELP_TEXT, {
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
        });

      case "floor": {
        const [c, s] = await Promise.all([
          os.getCollection(cmd.collection),
          os.getCollectionStats(cmd.collection),
        ]);
        return await ctx.reply(formatFloor(c, s), {
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
        });
      }

      case "trending": {
        const top = await os.getTopCollections(10);
        const rows = await Promise.all(
          top.map(async (c) => ({ c, s: await os.getCollectionStats(c.slug) })),
        );
        return await ctx.reply(formatTrending(rows), {
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
        });
      }

      case "buy": {
        const intent = await createTradeIntent({
          type: "buy",
          collection: cmd.collection,
          count: cmd.count,
        });
        return await ctx.reply(intent.summary, {
          parse_mode: "HTML",
          reply_markup: signButton(intent.id),
        });
      }

      case "list": {
        const intent = await createTradeIntent({
          type: "list",
          collection: cmd.contractOrSlug,
          tokenId: cmd.tokenId,
          price: cmd.price,
        });
        return await ctx.reply(intent.summary, {
          parse_mode: "HTML",
          reply_markup: signButton(intent.id),
        });
      }

      case "watch": {
        const added = store.add(ctx.chat.id, cmd.collection);
        return await ctx.reply(
          added
            ? `👀 Watching <b>${cmd.collection}</b> — you'll get floor moves (±5%) and sweep alerts.`
            : `Already watching <b>${cmd.collection}</b>.`,
          { parse_mode: "HTML" },
        );
      }

      case "unwatch": {
        const removed = store.remove(ctx.chat.id, cmd.collection);
        return await ctx.reply(
          removed ? `Stopped watching ${cmd.collection}.` : `You weren't watching ${cmd.collection}.`,
        );
      }

      case "portfolio": {
        const holdings = await os.getHoldings(cmd.address);
        return await ctx.reply(formatPortfolio(cmd.address, holdings), {
          parse_mode: "HTML",
        });
      }
    }
  } catch (err) {
    console.error("command failed", cmd, err);
    return ctx.reply(
      "⚠️ Couldn't complete that — the collection may not exist on Robinhood Chain, or the data source is busy. Try again shortly.",
    );
  }
});

startWatcher(bot, store, os);

bot.start({
  onStart: (me) => console.log(`@${me.username} up. Non-custodial mode: ON`),
});
