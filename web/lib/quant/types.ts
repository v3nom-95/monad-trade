/**
 * Shared types for the quant track (S1-QUANT).
 *
 * This track is pure data + math: no chain, no wallet, no RPC. Everything here
 * operates on a price series fetched from a centralized exchange.
 *
 * IMPORTANT CONTEXT FOR ANYONE CONSUMING THESE TYPES:
 * the price series backtested here (Bybit MON/USDT) is NOT the price series the
 * app executes against (a Monad testnet DEX pool, whose price is arbitrary).
 * Strategy numbers produced here describe the strategy. They say nothing about
 * the P&L of any testnet execution. Never sum the two.
 */

/** One OHLCV bar. `t` is the bar's OPEN time, ms since epoch, UTC. */
export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export type Side = "long" | "short";

/**
 * Candle interval. Bybit's codes: minutes as strings, or D/W/M.
 * Lives here rather than in ohlc.ts so StrategyDef can name a timeframe
 * without the types module depending on the fetch module.
 */
export type Interval =
  | "1" | "3" | "5" | "15" | "30" | "60" | "120" | "240" | "360" | "720"
  | "D" | "W" | "M";

/**
 * A closed round-trip trade.
 *
 * `executable` is the load-bearing field: a spot DEX swap cannot express a
 * short, so every short is marked `executable: false`. Callers must never
 * present total P&L without also presenting executable-only P&L.
 */
export interface Trade {
  entryT: number;
  exitT: number;
  entryPrice: number;
  exitPrice: number;
  side: Side;
  qty: number;
  pnl: number;
  pnlPct: number;
  fees: number;
  executable: boolean;
  /**
   * Why this trade could never be placed on a spot DEX. Present only when
   * `executable` is false — the UI has to EXPLAIN the exclusion, not just
   * grey the row out.
   */
  reason?: NonExecutableReason;
}

export type NonExecutableReason = "short-not-supported-on-spot";

export interface EquityPoint {
  t: number;
  equity: number;
}

/** The cost model a backtest ran under. Surfaced so results are auditable. */
export interface BacktestAssumptions {
  initialEquity: number;
  /** Taker fee as a fraction of notional, charged on entry and on exit. */
  feeRate: number;
  /** Price impact as a fraction, applied against the trader on both fills. */
  slippageRate: number;
  /** Fraction of equity committed per position. */
  positionSize: number;
  /** Signals are evaluated on a bar's close and filled at the NEXT bar's open. */
  fillRule: "next-bar-open";
}

export interface BacktestResult {
  trades: Trade[];
  equityCurve: EquityPoint[];
  winRate: number;
  totalPnl: number;
  maxDrawdown: number;
  tradeCount: number;
  firstCandleT: number;
  lastCandleT: number;
  /** Provenance of the price series, e.g. "bybit:spot:MONUSDT:D". */
  source: string;

  // --- executable-only view (longs only) -------------------------------
  // A spot DEX swap cannot short. These are the numbers that correspond to
  // trades the system could actually place.
  executablePnl: number;
  executableWinRate: number;
  executableTradeCount: number;
  /** Count of signalled trades that could never be placed on a spot DEX. */
  nonExecutableTradeCount: number;

  /**
   * True when equity reached zero or below at any point. The strategy did not
   * merely lose money — under this cost model the account was wiped out, and a
   * P&L figure past that point is not something a real trader could have had.
   * The UI should say "this strategy blew up" rather than print the number.
   *
   * NOTE: there is no margin-call or liquidation simulation behind this. It is
   * an observation about the equity curve, nothing more.
   */
  liquidated: boolean;

  /** Set when a risk cap stopped the run early. Absent means it ran to the end. */
  halted?: HaltReason;

  assumptions: BacktestAssumptions;
}

/** Why a run stopped opening new positions before the series ended. */
export type HaltReason = "max-trades" | "max-loss";

export type StrategyKind = "sma_cross" | "rsi" | "macd";

/**
 * A saved strategy. Deliberately a fixed set of parameterised indicators —
 * NOT a user-authored code system. Three named indicators were the ask.
 */
export interface StrategyDef {
  id: string;
  name: string;
  kind: StrategyKind;
  /** Indicator parameters. See DEFAULT_PARAMS in backtest.ts for each kind. */
  params: Record<string, number>;
  /**
   * When false, a short signal exits an open long and leaves the position
   * flat, rather than opening a modelled short. It never suppresses the exit —
   * see the note on the executable track in backtest.ts.
   */
  allowShort: boolean;
  /** Fraction of INITIAL equity committed per position. Not compounding. */
  positionSize: number;
  feeRate: number;
  slippageRate: number;

  /** Market and timeframe this strategy is defined against. */
  symbol: string;
  interval: Interval;

  /** Stop opening new positions after this many round trips. Omit for no cap. */
  maxTrades?: number;
  /**
   * Stop opening new positions once cumulative realized loss reaches this many
   * units of account equity. A POSITIVE number. Omit for no cap.
   */
  maxLoss?: number;
}
