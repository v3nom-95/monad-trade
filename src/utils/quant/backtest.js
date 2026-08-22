/**
 * Single-asset backtest loop. Straight port of
 * proj_monad/web/lib/quant/backtest.ts — do not re-derive the maths.
 *
 * THE LONG/SHORT GAP: a spot DEX swap cannot express a short. Shorts are still
 * simulated (the strategy signalled them) but marked executable:false and
 * excluded from the executable-only headline. Callers MUST show both numbers.
 */

import { closes, macd, rsi, sma } from './indicators'

export const DEFAULT_PARAMS = {
  sma_cross: { fast: 10, slow: 30 },
  rsi: { period: 14, oversold: 30, overbought: 70 },
  macd: { fast: 12, slow: 26, signal: 9 }
}

/** 0.25, not 1.0 — at full size MON's volatility drives the account to zero. */
export const DEFAULT_POSITION_SIZE = 0.25

const INITIAL_EQUITY = 10000

export const DEFAULT_STRATEGY = {
  id: 'sma-10-30',
  name: 'SMA 10/30 crossover',
  kind: 'sma_cross',
  params: DEFAULT_PARAMS.sma_cross,
  allowShort: true,
  positionSize: DEFAULT_POSITION_SIZE,
  feeRate: 0.001,
  slippageRate: 0.0005,
  symbol: 'MONUSDT',
  interval: '60'
}

/** The three built-ins the Strategy Lab offers. */
export function builtInStrategies (symbol = 'MONUSDT', interval = '60') {
  const base = {
    allowShort: true,
    positionSize: DEFAULT_POSITION_SIZE,
    feeRate: 0.001,
    slippageRate: 0.0005,
    symbol,
    interval
  }
  return [
    { ...base, id: 'rsi-14', name: 'RSI 14 mean reversion', kind: 'rsi', params: { ...DEFAULT_PARAMS.rsi } },
    { ...base, id: 'sma-10-30', name: 'SMA 10/30 crossover', kind: 'sma_cross', params: { ...DEFAULT_PARAMS.sma_cross } },
    { ...base, id: 'macd-12-26-9', name: 'MACD 12/26/9', kind: 'macd', params: { ...DEFAULT_PARAMS.macd } }
  ]
}

/**
 * Desired position per bar, evaluated on that bar's CLOSE.
 * out[i] uses only data up to and including candle i — no lookahead.
 */
export function generateSignals (candles, strategy) {
  const c = closes(candles)
  const p = { ...DEFAULT_PARAMS[strategy.kind], ...strategy.params }
  const out = new Array(candles.length).fill(null)

  if (strategy.kind === 'sma_cross') {
    const fast = sma(c, p.fast)
    const slow = sma(c, p.slow)
    for (let i = 0; i < c.length; i++) {
      const f = fast[i]
      const s = slow[i]
      if (f === null || s === null) continue
      out[i] = f > s ? 1 : f < s ? -1 : 0
    }
    return out
  }

  if (strategy.kind === 'rsi') {
    const r = rsi(c, p.period)
    for (let i = 0; i < c.length; i++) {
      const v = r[i]
      if (v === null) continue
      out[i] = v <= p.oversold ? 1 : v >= p.overbought ? -1 : 0
    }
    return out
  }

  const m = macd(c, p.fast, p.slow, p.signal)
  for (let i = 0; i < c.length; i++) {
    const h = m.histogram[i]
    if (h === null) continue
    out[i] = h > 0 ? 1 : h < 0 ? -1 : 0
  }
  return out
}

/** Slippage always works against the trader, on both sides. */
const fillPrice = (raw, buying, slip) => (buying ? raw * (1 + slip) : raw * (1 - slip))

