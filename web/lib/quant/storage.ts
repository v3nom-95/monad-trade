/**
 * Strategy persistence: save / load / list / delete.
 *
 * Browser -> localStorage. Node -> JSON files under lib/quant/.cache/strategies,
 * the same convention the candle cache uses, so verify.ts can exercise the real
 * round trip rather than a mock.
 *
 * SCOPE BOUNDARY — this stores PARAMETERS for three fixed indicator kinds. It
 * does not store user-authored code, and it must not grow into that. Custom
 * indicator code is the thing that turns a trading tool into a strategy IDE,
 * and that is deliberately out of scope.
 */

import type { Interval, StrategyDef, StrategyKind } from "./types.ts";
import { DEFAULT_PARAMS, DEFAULT_POSITION_SIZE } from "./backtest.ts";

/**
 * Bump when the stored shape changes. Records written by an older version are
 * rejected with a clear message rather than silently misread.
 */
export const STRATEGY_SCHEMA_VERSION = 1;

export interface StoredStrategy {
  schemaVersion: number;
  strategy: StrategyDef;
}

const KEY_PREFIX = "quant-strategy:";
const VALID_KINDS: StrategyKind[] = ["sma_cross", "rsi", "macd"];

/** Thrown for a malformed or unreadable record. Never thrown for "not found". */
export class StrategyStoreError extends Error {}

// --- validation ------------------------------------------------------------

/**
 * Validate a decoded record. Returns the strategy, or throws with a reason the
 * UI can show. Storage is the boundary where bad data enters the system, so
 * this checks structure rather than trusting the cast.
 */
export function parseStored(raw: unknown): StrategyDef {
  if (typeof raw !== "object" || raw === null) {
    throw new StrategyStoreError("stored record is not an object");
  }
  const rec = raw as Partial<StoredStrategy>;
  if (rec.schemaVersion !== STRATEGY_SCHEMA_VERSION) {
    throw new StrategyStoreError(
      `unsupported schemaVersion ${String(rec.schemaVersion)} ` +
        `(this build reads ${STRATEGY_SCHEMA_VERSION})`,
    );
  }
  const s = rec.strategy;
  if (typeof s !== "object" || s === null) {
    throw new StrategyStoreError("stored record has no strategy");
  }
  if (!VALID_KINDS.includes(s.kind)) {
    throw new StrategyStoreError(`unknown strategy kind: ${String(s.kind)}`);
  }
  if (typeof s.id !== "string" || s.id.length === 0) {
    throw new StrategyStoreError("strategy id must be a non-empty string");
  }
  if (!(s.positionSize > 0)) {
    throw new StrategyStoreError(`positionSize must be > 0, got ${String(s.positionSize)}`);
  }
  for (const [k, v] of Object.entries(s.params ?? {})) {
    if (typeof v !== "number" || !Number.isFinite(v)) {
      throw new StrategyStoreError(`param ${k} is not a finite number`);
    }
  }
  return s;
}

// --- public API ------------------------------------------------------------

export async function saveStrategy(strategy: StrategyDef): Promise<void> {
  const record: StoredStrategy = {
    schemaVersion: STRATEGY_SCHEMA_VERSION,
    strategy,
  };
  await writeRecord(strategy.id, JSON.stringify(record));
}

/** Returns null when no strategy with that id exists. Throws only on bad data. */
export async function loadStrategy(id: string): Promise<StrategyDef | null> {
  const raw = await readRecord(id);
  if (raw === null) return null;
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    throw new StrategyStoreError(`strategy ${id} is not valid JSON`);
  }
  return parseStored(decoded);
}

export async function listStrategies(): Promise<StrategyDef[]> {
  const ids = await listIds();
  const out: StrategyDef[] = [];
  for (const id of ids.sort()) {
    // One corrupt record must not hide every other saved strategy.
    try {
      const s = await loadStrategy(id);
      if (s) out.push(s);
    } catch {
      continue;
    }
  }
  return out;
}

export async function deleteStrategy(id: string): Promise<boolean> {
  return removeRecord(id);
}

// --- built-in presets ------------------------------------------------------

/**
 * The three indicator kinds as parameterised records rather than hardcoded
 * call sites. These are starting points to edit and save, not fixtures.
 */
export function builtInStrategies(
  symbol = "MONUSDT",
  interval: Interval = "60",
): StrategyDef[] {
  const base = {
    allowShort: true,
    positionSize: DEFAULT_POSITION_SIZE,
    feeRate: 0.001,
    slippageRate: 0.0005,
    symbol,
    interval,
  };
  return [
    {
      ...base,
      id: "sma-10-30",
      name: "SMA 10/30 crossover",
      kind: "sma_cross",
      params: { ...DEFAULT_PARAMS.sma_cross },
    },
    {
      ...base,
      id: "rsi-14",
      name: "RSI 14 mean reversion",
      kind: "rsi",
      params: { ...DEFAULT_PARAMS.rsi },
    },
    {
      ...base,
      id: "macd-12-26-9",
      name: "MACD 12/26/9",
      kind: "macd",
      params: { ...DEFAULT_PARAMS.macd },
    },
  ];
}

// --- backend ---------------------------------------------------------------

const isBrowser = () => typeof window !== "undefined";

async function nodeDir(): Promise<{ dir: string; path: typeof import("node:path") }> {
  const path = await import("node:path");
  // Next runs with cwd = web/, matching the candle cache location.
  return { dir: path.join(process.cwd(), "lib", "quant", ".cache", "strategies"), path };
}

const fileSafe = (id: string) => id.replace(/[^a-zA-Z0-9._-]/g, "_");

async function writeRecord(id: string, json: string): Promise<void> {
  if (isBrowser()) {
    window.localStorage.setItem(KEY_PREFIX + id, json);
    return;
  }
  const { dir, path } = await nodeDir();
  const fs = await import("node:fs/promises");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${fileSafe(id)}.json`), json, "utf8");
}

async function readRecord(id: string): Promise<string | null> {
  if (isBrowser()) return window.localStorage.getItem(KEY_PREFIX + id);
  const { dir, path } = await nodeDir();
  const fs = await import("node:fs/promises");
  try {
    return await fs.readFile(path.join(dir, `${fileSafe(id)}.json`), "utf8");
  } catch {
    return null;
  }
}

async function listIds(): Promise<string[]> {
  if (isBrowser()) {
    const ids: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k?.startsWith(KEY_PREFIX)) ids.push(k.slice(KEY_PREFIX.length));
    }
    return ids;
  }
  const { dir } = await nodeDir();
  const fs = await import("node:fs/promises");
  try {
    const files = await fs.readdir(dir);
    return files
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -".json".length));
  } catch {
    return [];
  }
}

async function removeRecord(id: string): Promise<boolean> {
  if (isBrowser()) {
    const key = KEY_PREFIX + id;
    if (window.localStorage.getItem(key) === null) return false;
    window.localStorage.removeItem(key);
    return true;
  }
  const { dir, path } = await nodeDir();
  const fs = await import("node:fs/promises");
  try {
    await fs.unlink(path.join(dir, `${fileSafe(id)}.json`));
    return true;
  } catch {
    return false;
  }
}
