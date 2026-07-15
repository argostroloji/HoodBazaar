import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { defineChain } from "@reown/appkit/networks";

export const API_URL: string =
  import.meta.env.VITE_API_URL ?? "http://localhost:8787";

const projectId: string = import.meta.env.VITE_REOWN_PROJECT_ID ?? "";
if (!projectId) {
  console.warn("VITE_REOWN_PROJECT_ID missing — wallet connect will not work");
}

/** Robinhood Chain (verified: chainId 4663, docs.robinhood.com/chain). */
export const robinhoodNetwork = defineChain({
  id: 4663,
  caipNetworkId: "eip155:4663",
  chainNamespace: "eip155",
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://robinhoodchain.blockscout.com",
    },
  },
});

export const wagmiAdapter = new WagmiAdapter({
  networks: [robinhoodNetwork],
  projectId,
});

createAppKit({
  adapters: [wagmiAdapter],
  networks: [robinhoodNetwork],
  projectId,
  metadata: {
    name: "HoodBazaar",
    description: "Non-custodial NFT trading on Robinhood Chain",
    url: window.location.origin,
    icons: [],
  },
  features: {
    analytics: false,
    email: false,
    socials: false,
  },
});

/** OpenSea conduit — the operator Seaport transfers ERC-721s through. */
export const OPENSEA_CONDUIT =
  "0x1E0049783F008A0085193E00003D00cd54003c71" as const;
