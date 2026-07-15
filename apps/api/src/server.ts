import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import { OpenSeaClient, robinhoodChain } from "@hoodbazaar/market";
import { IntentStore } from "./intents.js";
import {
  buildListingOrder,
  ethToWei,
  getSeaportCounter,
  makeRpcClient,
  seaportEip712,
} from "./seaport.js";
import type { Address } from "viem";

const OPENSEA_API_KEY = process.env.OPENSEA_API_KEY;
if (!OPENSEA_API_KEY) throw new Error("OPENSEA_API_KEY missing (see .env.example)");

const TREASURY = (process.env.TREASURY_ADDRESS ?? "") as Address;
if (!/^0x[a-fA-F0-9]{40}$/.test(TREASURY)) {
  throw new Error("TREASURY_ADDRESS must be a valid address (see .env.example)");
}
const FEE_BPS = Number(process.env.MARKETPLACE_FEE_BPS ?? "100");
const PORT = Number(process.env.API_PORT ?? "8787");

const os = new OpenSeaClient({ apiKey: OPENSEA_API_KEY });
const rpc = makeRpcClient(process.env.ROBINHOOD_RPC_URL);
const intents = new IntentStore();
intents.startJanitor();

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });
await app.register(rateLimit, { max: 60, timeWindow: "1 minute" });

const AddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

const CreateIntentSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("buy"),
    collection: z.string().min(1).max(100),
    count: z.number().int().min(1).max(20),
  }),
  z.object({
    type: z.literal("list"),
    collection: z.string().min(1).max(100),
    tokenId: z.string().regex(/^\d+$/),
    price: z.discriminatedUnion("type", [
      z.object({ type: z.literal("absolute"), eth: z.number().positive().max(10_000) }),
      z.object({ type: z.literal("floorPct"), pct: z.number().min(-50).max(500) }),
    ]),
  }),
]);

app.post("/v1/trade-intents", async (req, reply) => {
  const parsed = CreateIntentSchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: parsed.error.flatten() });
  }
  const body = parsed.data;

  if (body.type === "buy") {
    const [collection, listings] = await Promise.all([
      os.getCollection(body.collection),
      os.getBestListings(body.collection, body.count),
    ]);
    if (listings.length === 0) {
      return reply.code(404).send({ error: "No active listings for this collection" });
    }
    const chosen = listings.slice(0, body.count);
    const totalEth = chosen.reduce((a, l) => a + l.priceEth, 0);
    const intent = intents.create({
      type: "buy",
      collection: body.collection,
      collectionName: collection.name,
      count: chosen.length,
      listings: chosen.map((l) => ({
        orderHash: l.orderHash,
        protocolAddress: l.protocolAddress,
        contractAddress: l.contractAddress,
        tokenId: l.tokenId,
        priceWei: l.priceWei.toString(),
        priceEth: l.priceEth,
      })),
      totalEth,
    });
    const summary = [
      `🛒 <b>Buy ${chosen.length}× ${collection.name}</b>`,
      ...chosen.map((l) => `• #${l.tokenId} — ${l.priceEth} ETH`),
      `Total: <b>${totalEth.toFixed(4)} ETH</b> + gas`,
      `Tap below to review &amp; sign in your own wallet.`,
    ].join("\n");
    return { id: intent.id, summary };
  }

  // list
  const collection = await os.getCollection(body.collection);
  if (!collection.contractAddress) {
    return reply.code(404).send({ error: "Collection contract not found" });
  }
  let priceEth: number;
  if (body.price.type === "absolute") {
    priceEth = body.price.eth;
  } else {
    const stats = await os.getCollectionStats(body.collection);
    if (stats.floorPriceEth == null) {
      return reply.code(400).send({ error: "No floor price available — use an absolute price" });
    }
    priceEth = stats.floorPriceEth * (1 + body.price.pct / 100);
  }
  priceEth = Math.round(priceEth * 1e6) / 1e6;

  const intent = intents.create({
    type: "list",
    collection: body.collection,
    collectionName: collection.name,
    nftContract: collection.contractAddress,
    tokenId: body.tokenId,
    priceEth,
    feeBps: FEE_BPS,
    feeRecipient: TREASURY,
    orderParameters: null,
  });
  const feeEth = (priceEth * FEE_BPS) / 10_000;
  const summary = [
    `🏷️ <b>List ${collection.name} #${body.tokenId}</b>`,
    `Price: <b>${priceEth} ETH</b>`,
    `Marketplace fee (${FEE_BPS / 100}%): ${feeEth.toFixed(6)} ETH → you receive ${(priceEth - feeEth).toFixed(6)} ETH`,
    `Tap below to review &amp; sign in your own wallet.`,
  ].join("\n");
  return { id: intent.id, summary };
});

app.get("/v1/trade-intents/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  const intent = intents.get(id);
  if (!intent) return reply.code(404).send({ error: "Intent not found or expired" });
  return { intent, chainId: robinhoodChain.id };
});

/**
 * Buyer-side: exact Seaport transaction(s) for the connected wallet to sign.
 * Backend never signs — it relays OpenSea fulfillment data for the fulfiller.
 */
