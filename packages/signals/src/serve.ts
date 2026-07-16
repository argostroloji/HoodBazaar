import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
// Load the monorepo root .env first, then any local override
loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });
loadEnv();
import { createServer } from "node:http";
import handler from "./x402.js";

/**
 * Local dev harness that mimics the x402 flow WITHOUT real payments:
 *  - request without an X-PAYMENT header → 402 + payment requirements JSON
 *  - request with any X-PAYMENT header → handler executes
 * Production payment enforcement is done by Bankr x402 Cloud, not this file.
 */
const PORT = Number(process.env.SIGNALS_PORT ?? 8890);
const PRICE_USDC = process.env.SIGNALS_PRICE_USDC ?? "0.25";
const TREASURY = process.env.TREASURY_ADDRESS ?? "0x0000000000000000000000000000000000000000";

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  if (url.pathname !== "/signal") {
    res.writeHead(404).end(JSON.stringify({ error: "not found" }));
    return;
  }

  if (!req.headers["x-payment"]) {
    res.writeHead(402, { "content-type": "application/json" }).end(
      JSON.stringify({
        x402Version: 1,
        accepts: [
          {
            scheme: "exact",
            network: "base",
            maxAmountRequired: PRICE_USDC,
            asset: "USDC",
            payTo: TREASURY,
            resource: `http://localhost:${PORT}/signal`,
            description: "HoodBazaar Robinhood Chain NFT signal",
          },
        ],
      }),
    );
    return;
  }

  let body: unknown;
  if (req.method === "POST") {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    } catch {
      body = {};
    }
  }

  const out = await handler({
    method: req.method ?? "GET",
    query: Object.fromEntries(url.searchParams),
    body,
  });
  res
    .writeHead(out.status, { "content-type": "application/json" })
    .end(JSON.stringify(out.body));
}).listen(PORT, () => {
  console.log(`signals x402 dev harness on :${PORT} — GET /signal?collection=<slug>`);
  console.log(`(402 without X-PAYMENT header; real enforcement happens on Bankr x402 Cloud)`);
});
