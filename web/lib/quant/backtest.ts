/**
 * Single-asset backtest loop.
 *
 * DETERMINISM: nothing in this file reads the clock or a random source. The
 * same candles plus the same StrategyDef always produce byte-identical output.
 *
 * THE LONG/SHORT GAP — the most important thing in this module: a spot DEX
 * swap cannot express a short. Short trades are still simulated (the strategy
 * signalled them, and hiding them would misrepresent the strategy) but they
 * are marked `executable: false` and excluded from the executable-only
 * headline. Callers MUST show both numbers. Showing only `totalPnl` would tell
 * the user they made money on trades the system can never place.
 */

import type {
  BacktestAssumptions,
  BacktestResult,
  Candle,
  EquityPoint,
  HaltReason,
  StrategyDef,
  Trade,
} from "./types.ts";
import { closes, macd, rsi, sma } from "./indicators.ts";

export const DEFAULT_PARAMS: Record<StrategyDef["kind"], Record<string, number>> = {
  sma_cross: { fast: 10, slow: 30 },
  rsi: { period: 14, oversold: 30, overbought: 70 },
  macd: { fast: 12, slow: 26, signal: 9 },
};

/**
 * 0.25, not 1.0. At full size on an asset as volatile as MON the out-of-box
 * config drives the account to zero — see `liquidated` on BacktestResult. The
 * math is not clamped and equity can still go negative; the DEFAULT just does
 * not aim there.
 */
export const DEFAULT_POSITION_SIZE = 0.25;

export const DEFAULT_STRATEGY: StrategyDef = {
  id: "sma-10-30",
  name: "SMA 10/30 crossover",
  kind: "sma_cross",
  params: DEFAULT_PARAMS.sma_cross,
  allowShort: true,
  positionSize: DEFAULT_POSITION_SIZE,
  feeRate: 0.001, // 0.1% taker, a realistic spot fee
  slippageRate: 0.0005, // 5 bps against us on every fill
  symbol: "MONUSDT",
  // Hourly, not daily: MON has only ~9 months of history, which is 272 daily
  // bars and far too thin a sample. Hourly gives ~6,500 over the same window.
  interval: "60",
};

/** -1 short, 0 flat, 1 long, null = indicator warm-up, do not trade. */
export type Signal = -1 | 0 | 1 | null;

const INITIAL_EQUITY = 10_000;

/**
 * Desired position per bar, evaluated on that bar's CLOSE.
 * `out[i]` uses only data up to and including candle `i` — no lookahead.
 */
export function generateSignals(candles: Candle[], strategy: StrategyDef): Signal[] {
  const c = closes(candles);
  const p = { ...DEFAULT_PARAMS[strategy.kind], ...strategy.params };
  const out: Signal[] = new Array(candles.length).fill(null);

  if (strategy.kind === "sma_cross") {
    const fast = sma(c, p.fast);
    const slow = sma(c, p.slow);
    for (let i = 0; i < c.length; i++) {
      const f = fast[i];
      const s = slow[i];
      if (f === null || s === null) continue;
      out[i] = f > s ? 1 : f < s ? -1 : 0;
    }
    return out;
  }

  if (strategy.kind === "rsi") {
    const r = rsi(c, p.period);
    for (let i = 0; i < c.length; i++) {
      const v = r[i];
      if (v === null) continue;
      // Mean reversion: oversold -> long, overbought -> short, else flat.
      out[i] = v <= p.oversold ? 1 : v >= p.overbought ? -1 : 0;
    }
    return out;
  }

  const m = macd(c, p.fast, p.slow, p.signal);
  for (let i = 0; i < c.length; i++) {
    const h = m.histogram[i];
    if (h === null) continue;
    out[i] = h > 0 ? 1 : h < 0 ? -1 : 0;
  }
  return out;
}

interface OpenPosition {
  side: 1 | -1;
  entryT: number;
  /** Fill price after slippage. */
  entryPrice: number;
  qty: number;
  /** Entry-side fee, carried so the closed trade reports the round trip. */
  entryFee: number;
}

/** Slippage always works against the trader, on both sides of the trade. */
const fillPrice = (raw: number, buying: boolean, slip: number) =>
  buying ? raw * (1 + slip) : raw * (1 - slip);

