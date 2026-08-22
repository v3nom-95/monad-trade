"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { runBacktest } from "@/lib/quant/backtest";
import { describeCoverage, fetchCandles } from "@/lib/quant/ohlc";
import { builtInStrategies } from "@/lib/quant/storage";
import type { BacktestResult } from "@/lib/quant/types";

const STRATEGIES = builtInStrategies("MONUSDT", "60");
/** rsi-14 is the profitable one — it is what the demo leads with. */
const DEFAULT_ID = "rsi-14";

function fmt(n: number, dp = 2) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

function price(n: number) {
  return n.toFixed(5);
}

export function BacktestPanel({
  onResult,
}: {
  onResult?: (r: BacktestResult, coverage: string, strategyName: string) => void;
} = {}) {
  const [strategyId, setStrategyId] = useState(DEFAULT_ID);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [coverage, setCoverage] = useState("");
  const [error, setError] = useState("");

  async function run() {
    setRunning(true);
    setError("");
    try {
      const strategy =
        STRATEGIES.find((s) => s.id === strategyId) ?? STRATEGIES[0];
      // fetchCandles caches to localStorage, so a second run is instant and
      // works with no network at all.
      const set = await fetchCandles({ symbol: "MONUSDT", interval: "60" });
      const cov = describeCoverage(set);
      const res = runBacktest(set.candles, strategy);
      setCoverage(cov);
      setResult(res);
      onResult?.(res, cov, strategy.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backtest failed.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Strategy backtest</CardTitle>
        <CardDescription>
          Runs against real MONUSDT hourly candles. No wallet or chain needed.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">Strategy</span>
            <select
              className="rounded-md border border-input bg-background px-3 py-2"
              value={strategyId}
              onChange={(e) => setStrategyId(e.target.value)}
            >
              {STRATEGIES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <Button onClick={run} disabled={running}>
            {running ? "Running…" : "Run backtest"}
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {result && (
          <>
            <Separator />

            <div className="flex flex-wrap items-end gap-10">
              <div className="flex flex-col">
                <span className="text-sm text-muted-foreground">Total P&amp;L</span>
                <span className="font-mono text-4xl font-semibold">
                  {fmt(result.totalPnl)}
                </span>
              </div>
              {/* The differentiator: what the system could actually have placed. */}
              <div className="flex flex-col rounded-md border border-primary/50 bg-primary/10 px-4 py-2">
                <span className="text-sm font-medium">Executable only</span>
                <span className="font-mono text-4xl font-semibold text-primary">
                  {fmt(result.executablePnl)}
                </span>
              </div>
            </div>

            <div className="font-mono text-sm text-muted-foreground">
              {result.tradeCount} trades · win {fmt(result.winRate * 100, 1)}% ·
              maxDD {fmt(result.maxDrawdown * 100, 1)}% ·{" "}
              {result.equityCurve.length} bars
            </div>

            {coverage && (
              <div className="font-mono text-xs text-muted-foreground">
                {coverage}
              </div>
            )}

            {result.liquidated && (
              <p className="text-sm text-destructive">
                This strategy blew up — equity reached zero under this cost
                model.
              </p>
            )}

            <Separator />

            <p className="text-sm">
              Shorts cannot be executed on a spot DEX. We report both numbers.
            </p>

            <div className="max-h-96 overflow-y-auto rounded-md border border-border">
              <table className="w-full text-left font-mono text-xs">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2">Side</th>
                    <th className="px-3 py-2">Entry</th>
                    <th className="px-3 py-2">Exit</th>
                    <th className="px-3 py-2 text-right">P&amp;L</th>
                    <th className="px-3 py-2">Executable</th>
                  </tr>
                </thead>
                <tbody>
                  {result.trades.map((t, i) => (
                    <tr
                      key={`${t.entryT}-${i}`}
                      className={
                        t.executable
                          ? "border-b border-border/50"
                          : "border-b border-border/50 bg-muted/40 text-muted-foreground line-through"
                      }
                    >
                      <td className="px-3 py-1.5 uppercase">{t.side}</td>
                      <td className="px-3 py-1.5">{price(t.entryPrice)}</td>
                      <td className="px-3 py-1.5">{price(t.exitPrice)}</td>
                      <td
                        className={`px-3 py-1.5 text-right ${
                          !t.executable
                            ? ""
                            : t.pnl >= 0
                              ? "text-[#16a34a]"
                              : "text-[#dc2626]"
                        }`}
                      >
                        {t.pnl >= 0 ? "+" : ""}
                        {fmt(t.pnl)}
                      </td>
                      <td className="px-3 py-1.5 no-underline">
                        {t.executable ? (
                          <Badge variant="secondary">yes</Badge>
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            <Badge variant="outline">no</Badge>
                            <span className="normal-case">{t.reason}</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
