import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useSendTransaction,
  useSignTypedData,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { formatEther } from "viem";
import { OPENSEA_CONDUIT, robinhoodNetwork } from "./config";
import {
  fetchFulfillment,
  fetchIntent,
  fetchOrderParameters,
  submitListing,
  type TradeIntent,
} from "./api";
import { Landing } from "./Landing";
import { Mint } from "./Mint";

function isMintMode(): boolean {
  const url = new URL(window.location.href);
  if (url.searchParams.get("mint") != null) return true;
  return window.Telegram?.WebApp?.initDataUnsafe?.start_param === "mint";
}

const erc721Abi = [
  {
    name: "isApprovedForAll",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "operator", type: "address" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "setApprovalForAll",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
] as const;

function intentIdFromEnv(): string | null {
  const url = new URL(window.location.href);
  const fromQuery = url.searchParams.get("intent");
  if (fromQuery) return fromQuery;
  // Telegram passes start params for direct-link Mini Apps
  const tg = window.Telegram?.WebApp;
  return tg?.initDataUnsafe?.start_param ?? null;
}

type Phase = "idle" | "working" | "done" | "error";

export function App() {
  const intentId = useMemo(intentIdFromEnv, []);
  const [intent, setIntent] = useState<TradeIntent | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<string>("");
  const [gasEth, setGasEth] = useState<string | null>(null);

  const { address, isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const { signTypedDataAsync } = useSignTypedData();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  useEffect(() => {
    if (!intentId) return;
    fetchIntent(intentId)
      .then(setIntent)
      .catch((e) => setLoadError(e.message));
  }, [intentId]);

  const needsApproval = useReadContract(
    intent?.type === "list" && address
      ? {
          abi: erc721Abi,
          address: intent.nftContract as `0x${string}`,
          functionName: "isApprovedForAll",
          args: [address, OPENSEA_CONDUIT],
        }
      : undefined,
  );

  // Estimate gas for the first buy transaction so the user sees a real number.
  useEffect(() => {
    (async () => {
      if (!intent || intent.type !== "buy" || !address || !publicClient) return;
      try {
        const { transactions } = await fetchFulfillment(intent.id, address);
        const tx = transactions[0];
        if (!tx) return;
        const gas = await publicClient.estimateGas({
          account: address,
          to: tx.to,
          value: BigInt(tx.value),
          data: tx.inputData,
        });
        const gasPrice = await publicClient.getGasPrice();
        setGasEth(formatEther(gas * gasPrice * BigInt(transactions.length)));
      } catch {
        setGasEth(null); // estimate is best-effort
      }
    })();
  }, [intent, address, publicClient]);

  async function ensureChain() {
    if (chainId !== robinhoodNetwork.id) {
      await switchChainAsync({ chainId: robinhoodNetwork.id });
    }
  }

  async function handleBuy() {
    if (!intent || intent.type !== "buy" || !address) return;
    setPhase("working");
    try {
      await ensureChain();
      setStatus("Preparing transactions…");
      const { transactions } = await fetchFulfillment(intent.id, address);
      for (let i = 0; i < transactions.length; i++) {
        const tx = transactions[i]!;
        setStatus(`Confirm purchase ${i + 1}/${transactions.length} in your wallet…`);
        const hash = await sendTransactionAsync({
          to: tx.to,
          value: BigInt(tx.value),
          data: tx.inputData,
          chainId: robinhoodNetwork.id,
        });
        setStatus(`Waiting for confirmation ${i + 1}/${transactions.length}…`);
        await publicClient?.waitForTransactionReceipt({ hash });
      }
      setPhase("done");
      setStatus("Purchase complete 🎉");
    } catch (e: any) {
      setPhase("error");
      setStatus(e?.shortMessage ?? e?.message ?? "Transaction failed");
    }
  }

  async function handleList() {
    if (!intent || intent.type !== "list" || !address) return;
    setPhase("working");
    try {
      await ensureChain();
      if (needsApproval.data === false) {
        setStatus("Approve the marketplace operator in your wallet (one-time)…");
        const hash = await writeContractAsync({
          abi: erc721Abi,
          address: intent.nftContract as `0x${string}`,
          functionName: "setApprovalForAll",
          args: [OPENSEA_CONDUIT, true],
          chainId: robinhoodNetwork.id,
        });
        await publicClient?.waitForTransactionReceipt({ hash });
      }
      setStatus("Building your listing…");
      const { order, eip712 } = await fetchOrderParameters(intent.id, address);
      setStatus("Sign the listing in your wallet (gasless signature)…");
      const signature = await signTypedDataAsync({
        domain: eip712.domain as any,
        types: eip712.types as any,
        primaryType: eip712.primaryType,
        message: { ...order.parameters, counter: order.counter } as any,
      });
      setStatus("Publishing to the orderbook…");
      await submitListing(
        intent.id,
        order.parameters,
        signature,
        (eip712.domain as any).verifyingContract,
      );
      setPhase("done");
      setStatus("Listing live on OpenSea ✅");
    } catch (e: any) {
      setPhase("error");
      setStatus(e?.shortMessage ?? e?.message ?? "Listing failed");
    }
  }

  if (!intentId) return isMintMode() ? <Mint /> : <Landing />;
  if (loadError) return <Screen><p>⚠️ {loadError}</p></Screen>;
  if (!intent) return <Screen><p>Loading trade…</p></Screen>;

  const feePct = intent.type === "list" ? intent.feeBps / 100 : null;

  return (
    <Screen>
      <h2 style={{ marginTop: 0 }}>
        {intent.type === "buy" ? "Confirm purchase" : "Confirm listing"}
      </h2>

      <Card>
        {intent.type === "buy" ? (
          <>
            <Row k="Collection" v={intent.collectionName} />
            {intent.listings.map((l) => (
              <Row key={l.tokenId} k={`#${l.tokenId}`} v={`${l.priceEth} ETH`} />
            ))}
            <hr style={{ opacity: 0.2 }} />
            <Row k="Total" v={`${intent.totalEth.toFixed(4)} ETH`} bold />
            <Row k="Est. gas" v={gasEth ? `~${Number(gasEth).toFixed(6)} ETH` : "shown in wallet"} />
          </>
        ) : (
          <>
            <Row k="Item" v={`${intent.collectionName} #${intent.tokenId}`} />
            <Row k="List price" v={`${intent.priceEth} ETH`} bold />
            <Row k={`Marketplace fee (${feePct}%)`} v={`${((intent.priceEth * intent.feeBps) / 10_000).toFixed(6)} ETH`} />
            <Row k="You receive" v={`${(intent.priceEth * (1 - intent.feeBps / 10_000)).toFixed(6)} ETH`} />
            <Row k="Gas" v="none — listing is an off-chain signature" />
          </>
        )}
      </Card>

      <p style={{ fontSize: 13, opacity: 0.7 }}>
        🔐 You sign in your own wallet. HoodBazaar never holds your funds and
        never asks for recovery phrases.
      </p>

      {!isConnected ? (
        <appkit-button />
      ) : phase === "done" ? (
        <p>{status}</p>
      ) : (
        <>
          <button
            style={btnStyle}
            disabled={phase === "working"}
            onClick={intent.type === "buy" ? handleBuy : handleList}
          >
            {phase === "working"
              ? "Working…"
              : intent.type === "buy"
                ? `Buy for ${intent.totalEth.toFixed(4)} ETH`
                : `Sign listing`}
          </button>
          {status && <p style={{ fontSize: 13 }}>{status}</p>}
        </>
      )}
    </Screen>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return <div style={{ maxWidth: 480, margin: "0 auto", padding: 16 }}>{children}</div>;
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--tg-theme-secondary-bg-color, #1c1c1e)",
        borderRadius: 12,
        padding: 16,
      }}
    >
      {children}
    </div>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", margin: "4px 0", fontWeight: bold ? 700 : 400 }}>
      <span style={{ opacity: 0.75 }}>{k}</span>
      <span>{v}</span>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: 12,
  border: "none",
  background: "var(--tg-theme-button-color, #34c759)",
  color: "var(--tg-theme-button-text-color, #fff)",
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
};
