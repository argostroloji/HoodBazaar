import { API_URL } from "./config";

export interface BuyIntent {
  id: string;
  type: "buy";
  collectionName: string;
  count: number;
  listings: Array<{ tokenId: string; priceEth: number; contractAddress: string }>;
  totalEth: number;
}

export interface ListIntent {
  id: string;
  type: "list";
  collectionName: string;
  nftContract: string;
  tokenId: string;
  priceEth: number;
  feeBps: number;
}

export type TradeIntent = BuyIntent | ListIntent;

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export async function fetchIntent(id: string): Promise<TradeIntent> {
  const res = await fetch(`${API_URL}/v1/trade-intents/${id}`);
  if (!res.ok) throw new Error("This trade link has expired. Ask the bot to prepare a new one.");
  const data = await res.json();
  return data.intent as TradeIntent;
}

export interface FulfillmentTx {
  tokenId: string;
  priceEth: number;
  to: `0x${string}`;
  value: string;
  inputData: `0x${string}`;
  functionName: string;
}

export function fetchFulfillment(id: string, address: string) {
  return post<{ chainId: number; transactions: FulfillmentTx[] }>(
    `/v1/trade-intents/${id}/fulfillment`,
    { address },
  );
}

export function fetchOrderParameters(id: string, address: string) {
  return post<{
    chainId: number;
    order: { parameters: Record<string, unknown>; counter: string };
    eip712: {
      domain: Record<string, unknown>;
      types: Record<string, unknown>;
      primaryType: "OrderComponents";
    };
  }>(`/v1/trade-intents/${id}/order-parameters`, { address });
}

export function submitListing(
  id: string,
  parameters: Record<string, unknown>,
  signature: string,
  protocolAddress: string,
) {
  return post<{ ok: boolean }>(`/v1/trade-intents/${id}/submit-listing`, {
    parameters,
    signature,
    protocolAddress,
  });
}
