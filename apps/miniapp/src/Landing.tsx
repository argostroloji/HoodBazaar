import { useEffect, useState } from "react";
import { API_URL } from "./config";
import { CardPreview, useTraderCardsState } from "./Mint";

const GREEN = "#00C805";

interface TrendingRow {
  slug: string;
  name: string;
  imageUrl: string | null;
  openseaUrl: string;
  floorEth: number | null;
  volume24hEth: number;
  sales24h: number;
}

export function Landing() {
  const [trending, setTrending] = useState<TrendingRow[] | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/v1/trending`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => setTrending(d.collections as TrendingRow[]))
      .catch(() => setTrending(null));
  }, []);

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 16px 40px" }}>
      {/* ---------------------------------------------------------- hero */}
      <header style={{ textAlign: "center", marginBottom: 28 }}>
        <img
          src="/logo.svg"
          width={96}
          height={96}
          alt="HoodBazaar"
          style={{ borderRadius: 24 }}
        />
        <h1 style={{ margin: "14px 0 6px", fontSize: 32 }}>HoodBazaar</h1>
        <p style={{ opacity: 0.75, margin: "0 0 14px", fontSize: 16 }}>
          The Telegram-native NFT market layer for{" "}
          <b>Robinhood Chain</b>. Discover in chat, sign in your own wallet.
        </p>
        <a href="https://t.me/HoodBazaarbot" style={cta}>
          ▶ Open @HoodBazaarbot
        </a>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 14 }}>
          <Badge>🔐 Non-custodial</Badge>
          <Badge>⚡ Robinhood Chain L2</Badge>
          <Badge>🏷️ 1% marketplace fee</Badge>
        </div>
      </header>

      {/* ------------------------------------------------- live trending */}
      <Section title="🔥 Trending right now" subtitle="Live from OpenSea on Robinhood Chain">
        {trending === null ? (
          <p style={{ opacity: 0.6, fontSize: 14 }}>Loading live market data…</p>
        ) : (
          trending.map((c, i) => (
            <a
              key={c.slug}
              href={c.openseaUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 8px",
                borderRadius: 10,
                textDecoration: "none",
                color: "inherit",
                borderBottom: i < trending.length - 1 ? "1px solid rgba(127,127,127,0.15)" : "none",
              }}
            >
              <span style={{ opacity: 0.5, width: 18, fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
              {c.imageUrl ? (
                <img src={c.imageUrl} width={34} height={34} style={{ borderRadius: 8 }} alt="" />
              ) : (
                <span style={{ width: 34, height: 34, borderRadius: 8, background: "rgba(127,127,127,0.2)", display: "inline-block" }} />
              )}
              <span style={{ flex: 1, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.name}
              </span>
              <span style={{ textAlign: "right", fontSize: 13 }}>
                <span style={{ display: "block", fontWeight: 700 }}>
                  {c.floorEth != null ? `${trim(c.floorEth)} ETH` : "—"}
                </span>
                <span style={{ opacity: 0.55 }}>{trim(c.volume24hEth)} ETH 24h</span>
              </span>
            </a>
          ))
        )}
      </Section>

      {/* -------------------------------------------------- trader cards */}
      <TraderCardsSection />

      {/* ---------------------------------------------------- chat demo */}
      <Section title="💬 Talk to it like a trader">
        <Bubble me>signal ascii cats robinhood</Bubble>
        <Bubble>
          🟢 <b>ascii-cats-robinhood</b> — <b>ACCUMULATION</b> (confidence 60%)
          <br />
          <span style={{ opacity: 0.75 }}>
            Floor: 0.002 ETH · 24h vol: 10.7 ETH · 5234 sales
            <br />• 3 sweep(s) detected (0.04 ETH)
          </span>
        </Bubble>
        <Bubble me>buy 2 from ascii cats robinhood</Bubble>
        <Bubble>
          🛒 <b>Buy 2× ASCII CATS</b> — 0.0044 ETH + gas
          <br />
          <span
            style={{
              display: "inline-block",
              marginTop: 6,
              padding: "6px 12px",
              borderRadius: 8,
              background: GREEN,
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            ✍️ Sign in Mini App
          </span>
        </Bubble>
      </Section>

      {/* --------------------------------------------------- how it works */}
      <Section title="⚙️ How it works">
        <Step n={1} title="Discover in chat">
          Floors, trending, sweep alerts and accumulation signals — straight from
          the bot, powered by live OpenSea data.
        </Step>
        <Step n={2} title="Prepare, don't trust">
          The backend only builds <i>unsigned</i> Seaport orders. No keys, no
          deposits, no approvals to us — ever.
        </Step>
        <Step n={3} title="Sign in your wallet">
          The Mini App connects your own wallet via WalletConnect. You see item,
          price and the 1% fee before anything is signed.
        </Step>
      </Section>

      {/* ------------------------------------------------------- commands */}
      <Section title="⌨️ Commands">
        {COMMANDS.map(([c, d]) => (
          <div key={c} style={{ margin: "10px 0" }}>
            <code style={codeStyle}>{c}</code>
            <span style={{ fontSize: 12, opacity: 0.65 }}>{d}</span>
          </div>
        ))}
      </Section>

      <footer style={{ textAlign: "center", fontSize: 13, opacity: 0.6, marginTop: 28, lineHeight: 1.8 }}>
        <a href="https://github.com/argostroloji/HoodBazaar" style={{ color: GREEN }} target="_blank" rel="noreferrer">
          GitHub
        </a>
        {" · "}
        <a href="https://robinhoodchain.blockscout.com" style={{ color: GREEN }} target="_blank" rel="noreferrer">
          Explorer
        </a>
        {" · "}
        <a href="https://t.me/HoodBazaarbot" style={{ color: GREEN }}>
          Telegram
        </a>
        <br />
        Signals are heuristics, not financial advice. HoodBazaar never holds
        your funds.
      </footer>
    </div>
  );
}

function TraderCardsSection() {
  const { tier, minted, max, priceWei } = useTraderCardsState();
  const priceEth = priceWei != null ? Number(priceWei) / 1e18 : null;
  return (
    <Section
      title="🎴 Trader Cards — our flagship NFT"
      subtitle="Fully on-chain art that flips Bull / Crab / Bear with a live Chainlink feed"
    >
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <CardPreview tier={tier ?? "Unknown"} size={120} />
        <div style={{ flex: 1, textAlign: "left" }}>
          <div style={{ fontSize: 14, marginBottom: 6 }}>
            Market now: <b>{tier ?? "…"}</b>
          </div>
          <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 10 }}>
            {minted ?? "…"} / {max ?? "…"} minted
            {priceEth != null ? ` · ${priceEth} ETH` : ""}
          </div>
          <a
            href="?mint=1"
            style={{
              display: "inline-block",
              padding: "10px 22px",
              borderRadius: 10,
              background: GREEN,
              color: "#fff",
              fontWeight: 700,
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            Mint yours
          </a>
        </div>
      </div>
    </Section>
  );
}

const COMMANDS: Array<[string, string]> = [
  ["trending", "Top collections by volume"],
  ["floor ascii cats robinhood", "Floor price + 24h stats"],
  ["signal ascii cats robinhood", "Accumulation / distribution read"],
  ["sweeps ascii cats robinhood", "Recent bulk-buy activity"],
  ["listings ascii cats robinhood", "Cheapest live listings"],
  ["sales ascii cats robinhood", "Latest sales"],
  ["buy 2 from ascii cats robinhood", "Prepare a buy — sign it in the Mini App"],
  ["list my ascii-cats-robinhood #42 at floor+10%", "Prepare a listing"],
  ["watch ascii-cats-robinhood", "Floor & sweep alerts"],
  ["unwatch ascii-cats-robinhood", "Stop alerts"],
  ["watchlist", "Your active alert subscriptions"],
  ["portfolio 0xYourAddress", "Read-only holdings"],
  ["gas", "Current network gas"],
  ["help", "How HoodBazaar works"],
];

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: "var(--tg-theme-secondary-bg-color, #1c1c1e)",
        borderRadius: 14,
        padding: "16px 18px",
        marginBottom: 18,
      }}
    >
      <h3 style={{ margin: "0 0 2px" }}>{title}</h3>
      {subtitle && <p style={{ margin: "0 0 10px", fontSize: 12, opacity: 0.55 }}>{subtitle}</p>}
      {children}
    </section>
  );
}

function Bubble({ me, children }: { me?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: me ? "flex-end" : "flex-start", margin: "8px 0" }}>
      <div
        style={{
          maxWidth: "85%",
          padding: "8px 12px",
          borderRadius: me ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
          background: me ? GREEN : "rgba(127,127,127,0.18)",
          color: me ? "#fff" : "inherit",
          fontSize: 13.5,
          fontFamily: me ? "monospace" : "inherit",
          lineHeight: 1.5,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, margin: "12px 0" }}>
      <span
        style={{
          flexShrink: 0,
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: GREEN,
          color: "#fff",
          fontWeight: 800,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {n}
      </span>
      <div>
        <b>{title}</b>
        <p style={{ margin: "2px 0 0", fontSize: 13.5, opacity: 0.75, lineHeight: 1.5 }}>{children}</p>
      </div>
    </div>
  );
}

const cta: React.CSSProperties = {
  display: "inline-block",
  padding: "13px 30px",
  borderRadius: 12,
  background: GREEN,
  color: "#fff",
  fontSize: 16,
  fontWeight: 700,
  textDecoration: "none",
};

const codeStyle: React.CSSProperties = {
  display: "block",
  background: "rgba(127,127,127,0.15)",
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 13,
  overflowX: "auto",
  whiteSpace: "nowrap",
};

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 12.5,
        padding: "5px 10px",
        borderRadius: 999,
        background: "rgba(0,200,5,0.12)",
        border: "1px solid rgba(0,200,5,0.35)",
      }}
    >
      {children}
    </span>
  );
}

function trim(n: number): string {
  if (n >= 100) return n.toFixed(0);
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}
