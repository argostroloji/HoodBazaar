import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
// Load the monorepo root .env first, then any local override
loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });
loadEnv();
import { Bot, InlineKeyboard } from "grammy";
import { createPublicClient, http } from "viem";
import { OpenSeaClient, detectSweeps, robinhoodChain } from "@hoodbazaar/market";
import { computeSignal } from "@hoodbazaar/signals";
import { parseCommand } from "./parse.js";
import {
  HELP_TEXT,
  formatFloor,
  formatGas,
  formatListings,
  formatPortfolio,
  formatSales,
  formatSignal,
  formatSweeps,
  formatTrending,
  formatWatchlist,
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
const rpc = createPublicClient({
  chain: robinhoodChain,
  transport: http(process.env.ROBINHOOD_RPC_URL ?? robinhoodChain.rpcUrls.default.http[0]),
});

/** Trader Cards — verified on Robinhood Chain. */
const TRADER_CARDS = (process.env.TRADER_CARDS_ADDRESS ??
  "0xae027A57D3Bc2b481bFa3113996bA08b8bEB7cD2") as `0x${string}`;
const traderCardsAbi = [
  { name: "mintPrice", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "maxSupply", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "totalSupply", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "currentTier", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

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

/** Usage hints when someone sends a bare command without arguments. */
const USAGE: Record<string, string> = {
  floor: "Usage: <code>floor ascii cats robinhood</code>",
  signal: "Usage: <code>signal ascii cats robinhood</code>",
  sweeps: "Usage: <code>sweeps ascii cats robinhood</code>",
  listings: "Usage: <code>listings ascii cats robinhood</code>",
  sales: "Usage: <code>sales ascii cats robinhood</code>",
  buy: "Usage: <code>buy 2 from ascii cats robinhood</code>",
  list: "Usage: <code>list my ascii-cats-robinhood #42 at floor+10%</code>",
  watch: "Usage: <code>watch ascii-cats-robinhood</code>",
  unwatch: "Usage: <code>unwatch ascii-cats-robinhood</code>",
  portfolio: "Usage: <code>portfolio 0xYourAddress</code>",
};

bot.command(["start", "help"], (ctx) =>
  ctx.reply(HELP_TEXT, { parse_mode: "HTML", link_preview_options: { is_disabled: true } }),
);

bot.on("message:text", async (ctx) => {
  const bare = ctx.message.text.trim().replace(/^\//, "").toLowerCase();
  const cmd = parseCommand(ctx.message.text);
  if (!cmd) {
    const usage = USAGE[bare];
    return ctx.reply(
      usage ?? "I didn't understand that. Send <code>help</code> for commands.",
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

      case "listings": {
        const [c, listings] = await Promise.all([
          os.getCollection(cmd.collection),
          os.getBestListings(cmd.collection, 10),
        ]);
        return await ctx.reply(formatListings(c, listings), {
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
        });
      }

      case "sales": {
        const [c, sales] = await Promise.all([
          os.getCollection(cmd.collection),
          os.getRecentSales(cmd.collection, 10),
        ]);
        return await ctx.reply(formatSales(c, sales), { parse_mode: "HTML" });
      }

      case "sweeps": {
        const [c, sales] = await Promise.all([
          os.getCollection(cmd.collection),
          os.getRecentSales(cmd.collection, 50),
        ]);
        const sweeps = detectSweeps(sales, { minCount: 3, windowSeconds: 1800 });
        return await ctx.reply(formatSweeps(c, sweeps), { parse_mode: "HTML" });
      }

      case "signal": {
        const sig = await computeSignal(os, cmd.collection);
        return await ctx.reply(formatSignal(sig), { parse_mode: "HTML" });
      }

      case "watchlist": {
        return await ctx.reply(formatWatchlist(store.byChat(ctx.chat.id)), {
          parse_mode: "HTML",
        });
      }

      case "gas": {
        const [gasPrice, blockNumber] = await Promise.all([
          rpc.getGasPrice(),
          rpc.getBlockNumber(),
        ]);
        return await ctx.reply(formatGas(gasPrice, blockNumber), {
          parse_mode: "HTML",
        });
      }

      case "mint": {
        const [tier, minted, max, priceWei] = await Promise.all([
          rpc.readContract({ address: TRADER_CARDS, abi: traderCardsAbi, functionName: "currentTier" }),
          rpc.readContract({ address: TRADER_CARDS, abi: traderCardsAbi, functionName: "totalSupply" }),
          rpc.readContract({ address: TRADER_CARDS, abi: traderCardsAbi, functionName: "maxSupply" }),
          rpc.readContract({ address: TRADER_CARDS, abi: traderCardsAbi, functionName: "mintPrice" }),
        ]);
        const face = tier === "Bull" ? "📈" : tier === "Bear" ? "📉" : tier === "Crab" ? "🦀" : "❔";
        const text = [
          `🎴 <b>Trader Cards</b> — dynamic NFT on Robinhood Chain`,
          `Art follows the market via a Chainlink ETH/USD feed.`,
          ``,
          `Market now: <b>${tier}</b> ${face}`,
          `Minted: <b>${minted} / ${max}</b>`,
          `Price: <b>${Number(priceWei) / 1e18} ETH</b> + gas`,
          ``,
          `Fully on-chain art · <a href="https://robinhoodchain.blockscout.com/address/${TRADER_CARDS}">verified contract</a>`,
        ].join("\n");
        const kb = new InlineKeyboard().webApp(
          "🎴 Mint in Mini App",
          `${MINIAPP_URL}?mint=1`,
        );
        return await ctx.reply(text, {
          parse_mode: "HTML",
          reply_markup: kb,
          link_preview_options: { is_disabled: true },
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

/** Register the command list so it shows in the "/" menu and bot profile. */
await bot.api.setMyCommands([
  { command: "trending", description: "Top Robinhood Chain collections by volume" },
  { command: "floor", description: "floor <collection> — floor price + 24h stats" },
  { command: "signal", description: "signal <collection> — accumulation/distribution read" },
  { command: "sweeps", description: "sweeps <collection> — recent bulk-buy activity" },
  { command: "listings", description: "listings <collection> — cheapest live listings" },
  { command: "sales", description: "sales <collection> — latest sales" },
  { command: "buy", description: "buy <n> from <collection> — sign in Mini App" },
  { command: "list", description: "list my <collection> #<id> at <price|floor+X%>" },
  { command: "watch", description: "watch <collection> — floor & sweep alerts" },
  { command: "unwatch", description: "unwatch <collection> — stop alerts" },
  { command: "watchlist", description: "Your active alert subscriptions" },
  { command: "portfolio", description: "portfolio <address> — read-only holdings" },
  { command: "gas", description: "Current Robinhood Chain gas price" },
  { command: "mint", description: "Mint a Trader Card — dynamic on-chain NFT" },
  { command: "help", description: "How HoodBazaar works" },
]);
/** Keep the input-field menu button as the command list, not a webapp. */
await bot.api.setChatMenuButton({ menu_button: { type: "commands" } });

bot.start({
  onStart: (me) => console.log(`@${me.username} up. Non-custodial mode: ON`),
});