const FulfillSchema = z.object({ address: AddressSchema });
app.post("/v1/trade-intents/:id/fulfillment", async (req, reply) => {
  const { id } = req.params as { id: string };
  const intent = intents.get(id);
  if (!intent || intent.type !== "buy") {
    return reply.code(404).send({ error: "Buy intent not found or expired" });
  }
  const parsed = FulfillSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

  const transactions = [];
  for (const l of intent.listings) {
    const fd: any = await os.getFulfillmentData(
      l.orderHash,
      parsed.data.address,
      l.protocolAddress,
    );
    const tx = fd?.fulfillment_data?.transaction;
    if (!tx) return reply.code(502).send({ error: `No fulfillment data for ${l.orderHash} — listing may be gone` });
    transactions.push({
      tokenId: l.tokenId,
      priceEth: l.priceEth,
      to: tx.to,
      value: String(tx.value ?? "0"),
      inputData: tx.input_data,
      functionName: tx.function,
    });
  }
  return { chainId: robinhoodChain.id, transactions };
});

/**
 * Seller-side: unsigned OrderComponents + EIP-712 payload for the seller
 * address. Counter is read on-chain at request time.
 */
const OrderParamsSchema = z.object({ address: AddressSchema });
app.post("/v1/trade-intents/:id/order-parameters", async (req, reply) => {
  const { id } = req.params as { id: string };
  const intent = intents.get(id);
  if (!intent || intent.type !== "list") {
    return reply.code(404).send({ error: "List intent not found or expired" });
  }
  const parsed = OrderParamsSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

  const offerer = parsed.data.address as Address;
  const [counter, collectionFees] = await Promise.all([
    getSeaportCounter(rpc, offerer),
    os.getCollectionFees(intent.collection).catch(() => []),
  ]);
  const required = collectionFees
    .filter((f) => f.required && f.recipient.toLowerCase() !== TREASURY.toLowerCase())
    .map((f) => ({ recipient: f.recipient as Address, basisPoints: f.basisPoints }));

  const order = buildListingOrder({
    offerer,
    nftContract: intent.nftContract as Address,
    tokenId: intent.tokenId,
    priceWei: ethToWei(intent.priceEth),
    marketplaceFee: { recipient: TREASURY, basisPoints: intent.feeBps },
    extraFees: required,
    counter,
  });

  return {
    chainId: robinhoodChain.id,
    order,
    eip712: seaportEip712(robinhoodChain.id),
  };
});

/** Relay the SIGNED listing (signed in the user's wallet) to OpenSea. */
const SubmitListingSchema = z.object({
  parameters: z.record(z.unknown()),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
  protocolAddress: AddressSchema,
});
app.post("/v1/trade-intents/:id/submit-listing", async (req, reply) => {
  const { id } = req.params as { id: string };
  const intent = intents.get(id);
  if (!intent || intent.type !== "list") {
    return reply.code(404).send({ error: "List intent not found or expired" });
  }
  const parsed = SubmitListingSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

  const result = await os.postListing({
    parameters: parsed.data.parameters,
    signature: parsed.data.signature,
    protocol_address: parsed.data.protocolAddress,
  });
  return { ok: true, result };
});

/** Collection proxy — keeps the OpenSea API key server-side. */
app.get("/v1/collections/:slug", async (req, reply) => {
  const { slug } = req.params as { slug: string };
  if (!/^[a-z0-9-]{1,100}$/.test(slug)) {
    return reply.code(400).send({ error: "Invalid slug" });
  }
  const [collection, stats] = await Promise.all([
    os.getCollection(slug),
    os.getCollectionStats(slug),
  ]);
  return { collection, stats };
});

/**
 * HTTP mirror of Trader Cards' fully on-chain dynamic metadata — for
 * indexers that prefer a URL. Reads tokenURI via public RPC and decodes it.
 */
const tokenUriAbi = [
  {
    name: "tokenURI",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "string" }],
  },
] as const;

app.get("/v1/metadata/trader-cards/:tokenId", async (req, reply) => {
  const contract = process.env.TRADER_CARDS_ADDRESS as Address | undefined;
  if (!contract) {
    return reply.code(503).send({ error: "TRADER_CARDS_ADDRESS not configured" });
  }
  const { tokenId } = req.params as { tokenId: string };
  if (!/^\d{1,10}$/.test(tokenId)) return reply.code(400).send({ error: "Invalid tokenId" });
  try {
    const uri = await rpc.readContract({
      address: contract,
      abi: tokenUriAbi,
      functionName: "tokenURI",
      args: [BigInt(tokenId)],
    });
    const base64 = uri.replace("data:application/json;base64,", "");
    return JSON.parse(Buffer.from(base64, "base64").toString("utf8"));
  } catch {
    return reply.code(404).send({ error: "Token not found" });
  }
});

app.get("/healthz", async () => ({ ok: true, chain: robinhoodChain.id }));

app.listen({ port: PORT, host: "0.0.0.0" }).then(() => {
  console.log(`HoodBazaar API on :${PORT} — non-custodial, prepares unsigned orders only`);
});
