/**
 * Indicators. Pure functions, no side effects, no clock, no randomness.
 *
 * ALIGNMENT CONTRACT — the thing most likely to corrupt every downstream
 * number if you get it wrong: every function returns an array the SAME LENGTH
 * as its input. Positions inside the warm-up window are `null`. Nothing is
 * truncated and nothing is shifted, so `out[i]` always describes `input[i]`.
 */

import type { Candle } from "./types.ts";

export type Series = Array<number | null>;

/**
 * Indicators accept either raw closes or candles. Candle[] is the contract the
 * rest of the quant track uses; number[] is accepted so indicators can be
 * composed over derived series.
 */
export type PriceInput = Candle[] | number[];

export const closes = (candles: Candle[]): number[] => candles.map((c) => c.c);

const toValues = (input: PriceInput): number[] =>
  input.length === 0
    ? []
    : typeof input[0] === "number"
      ? (input as number[])
      : (input as Candle[]).map((c) => c.c);

/** Simple moving average. First non-null at index `period - 1`. */
export function sma(input: PriceInput, period: number): Series {
  if (period <= 0) throw new Error("sma: period must be > 0");
  const values = toValues(input);
  const out: Series = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/**
 * Exponential moving average, seeded with the SMA of the first `period`
 * values. First non-null at index `period - 1`.
 */
export function ema(input: PriceInput, period: number): Series {
  if (period <= 0) throw new Error("ema: period must be > 0");
  const values = toValues(input);
  const out: Series = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  let prev = seed / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/**
 * EMA over a series that already has leading nulls (used for the MACD signal
 * line). Alignment is preserved relative to the ORIGINAL array: the offset of
 * the first non-null input is carried through.
 */
function emaOfSeries(series: Series, period: number): Series {
  const out: Series = new Array(series.length).fill(null);
  const offset = series.findIndex((v) => v !== null);
  if (offset === -1) return out;
  const dense: number[] = [];
  for (let i = offset; i < series.length; i++) {
    const v = series[i];
    if (v === null) throw new Error("emaOfSeries: hole in the middle of series");
    dense.push(v);
  }
  const denseEma = ema(dense, period);
  for (let i = 0; i < denseEma.length; i++) out[offset + i] = denseEma[i];
  return out;
}

/**
 * Wilder's RSI. First non-null at index `period` — it takes `period` price
 * CHANGES, and there are only `i` changes available at index `i`.
 */
export function rsi(input: PriceInput, period = 14): Series {
  if (period <= 0) throw new Error("rsi: period must be > 0");
  const values = toValues(input);
  const out: Series = new Array(values.length).fill(null);
  if (values.length <= period) return out;

  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = rsiFrom(avgGain, avgLoss);

  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = rsiFrom(avgGain, avgLoss);
  }
  return out;
}

function rsiFrom(avgGain: number, avgLoss: number): number {
  // No losses in the window => RSI is 100 by definition (avoids /0).
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export interface MacdResult {
  /** Named `macdLine`/`signalLine` rather than `macd`/`signal` so callers do
   *  not end up writing `macd(...).macd`, and to match the test fixtures. */
  macdLine: Series;
  signalLine: Series;
  histogram: Series;
}

/**
 * MACD. With the defaults: macd line first non-null at index 25,
 * signal at 33, histogram at 33.
 */
export function macd(
  input: PriceInput,
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): MacdResult {
  if (fastPeriod >= slowPeriod) throw new Error("macd: fast must be < slow");
  const values = toValues(input);
  const fast = ema(values, fastPeriod);
  const slow = ema(values, slowPeriod);

  const line: Series = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    const f = fast[i];
    const s = slow[i];
    if (f !== null && s !== null) line[i] = f - s;
  }

  const signalLine = emaOfSeries(line, signalPeriod);
  const histogram: Series = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    const m = line[i];
    const s = signalLine[i];
    if (m !== null && s !== null) histogram[i] = m - s;
  }
  return { macdLine: line, signalLine, histogram };
}
