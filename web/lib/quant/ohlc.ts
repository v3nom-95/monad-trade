/**
 * OHLC ingest for MON/USDT.
 *
 * SOURCE DECISION: Bybit v5 public spot klines, fetched over plain HTTPS GET.
 * `ccxt` is available on npm (4.5.75 at time of writing) and would work, but a
 * single unauthenticated GET already returns exactly the OHLCV we need, so the
 * dependency buys nothing. If we ever need a second venue's quirks normalised,
 * that is the moment to add it.
 *
 * WHY BYBIT AND NOT A MONAD DEX: the app executes on Monad TESTNET, whose pool
 * prices are arbitrary and have no history. A strategy backtested on testnet
 * prices would be meaningless. So the strategy is evaluated against the real
 * MON market. See the note in types.ts about never combining the two.
 */

import type { Candle, Interval } from "./types.ts";

export type { Interval };

const BYBIT_BASE = "https://api.bybit.com/v5/market/kline";
const MAX_LIMIT = 1000;

const MINUTE = 60_000;
const INTERVAL_MS: Record<Interval, number> = {
  "1": MINUTE, "3": 3 * MINUTE, "5": 5 * MINUTE, "15": 15 * MINUTE,
  "30": 30 * MINUTE, "60": 60 * MINUTE, "120": 120 * MINUTE,
  "240": 240 * MINUTE, "360": 360 * MINUTE, "720": 720 * MINUTE,
  D: 24 * 60 * MINUTE,
  W: 7 * 24 * 60 * MINUTE,
  M: 30 * 24 * 60 * MINUTE, // approximate; only used to advance the cursor
};

export interface FetchOptions {
  symbol?: string;
  interval?: Interval;
  /** Inclusive lower bound, ms epoch. Defaults to the listing date. */
  start?: number;
  /** Inclusive upper bound, ms epoch. Defaults to now. */
  end?: number;
  /** Skip the cache and always hit the network. */
  noCache?: boolean;
  /**
   * Keep the final, still-forming bar. Off by default: an open bar's close
   * moves as the market trades, so including it makes two runs minutes apart
   * disagree — the compute is deterministic but the DATA would not be.
   */
  includeIncomplete?: boolean;
}

export interface CandleSet {
  candles: Candle[];
  /** Provenance string, e.g. "bybit:spot:MONUSDT:D". */
  source: string;
  symbol: string;
  interval: Interval;
  /** Open time of the earliest candle the exchange actually has. */
  firstCandleT: number;
  lastCandleT: number;
}

/** Bybit returns rows newest-first as string tuples. */
type BybitRow = [string, string, string, string, string, string, string];

function rowToCandle(r: BybitRow): Candle {
  return {
    t: Number(r[0]),
    o: Number(r[1]),
    h: Number(r[2]),
    l: Number(r[3]),
    c: Number(r[4]),
    v: Number(r[5]),
  };
}