export function runBacktest (candles, strategy = DEFAULT_STRATEGY, initialEquity = INITIAL_EQUITY) {
  const assumptions = {
    initialEquity,
    feeRate: strategy.feeRate,
    slippageRate: strategy.slippageRate,
    positionSize: strategy.positionSize,
    fillRule: 'next-bar-open'
  }

  if (candles.length === 0) {
    return {
      trades: [], equityCurve: [], winRate: 0, totalPnl: 0, maxDrawdown: 0,
      tradeCount: 0, firstCandleT: 0, lastCandleT: 0, source: 'unknown',
      executablePnl: 0, executableWinRate: 0, executableTradeCount: 0,
      nonExecutableTradeCount: 0, liquidated: false, assumptions
    }
  }

  const signals = generateSignals(candles, strategy)
  const trades = []
  const equityCurve = []

  // Fraction of INITIAL equity, not compounding — keeps executable-only P&L a
  // clean sum, otherwise a long's size would depend on unplaceable shorts.
  const notional = initialEquity * strategy.positionSize

  let realized = 0
  let halted
  let open = null
  const currentSide = () => (open ? open.side : 0)

  const closeAt = (rawPrice, t) => {
    if (!open) return
    const pos = open
    const buying = pos.side === -1 // closing a short means buying back
    const exitPrice = fillPrice(rawPrice, buying, strategy.slippageRate)
    const exitFee = exitPrice * pos.qty * strategy.feeRate
    const fees = pos.entryFee + exitFee
    const gross =
      pos.side === 1
        ? (exitPrice - pos.entryPrice) * pos.qty
        : (pos.entryPrice - exitPrice) * pos.qty
    const pnl = gross - fees
    const cost = pos.entryPrice * pos.qty
    const trade = {
      entryT: pos.entryT,
      exitT: t,
      entryPrice: pos.entryPrice,
      exitPrice,
      side: pos.side === 1 ? 'long' : 'short',
      qty: pos.qty,
      pnl,
      pnlPct: cost === 0 ? 0 : pnl / cost,
      fees,
      // CLOSING a long on a short signal is executable — selling spot is an
      // ordinary swap. Only the short LEG itself is unplaceable.
      executable: pos.side === 1
    }
    if (pos.side !== 1) trade.reason = 'short-not-supported-on-spot'
    trades.push(trade)
    realized += pnl
    open = null
  }

  const openAt = (side, rawPrice, t) => {
    const buying = side === 1
    const entryPrice = fillPrice(rawPrice, buying, strategy.slippageRate)
    if (entryPrice <= 0) return
    const qty = notional / entryPrice
    open = { side, entryT: t, entryPrice, qty, entryFee: entryPrice * qty * strategy.feeRate }
  }

  for (let i = 0; i < candles.length; i++) {
    const raw = signals[i]

    // Signal on this bar's close, fill on the NEXT bar's open. No lookahead.
    const next = candles[i + 1]
    if (next && raw !== null) {
      const desired = !strategy.allowShort && raw === -1 ? 0 : raw
      if (desired !== currentSide()) {
        if (currentSide() !== 0) closeAt(next.o, next.t)
        // Caps checked AFTER the close: an open position may always exit.
        if (halted === undefined) {
          if (strategy.maxTrades !== undefined && trades.length >= strategy.maxTrades) {
            halted = 'max-trades'
          } else if (strategy.maxLoss !== undefined && realized <= -strategy.maxLoss) {
            halted = 'max-loss'
          }
        }
        if (desired !== 0 && halted === undefined) openAt(desired, next.o, next.t)
      }
    }

    const bar = candles[i]
    let unrealized = 0
    if (open) {
      unrealized =
        open.side === 1
          ? (bar.c - open.entryPrice) * open.qty
          : (open.entryPrice - bar.c) * open.qty
    }
    equityCurve.push({ t: bar.t, equity: initialEquity + realized + unrealized })
  }

  const last = candles[candles.length - 1]
  if (currentSide() !== 0) {
    closeAt(last.c, last.t)
    equityCurve[equityCurve.length - 1] = { t: last.t, equity: initialEquity + realized }
  }

  const wins = trades.filter((t) => t.pnl > 0).length
  const liquidated = equityCurve.some((p) => p.equity <= 0)
  const executable = trades.filter((t) => t.executable)
  const executableWins = executable.filter((t) => t.pnl > 0).length

  const result = {
    trades,
    equityCurve,
    winRate: trades.length === 0 ? 0 : wins / trades.length,
    totalPnl: trades.reduce((s, t) => s + t.pnl, 0),
    maxDrawdown: maxDrawdown(equityCurve),
    tradeCount: trades.length,
    firstCandleT: candles[0].t,
    lastCandleT: last.t,
    source: 'unknown',
    executablePnl: executable.reduce((s, t) => s + t.pnl, 0),
    executableWinRate: executable.length === 0 ? 0 : executableWins / executable.length,
    executableTradeCount: executable.length,
    nonExecutableTradeCount: trades.length - executable.length,
    liquidated,
    assumptions
  }
  if (halted !== undefined) result.halted = halted
  return result
}

/** Largest peak-to-trough decline as a fraction of the peak (0..1). */
export function maxDrawdown (curve) {
  let peak = -Infinity
  let worst = 0
  for (const p of curve) {
    if (p.equity > peak) peak = p.equity
    if (peak > 0) {
      const dd = (peak - p.equity) / peak
      if (dd > worst) worst = dd
    }
  }
  return worst
}
