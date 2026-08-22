"use client";

import { useState } from "react";

import { AiPanel } from "@/components/quant/ai-panel";
import { BacktestPanel } from "@/components/quant/backtest-panel";
import type { BacktestResult } from "@/lib/quant/types";

/**
 * Holds the backtest result so the AI panel can attach it to every prompt.
 * A thin client wrapper because app/page.tsx is a server component and cannot
 * own state itself.
 */
export function QuantSection() {
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [coverage, setCoverage] = useState("");
  const [strategyName, setStrategyName] = useState("");

  return (
    <div className="flex flex-col gap-6">
      <BacktestPanel
        onResult={(r, cov, name) => {
          setResult(r);
          setCoverage(cov);
          setStrategyName(name);
        }}
      />
      <AiPanel result={result} coverage={coverage} strategyName={strategyName} />
    </div>
  );
}