async function fetchPage(
  symbol: string,
  interval: Interval,
  start: number,
  end: number,
): Promise<Candle[]> {
  const url =
    `${BYBIT_BASE}?category=spot&symbol=${encodeURIComponent(symbol)}` +
    `&interval=${interval}&start=${start}&end=${end}&limit=${MAX_LIMIT}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`bybit kline HTTP ${res.status}`);
  const json = (await res.json()) as {
    retCode: number;
    retMsg: string;
    result?: { list?: BybitRow[] };
  };
  if (json.retCode !== 0) throw new Error(`bybit kline error: ${json.retMsg}`);
  const list = json.result?.list ?? [];
  // Bybit hands back newest-first; we work oldest-first everywhere.
  return list.map(rowToCandle).sort((a, b) => a.t - b.t);
}

/**
 * Fetch the full available history for a symbol/interval.
 *
 * Paginates forward from `start` until the exchange stops returning new bars,
 * so it reports the TRUE earliest candle rather than assuming a range.
 */
export async function fetchCandles(opts: FetchOptions = {}): Promise<CandleSet> {
  const symbol = opts.symbol ?? "MONUSDT";
  const interval = opts.interval ?? "D";
  const step = INTERVAL_MS[interval];
  // 2025-01-01 — comfortably before any MON listing, so we discover the real
  // first candle instead of hard-coding a date that will rot.
  const start = opts.start ?? Date.UTC(2025, 0, 1);
  const end = opts.end ?? Date.now();
  const source = `bybit:spot:${symbol}:${interval}`;

  if (!opts.noCache) {
    const hit = await readCache(source, start, end);
    if (hit) return hit;
  }

  const seen = new Map<number, Candle>();
  // Walk BACKWARDS from `end`. Bybit caps a windowed request at `limit` and
  // returns the most RECENT bars in that window, so paginating forward from
  // `start` silently yields only the newest 1000 and nothing older. Moving the
  // `end` cursor back past the oldest bar received is what actually reaches the
  // listing date.
  let cursorEnd = end;
  // Bounded so a misbehaving endpoint can never spin forever.
  for (let page = 0; page < 200; page++) {
    const batch = await fetchPage(symbol, interval, start, cursorEnd);
    if (batch.length === 0) break;
    let added = 0;
    for (const c of batch) {
      if (!seen.has(c.t)) {
        seen.set(c.t, c);
        added++;
      }
    }
    const oldest = batch[0].t;
    const nextEnd = oldest - step;
    if (added === 0 || oldest <= start || nextEnd <= start) break;
    cursorEnd = nextEnd;
  }

  const candles = [...seen.values()].sort((a, b) => a.t - b.t);
  // Drop the trailing bar if its interval has not elapsed yet.
  if (!opts.includeIncomplete && candles.length > 0) {
    const lastOpen = candles[candles.length - 1].t;
    if (lastOpen + step > end) candles.pop();
  }
  if (candles.length === 0) {
    throw new Error(
      `no candles returned for ${source} in the requested window — ` +
        `check the symbol is listed on Bybit spot`,
    );
  }

  const set: CandleSet = {
    candles,
    source,
    symbol,
    interval,
    firstCandleT: candles[0].t,
    lastCandleT: candles[candles.length - 1].t,
  };
  if (!opts.noCache) await writeCache(source, start, end, set);
  return set;
}

/**
 * Human-readable statement of what history actually exists.
 *
 * The user asked for "months or years". MON is a recent listing and the honest
 * answer is months — this is what surfaces that rather than letting a short
 * window masquerade as a long one.
 */
export function describeCoverage(set: CandleSet): string {
  const days =
    (set.lastCandleT - set.firstCandleT) / INTERVAL_MS.D;
  const from = new Date(set.firstCandleT).toISOString().slice(0, 10);
  const to = new Date(set.lastCandleT).toISOString().slice(0, 10);
  const months = days / 30.44;
  return (
    `${set.source}: ${set.candles.length} bars, ${from} to ${to} ` +
    `(${days.toFixed(0)} days / ${months.toFixed(1)} months)`
  );
}

// --- cache -----------------------------------------------------------------
// Works in the browser (localStorage) and in Node (a file under this folder).
// Candle history is immutable once closed, so a plain keyed blob is enough.

const cacheKey = (source: string, start: number, end: number) =>
  // End is bucketed by day so "now" does not produce a fresh key every call.
  `quant-ohlc:${source}:${start}:${Math.floor(end / INTERVAL_MS.D)}`;

async function nodeCachePath(key: string): Promise<string | null> {
  if (typeof window !== "undefined") return null;
  const path = await import("node:path");
  // Next runs with cwd = web/, so this lands in web/lib/quant/.cache.
  const dir = path.join(process.cwd(), "lib", "quant", ".cache");
  return path.join(dir, `${key.replace(/[^a-zA-Z0-9._-]/g, "_")}.json`);
}

async function readCache(
  source: string,
  start: number,
  end: number,
): Promise<CandleSet | null> {
  const key = cacheKey(source, start, end);
  try {
    if (typeof window !== "undefined") {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as CandleSet) : null;
    }
    const file = await nodeCachePath(key);
    if (!file) return null;
    const fs = await import("node:fs/promises");
    return JSON.parse(await fs.readFile(file, "utf8")) as CandleSet;
  } catch {
    return null; // a cold or corrupt cache is never fatal
  }
}

async function writeCache(
  source: string,
  start: number,
  end: number,
  set: CandleSet,
): Promise<void> {
  const key = cacheKey(source, start, end);
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(key, JSON.stringify(set));
      return;
    }
    const file = await nodeCachePath(key);
    if (!file) return;
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(set), "utf8");
  } catch {
    // Caching is an optimisation. Never let it break a backtest.
  }
}
