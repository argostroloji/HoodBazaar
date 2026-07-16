import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface WatchSubscription {
  chatId: number;
  collection: string;
  /** Last floor we alerted on, to compute movement. */
  lastFloorEth: number | null;
  /** Timestamp of the newest sale already processed for sweep alerts. */
  lastSaleTimestamp: number;
}

/** Tiny JSON-file store — no native deps, safe on OneDrive-synced folders. */
export class WatchStore {
  private readonly file: string;
  private subs: WatchSubscription[] = [];

  constructor(dataDir = join(process.cwd(), "data")) {
    this.file = join(dataDir, "watches.json");
    try {
      this.subs = JSON.parse(readFileSync(this.file, "utf8"));
    } catch {
      this.subs = [];
    }
  }

  private persist() {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.subs, null, 2));
  }

  add(chatId: number, collection: string): boolean {
    if (this.subs.some((s) => s.chatId === chatId && s.collection === collection)) {
      return false;
    }
    this.subs.push({
      chatId,
      collection,
      lastFloorEth: null,
      lastSaleTimestamp: Math.floor(Date.now() / 1000),
    });
    this.persist();
    return true;
  }

  remove(chatId: number, collection: string): boolean {
    const before = this.subs.length;
    this.subs = this.subs.filter(
      (s) => !(s.chatId === chatId && s.collection === collection),
    );
    if (this.subs.length !== before) this.persist();
    return this.subs.length !== before;
  }

  all(): WatchSubscription[] {
    return this.subs;
  }

  byChat(chatId: number): string[] {
    return this.subs.filter((s) => s.chatId === chatId).map((s) => s.collection);
  }

  update(sub: WatchSubscription) {
    this.persist();
  }
}