export function runBacktest(
  candles: Candle[],
  strategy: StrategyDef = DEFAULT_STRATEGY,
  initialEquity: number = INITIAL_EQUITY,
): BacktestResult {
  const assumptions: BacktestAssumptions = {
    initialEquity,
    feeRate: strategy.feeRate,
    slippageRate: strategy.slippageRate,
    positionSize: strategy.positionSize,
    fillRule: "next-bar-open",
  };

  // An empty series is a legitimate state (cold cache, filtered window), not an
  // error. Return a well-formed empty result so callers do not need a guard.
  if (candles.length === 0) {
    return {
      trades: [],
      equityCurve: [],
      winRate: 0,
      totalPnl: 0,
      maxDrawdown: 0,
      tradeCount: 0,
      firstCandleT: 0,
      lastCandleT: 0,
      source: "unknown",
      executablePnl: 0,
      executableWinRate: 0,
      executableTradeCount: 0,
      nonExecutableTradeCount: 0,
      liquidated: false,
      assumptions,
    };
  }

  const signals = generateSignals(candles, strategy);
  const trades: Trade[] = [];
  const equityCurve: EquityPoint[] = [];

  // Position size is a fraction of INITIAL equity, not compounding. This keeps
  // executable-only P&L a clean sum: with compounding, a long's size would
  // depend on shorts that could never have been placed.
  const notional = initialEquity * strategy.positionSize;

  let realized = 0;
  let halted: HaltReason | undefined;
  let open: OpenPosition | null = null;
  // Read through a function so TypeScript uses the declared type of `open`
  // rather than a control-flow narrowing that the closure mutations below
  // invalidate.
  const currentSide = (): -1 | 0 | 1 => (open ? open.side : 0);

  const closeAt = (rawPrice: number, t: number) => {
    if (!open) return;
    const pos = open;
    const buying = pos.side === -1; // closing a short means buying back
    const exitPrice = fillPrice(rawPrice, buying, strategy.slippageRate);
    const exitFee = exitPrice * pos.qty * strategy.feeRate;
    const fees = pos.entryFee + exitFee;
    const gross =
      pos.side === 1
        ? (exitPrice - pos.entryPrice) * pos.qty
        : (pos.entryPrice - exitPrice) * pos.qty;
    const pnl = gross - fees;
    const cost = pos.entryPrice * pos.qty;
    trades.push({
      entryT: pos.entryT,
      exitT: t,
      entryPrice: pos.entryPrice,
      exitPrice,
      side: pos.side === 1 ? "long" : "short",
      qty: pos.qty,
      pnl,
      pnlPct: cost === 0 ? 0 : pnl / cost,
      fees,
      // A spot DEX swap can only go long. Note that CLOSING a long on a short
      // signal is executable — selling a spot position is an ordinary swap.
      // Only the short LEG itself is unplaceable.
      executable: pos.side === 1,
      ...(pos.side === 1
        ? {}
        : { reason: "short-not-supported-on-spot" as const }),
    });
    realized += pnl;
    open = null;
  };

  const openAt = (side: 1 | -1, rawPrice: number, t: number) => {
    const buying = side === 1;
    const entryPrice = fillPrice(rawPrice, buying, strategy.slippageRate);
    if (entryPrice <= 0) return;
    const qty = notional / entryPrice;
    open = {
      side,
      entryT: t,
      entryPrice,
      qty,
      entryFee: entryPrice * qty * strategy.feeRate,
    };
  };

  for (let i = 0; i < candles.length; i++) {
    const raw = signals[i];

    // Signal on this bar's close, fill on the NEXT bar's open. No lookahead.
    const next = candles[i + 1];
    if (next && raw !== null) {
      // Shorts collapse to flat when the strategy disallows them.
      const desired: -1 | 0 | 1 = !strategy.allowShort && raw === -1 ? 0 : raw;
      if (desired !== currentSide()) {
        if (currentSide() !== 0) closeAt(next.o, next.t);
        // Caps are checked AFTER the close: an open position is always allowed
        // to exit. A cap must never trap the trader in a losing position.
        if (halted === undefined) {
          if (strategy.maxTrades !== undefined && trades.length >= strategy.maxTrades) {
            halted = "max-trades";
          } else if (strategy.maxLoss !== undefined && realized <= -strategy.maxLoss) {
            halted = "max-loss";
          }
        }
        if (desired !== 0 && halted === undefined) openAt(desired, next.o, next.t);
      }
    }

    // Mark to market at this bar's close.
    const bar = candles[i];
    let unrealized = 0;
    const pos = open as OpenPosition | null;
    if (pos) {
      unrealized =
        pos.side === 1
          ? (bar.c - pos.entryPrice) * pos.qty
          : (pos.entryPrice - bar.c) * pos.qty;
    }
    equityCurve.push({ t: bar.t, equity: initialEquity + realized + unrealized });
  }

  // Force-close anything still open on the final bar so the trade list is
  // complete and the equity curve ends on a realized number.
  const last = candles[candles.length - 1];
  if (currentSide() !== 0) {
    closeAt(last.c, last.t);
    equityCurve[equityCurve.length - 1] = {
      t: last.t,
      equity: initialEquity + realized,
    };
  }

  const wins = trades.filter((t) => t.pnl > 0).length;
  // An observation about the equity curve, not a liquidation simulation.
  const liquidated = equityCurve.some((p) => p.equity <= 0);
  const executable = trades.filter((t) => t.executable);
  const executableWins = executable.filter((t) => t.pnl > 0).length;

  return {
    trades,
    equityCurve,
    winRate: trades.length === 0 ? 0 : wins / trades.length,
    totalPnl: trades.reduce((s, t) => s + t.pnl, 0),
    maxDrawdown: maxDrawdown(equityCurve),
    tradeCount: trades.length,
    firstCandleT: candles[0].t,
    lastCandleT: last.t,
    source: "unknown", // overwritten by the caller from CandleSet.source
    executablePnl: executable.reduce((s, t) => s + t.pnl, 0),
    executableWinRate:
      executable.length === 0 ? 0 : executableWins / executable.length,
    executableTradeCount: executable.length,
    nonExecutableTradeCount: trades.length - executable.length,
    liquidated,
    ...(halted === undefined ? {} : { halted }),
    assumptions,
  };
}

/** Largest peak-to-trough decline, as a fraction of the peak (0..1). */
export function maxDrawdown(curve: EquityPoint[]): number {
  let peak = -Infinity;
  let worst = 0;
  for (const p of curve) {
    if (p.equity > peak) peak = p.equity;
    if (peak > 0) {
      const dd = (peak - p.equity) / peak;
      if (dd > worst) worst = dd;
    }
  }
  return worst;
}
