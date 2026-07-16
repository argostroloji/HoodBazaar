import { useState } from "react";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { formatEther } from "viem";
import { TRADER_CARDS, robinhoodNetwork, traderCardsAbi } from "./config";

const GREEN = "#00C805";

const TIER_STYLE: Record<string, { color: string; face: string }> = {
  Bull: { color: "#16c784", face: "📈" },
  Bear: { color: "#ea3943", face: "📉" },
  Crab: { color: "#f5a623", face: "🦀" },
  Unknown: { color: "#71717a", face: "?" },
};

/** Client-side preview of the on-chain SVG art. */
export function CardPreview({ tier, size = 180 }: { tier: string; size?: number }) {
  const s = TIER_STYLE[tier] ?? TIER_STYLE.Unknown!;
  return (
    <svg width={size} height={size * 1.4} viewBox="0 0 400 560" style={{ borderRadius: 12 }}>
      <rect width="400" height="560" rx="24" fill="#101014" />
      <rect x="14" y="14" width="372" height="532" rx="18" fill="none" stroke={s.color} strokeWidth="4" />
      <text x="200" y="250" fontSize="96" textAnchor="middle">{s.face}</text>
      <text x="200" y="380" fontSize="42" fontFamily="monospace" fill={s.color} textAnchor="middle">{tier}</text>
      <text x="200" y="430" fontSize="18" fontFamily="monospace" fill="#71717a" textAnchor="middle">TRADER CARD</text>
    </svg>
  );
}

export function useTraderCardsState() {
  const common = { abi: traderCardsAbi, address: TRADER_CARDS, chainId: robinhoodNetwork.id } as const;
  const tier = useReadContract({ ...common, functionName: "currentTier" });
  const minted = useReadContract({ ...common, functionName: "totalSupply" });
  const max = useReadContract({ ...common, functionName: "maxSupply" });
  const price = useReadContract({ ...common, functionName: "mintPrice" });
  return {
    tier: tier.data ?? null,
    minted: minted.data != null ? Number(minted.data) : null,
    max: max.data != null ? Number(max.data) : null,
    priceWei: price.data ?? null,
  };
}

export function Mint() {
  const { tier, minted, max, priceWei } = useTraderCardsState();
  const { address, isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const [phase, setPhase] = useState<"idle" | "working" | "done" | "error">("idle");
  const [status, setStatus] = useState("");
  const [mintedId, setMintedId] = useState<number | null>(null);

  const priceEth = priceWei != null ? formatEther(priceWei) : null;
  const soldOut = minted != null && max != null && minted >= max;

  async function handleMint() {
    if (!address || priceWei == null) return;
    setPhase("working");
    try {
      if (chainId !== robinhoodNetwork.id) {
        await switchChainAsync({ chainId: robinhoodNetwork.id });
      }
      setStatus("Confirm the mint in your wallet…");
      const hash = await writeContractAsync({
        abi: traderCardsAbi,
        address: TRADER_CARDS,
        functionName: "mint",
        value: priceWei,
        chainId: robinhoodNetwork.id,
      });
      setStatus("Waiting for confirmation…");
      await publicClient?.waitForTransactionReceipt({ hash });
      setMintedId((minted ?? 0) + 1);
      setPhase("done");
      setStatus("Minted! 🎉");
    } catch (e: any) {
      setPhase("error");
      setStatus(e?.shortMessage ?? e?.message ?? "Mint failed");
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: 16, textAlign: "center" }}>
      <h2 style={{ marginTop: 8 }}>Mint a Trader Card</h2>
      <p style={{ opacity: 0.7, marginTop: 0, fontSize: 14 }}>
        A dynamic NFT whose mood follows the market via a Chainlink ETH/USD
        feed — fully on-chain art on Robinhood Chain.
      </p>

      <CardPreview tier={tier ?? "Unknown"} />

      <div style={{ fontSize: 14, margin: "10px 0 16px" }}>
        <div>
          Market now: <b>{tier ?? "…"}</b>{" "}
          {tier ? TIER_STYLE[tier]?.face : ""}
        </div>
        <div style={{ opacity: 0.7 }}>
          {minted ?? "…"} / {max ?? "…"} minted · {priceEth ?? "…"} ETH each
        </div>
      </div>

      {!isConnected ? (
        <appkit-button />
      ) : phase === "done" ? (
        <div>
          <p>
            {status} Your card is <b>#{mintedId}</b> — it will flip between
            Bull, Crab and Bear as the market moves.
          </p>
          <a
            style={{ color: GREEN }}
            href={`https://robinhoodchain.blockscout.com/token/${TRADER_CARDS}/instance/${mintedId}`}
            target="_blank"
            rel="noreferrer"
          >
            View on Blockscout
          </a>
        </div>
      ) : (
        <>
          <button
            onClick={handleMint}
            disabled={phase === "working" || soldOut || priceWei == null}
            style={{
              width: "100%",
              padding: "14px 16px",
              borderRadius: 12,
              border: "none",
              background: GREEN,
              color: "#fff",
              fontSize: 16,
              fontWeight: 700,
              cursor: "pointer",
              opacity: phase === "working" ? 0.7 : 1,
            }}
          >
            {soldOut
              ? "Sold out"
              : phase === "working"
                ? "Minting…"
                : `Mint for ${priceEth ?? "…"} ETH`}
          </button>
          {status && <p style={{ fontSize: 13 }}>{status}</p>}
        </>
      )}

      <p style={{ fontSize: 12.5, opacity: 0.6, marginTop: 18 }}>
        🔐 Mint happens in your own wallet on Robinhood Chain (4663). Contract
        verified on Blockscout.
      </p>
    </div>
  );
}
