/** Natural-language command parsing for the discovery bot. */

export type Command =
  | { kind: "floor"; collection: string }
  | { kind: "trending" }
  | { kind: "buy"; count: number; collection: string }
  | {
      kind: "list";
      contractOrSlug: string;
      tokenId: string;
      price: { type: "absolute"; eth: number } | { type: "floorPct"; pct: number };
    }
  | { kind: "watch"; collection: string }
  | { kind: "unwatch"; collection: string }
  | { kind: "watchlist" }
  | { kind: "portfolio"; address: string }
  | { kind: "listings"; collection: string }
  | { kind: "sales"; collection: string }
  | { kind: "sweeps"; collection: string }
  | { kind: "signal"; collection: string }
  | { kind: "gas" }
  | { kind: "help" };

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export function parseCommand(raw: string): Command | null {
  const text = raw.trim().replace(/^\//, "").replace(/\s+/g, " ");
  const lower = text.toLowerCase();

  if (lower === "help" || lower === "start") return { kind: "help" };
  if (lower === "trending") return { kind: "trending" };
  if (lower === "watchlist" || lower === "watches") return { kind: "watchlist" };
  if (lower === "gas") return { kind: "gas" };

  let m = lower.match(/^floor (.+)$/);
  if (m) return { kind: "floor", collection: slugify(m[1]!) };

  m = lower.match(/^listings (.+)$/);
  if (m) return { kind: "listings", collection: slugify(m[1]!) };

  m = lower.match(/^sales (.+)$/);
  if (m) return { kind: "sales", collection: slugify(m[1]!) };

  m = lower.match(/^sweeps? (.+)$/);
  if (m) return { kind: "sweeps", collection: slugify(m[1]!) };

  m = lower.match(/^signal (.+)$/);
  if (m) return { kind: "signal", collection: slugify(m[1]!) };

  m = lower.match(/^buy (\d+) from (.+)$/);
  if (m) {
    const count = Number(m[1]);
    if (count < 1 || count > 20) return null;
    return { kind: "buy", count, collection: slugify(m[2]!) };
  }

  // "list my <collection> #<tokenId> at <price>" — price is "1.5" | "1.5 eth" | "floor+10%" | "floor"
  m = text.match(/^list my (.+?) #?(\d+) at (.+)$/i);
  if (m) {
    const price = parsePrice(m[3]!.toLowerCase());
    if (!price) return null;
    return {
      kind: "list",
      contractOrSlug: slugify(m[1]!),
      tokenId: m[2]!,
      price,
    };
  }

  m = lower.match(/^watch (.+)$/);
  if (m) return { kind: "watch", collection: slugify(m[1]!) };

  m = lower.match(/^unwatch (.+)$/);
  if (m) return { kind: "unwatch", collection: slugify(m[1]!) };

  m = text.match(/^portfolio (\S+)$/i);
  if (m && ADDRESS_RE.test(m[1]!)) return { kind: "portfolio", address: m[1]! };

  return null;
}

function parsePrice(
  s: string,
): { type: "absolute"; eth: number } | { type: "floorPct"; pct: number } | null {
  const floorMatch = s.match(/^floor\s*(?:([+-])\s*(\d+(?:\.\d+)?)\s*%)?$/);
  if (floorMatch) {
    const sign = floorMatch[1] === "-" ? -1 : 1;
    const pct = floorMatch[2] ? sign * Number(floorMatch[2]) : 0;
    return { type: "floorPct", pct };
  }
  const abs = s.match(/^(\d+(?:\.\d+)?)(?:\s*eth)?$/);
  if (abs) {
    const eth = Number(abs[1]);
    if (eth <= 0) return null;
    return { type: "absolute", eth };
  }
  return null;
}

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}
