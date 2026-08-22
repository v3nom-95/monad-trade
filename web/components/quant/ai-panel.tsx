"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { BacktestResult } from "@/lib/quant/types";

const PRESETS = [
  "How should I adjust this strategy given I can't short on a spot DEX?",
  "Why does mean-reversion generate so many short signals on a volatile asset?",
  "What are the risks of backtesting on CEX prices but executing on a DEX?",
];

function fmt(n: number, dp = 2) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

/**
 * Prepends the CURRENT backtest to the question so the model reasons about the
 * user's actual trades rather than answering generically.
 */
function buildPrompt(
  question: string,
  result: BacktestResult | null,
  coverage: string,
  strategyName: string,
) {
  if (!result) return question;
  return [
    `Strategy: ${strategyName} on MONUSDT 1h, ${result.tradeCount} trades over ${coverage}.`,
    `Total P&L ${fmt(result.totalPnl)}, executable-only P&L ${fmt(result.executablePnl)}.`,
    `${result.nonExecutableTradeCount} trades were shorts that cannot be placed on a spot DEX.`,
    `Win rate ${fmt(result.winRate * 100, 1)}%. Max drawdown ${fmt(result.maxDrawdown * 100, 1)}%.`,
    ``,
    `User question: ${question}`,
  ].join("\n");
}

export function AiPanel({
  result,
  coverage,
  strategyName,
}: {
  result: BacktestResult | null;
  coverage: string;
  strategyName: string;
}) {
  const [input, setInput] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || loading) return;
    setLoading(true);
    setError("");
    setAnswer("");
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: buildPrompt(q, result, coverage, strategyName),
        }),
      });
      const json = (await res.json()) as { text?: string; error?: string };
      if (json.error) setError(json.error);
      else setAnswer(json.text ?? "");
    } catch {
      setError("Request failed. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Strategy Analyst</CardTitle>
        <CardDescription>
          {result
            ? "Your latest backtest is attached to every question, so answers reference your actual numbers."
            : "Run a backtest above and your results are attached automatically."}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button
              key={p}
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => {
                setInput(p);
                ask(p);
              }}
              className="h-auto whitespace-normal py-2 text-left"
            >
              {p}
            </Button>
          ))}
        </div>

        <textarea
          className="min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="Ask about this strategy…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />

        <div>
          <Button disabled={loading || !input.trim()} onClick={() => ask(input)}>
            {loading ? "Thinking…" : "Send"}
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {answer && (
          <div className="whitespace-pre-wrap rounded-md bg-muted/50 p-4 text-sm">
            {answer}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
