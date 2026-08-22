/**
 * Dev script and reproducible proof of the numbers we report.
 *
 * Run:  node --experimental-strip-types lib/quant/verify.ts
 *
 * Proves three things, none of them asserted on trust:
 *   1. what history actually exists (measured, not assumed)
 *   2. a saved strategy round-trips to a BYTE-IDENTICAL backtest result
 *   3. the same input twice produces byte-identical output (determinism)
 */

import { describeCoverage, fetchCandles } from "./ohlc.ts";
import { runBacktest } from "./backtest.ts";
import {
  builtInStrategies,
  deleteStrategy,
  listStrategies,
  loadStrategy,
  saveStrategy,
} from "./storage.ts";
import type { BacktestResult, Interval, StrategyDef } from "./types.ts";

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const usd = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}`;

function line(s: StrategyDef, r: BacktestResult): string {
  const flags = [
    r.liquidated ? "LIQUIDATED" : null,
    r.halted ? `halted:${r.halted}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    `  ${s.name}\n` +
    `    ALL SIGNALS      ${usd(r.totalPnl)} | ${r.tradeCount} trades | ` +
    `win ${pct(r.winRate)} | maxDD ${pct(r.maxDrawdown)} ${flags}\n` +
    `    EXECUTABLE ONLY  ${usd(r.executablePnl)} | ${r.executableTradeCount} trades | ` +
    `win ${pct(r.executableWinRate)} | ${r.nonExecutableTradeCount} shorts not placeable`
  );
}

async function runInterval(interval: Interval) {
  const set = await fetchCandles({ symbol: "MONUSDT", interval });
  console.log(`\n=== ${describeCoverage(set)} ===`);
  for (const s of builtInStrategies("MONUSDT", interval)) {
    const r = { ...runBacktest(set.candles, s), source: set.source };
    console.log(line(s, r));
  }
  return set;
}

async function main() {
  // Hourly first: it is the default, because 272 daily bars is too thin a
  // sample to judge a strategy on.
  const hourly = await runInterval("60");
  await runInterval("D");

  // --- round trip: save -> load -> re-run -> compare bytes ----------------
  console.log("\n=== ROUND TRIP (save -> load -> re-run) ===");
  let allMatch = true;
  for (const original of builtInStrategies("MONUSDT", "60")) {
    await saveStrategy(original);
    const loaded = await loadStrategy(original.id);
    if (!loaded) throw new Error(`round trip failed: ${original.id} did not load`);

    const before = JSON.stringify(runBacktest(hourly.candles, original));
    const after = JSON.stringify(runBacktest(hourly.candles, loaded));
    const recordMatch = JSON.stringify(original) === JSON.stringify(loaded);
    const resultMatch = before === after;
    allMatch &&= recordMatch && resultMatch;
    console.log(
      `  ${original.id}: record ${recordMatch ? "identical" : "DIFFERS"}, ` +
        `backtest ${resultMatch ? "byte-identical" : "DIFFERS"} (${after.length} bytes)`,
    );
  }
  const listed = await listStrategies();
  console.log(`  listStrategies() -> ${listed.map((s) => s.id).join(", ")}`);
  console.log(`  ROUND TRIP: ${allMatch ? "PASS" : "FAIL"}`);

  // Leave the store as we found it so repeated runs are identical.
  for (const s of listed) await deleteStrategy(s.id);
  console.log(`  cleaned up -> ${(await listStrategies()).length} stored`);

  // --- determinism --------------------------------------------------------
  const [base] = builtInStrategies("MONUSDT", "60");
  const a = JSON.stringify(runBacktest(hourly.candles, base));
  const b = JSON.stringify(runBacktest(hourly.candles, base));
  console.log(`\nDETERMINISM: ${a === b ? "PASS" : "FAIL"} (${a.length} bytes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
