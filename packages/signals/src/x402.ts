import { z } from "zod";
import { OpenSeaClient } from "@hoodbazaar/market";
import { computeSignal } from "./engine.js";

/**
 * Bankr x402 Cloud handler.
 *
 * Deploy with the Bankr CLI (authenticated with BANKR_API_KEY):
 *   bankr x402 deploy --entry src/x402.ts --price 0.25 --token USDC \
 *     --wallet $TREASURY_ADDRESS --name hoodbazaar-signals
 *
 * Agents hit the endpoint, get a 402 with payment requirements, sign a USDC
 * payment authorization (Base), retry, and Bankr settles revenue directly to
 * the treasury wallet. Payment is only collected when we return successfully.
 */

const RequestSchema = z.object({
  collection: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "collection must be an OpenSea slug"),
});

export interface X402Request {
  method: string;
  query?: Record<string, string>;
  body?: unknown;
}

export interface X402Response {
  status: number;
  body: unknown;
}

export async function handleSignalRequest(
  req: X402Request,
  env: { OPENSEA_API_KEY?: string } = process.env,
): Promise<X402Response> {
  const raw =
    req.method === "GET" ? (req.query ?? {}) : ((req.body ?? {}) as object);
  const parsed = RequestSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: 400, body: { error: parsed.error.flatten() } };
  }
  if (!env.OPENSEA_API_KEY) {
    return { status: 500, body: { error: "endpoint misconfigured" } };
  }
  const os = new OpenSeaClient({ apiKey: env.OPENSEA_API_KEY });
  try {
    const signal = await computeSignal(os, parsed.data.collection);
    return {
      status: 200,
      body: {
        ...signal,
        // bigint fields are not JSON-serializable — flatten sweeps
        sweeps: signal.sweeps.map((s) => ({ ...s })),
      },
    };
  } catch (err: any) {
    return {
      status: 502,
      body: { error: `signal computation failed: ${err?.message ?? "unknown"}` },
    };
  }
}

/** Default export in the shape Bankr x402 Cloud wraps. */
export default async function handler(req: X402Request): Promise<X402Response> {
  return handleSignalRequest(req);
}
