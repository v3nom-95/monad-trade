/**
 * Indicators. Straight port of proj_monad/web/lib/quant/indicators.ts — the
 * maths is tested and correct, do not re-derive it.
 *
 * ALIGNMENT CONTRACT: every function returns an array the SAME LENGTH as its
 * input. Warm-up positions are `null`. Nothing is truncated or shifted, so
 * out[i] always describes input[i].
 */

export const closes = (candles) => candles.map((c) => c.c)

const toValues = (input) =>
  input.length === 0 ? [] : typeof input[0] === 'number' ? input : input.map((c) => c.c)

/** Simple moving average. First non-null at index period - 1. */
export function sma (input, period) {
  if (period <= 0) throw new Error('sma: period must be > 0')
  const values = toValues(input)
  const out = new Array(values.length).fill(null)
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

/** EMA seeded with the SMA of the first `period` values. */
export function ema (input, period) {
  if (period <= 0) throw new Error('ema: period must be > 0')
  const values = toValues(input)
  const out = new Array(values.length).fill(null)
  if (values.length < period) return out
  const k = 2 / (period + 1)
  let seed = 0
  for (let i = 0; i < period; i++) seed += values[i]
  let prev = seed / period
  out[period - 1] = prev
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k)
    out[i] = prev
  }
  return out
}

/** EMA over a series that already has leading nulls, preserving alignment. */
function emaOfSeries (series, period) {
  const out = new Array(series.length).fill(null)
  const offset = series.findIndex((v) => v !== null)
  if (offset === -1) return out
  const dense = []
  for (let i = offset; i < series.length; i++) {
    const v = series[i]
    if (v === null) throw new Error('emaOfSeries: hole in the middle of series')
    dense.push(v)
  }
  const denseEma = ema(dense, period)
  for (let i = 0; i < denseEma.length; i++) out[offset + i] = denseEma[i]
  return out
}

function rsiFrom (avgGain, avgLoss) {
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}

/** Wilder's RSI. First non-null at index `period`. */
export function rsi (input, period = 14) {
  if (period <= 0) throw new Error('rsi: period must be > 0')
  const values = toValues(input)
  const out = new Array(values.length).fill(null)
  if (values.length <= period) return out

  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1]
    if (d >= 0) gain += d
    else loss -= d
  }
  let avgGain = gain / period
  let avgLoss = loss / period
  out[period] = rsiFrom(avgGain, avgLoss)

  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1]
    const g = d > 0 ? d : 0
    const l = d < 0 ? -d : 0
    avgGain = (avgGain * (period - 1) + g) / period
    avgLoss = (avgLoss * (period - 1) + l) / period
    out[i] = rsiFrom(avgGain, avgLoss)
  }
  return out
}

/** MACD. The signal line is an EMA of the MACD LINE, not of price. */
export function macd (input, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  if (fastPeriod >= slowPeriod) throw new Error('macd: fast must be < slow')
  const values = toValues(input)
  const fast = ema(values, fastPeriod)
  const slow = ema(values, slowPeriod)

  const line = new Array(values.length).fill(null)
  for (let i = 0; i < values.length; i++) {
    const f = fast[i]
    const s = slow[i]
    if (f !== null && s !== null) line[i] = f - s
  }

  const signalLine = emaOfSeries(line, signalPeriod)
  const histogram = new Array(values.length).fill(null)
  for (let i = 0; i < values.length; i++) {
    const m = line[i]
    const s = signalLine[i]
    if (m !== null && s !== null) histogram[i] = m - s
  }
  return { macdLine: line, signalLine, histogram }
}
