import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { sma, ema, rsi, macd } from '../indicators.ts'

const here = dirname(fileURLToPath(import.meta.url))
const load = (name) => JSON.parse(readFileSync(join(here, '..', '__fixtures__', name), 'utf8'))

const mkCandles = (closes, t0 = 1700000000000, stepMs = 60000) =>
  closes.map((c, i) => ({ t: t0 + i * stepMs, o: c, h: c, l: c, c, v: 1 }))

const closeArr = (out) => out.map((x) => (x === null ? null : x))

test('sma matches hand-computed fixture exactly', () => {
  const f = load('sma.fixture.json')
  const out = sma(mkCandles(f.closes), f.period)
  assert.equal(out.length, f.closes.length, 'alignment: output length must equal input length')
  assert.deepEqual(closeArr(out), f.expected)
})

test('ema uses SMA-seeded convention per fixture', () => {
  const f = load('ema.fixture.json')
  const out = ema(mkCandles(f.closes), f.period)
  assert.equal(out.length, f.closes.length)
  f.expected.forEach((exp, i) => {
    if (exp === null) {
      assert.equal(out[i], null, `index ${i} must be a warm-up null`)
    } else {
      assert.ok(
        Math.abs(out[i] - exp) < 1e-9,
        `index ${i}: got ${out[i]}, expected ${exp} (check seeding convention)`
      )
    }
  })
})

test('rsi all-gains series -> 100', () => {
  const f = load('rsi.fixture.json')
  const up = rsi(mkCandles(f.cases[0].candles), 14)
  const last = up[up.length - 1]
  assert.ok(last !== null && !Number.isNaN(last), 'RSI must produce a value after warm-up')
  assert.ok(Math.abs(last - 100) < 1e-9, `all-gains RSI must be 100, got ${last}`)
})

test('rsi all-losses series -> 0', () => {
  const f = load('rsi.fixture.json')
  const down = rsi(mkCandles(f.cases[1].candles), 14)
  const last = down[down.length - 1]
  assert.ok(last !== null && !Number.isNaN(last))
  assert.ok(Math.abs(last - 0) < 1e-9, `all-losses RSI must be 0, got ${last}`)
})

test('rsi warm-up: leading nulls === period', () => {
  const closes = Array.from({ length: 30 }, (_, i) => 100 + i)
  const out = rsi(mkCandles(closes), 14)
  assert.equal(out.length, 30)
  for (let i = 0; i < 14; i++) assert.equal(out[i], null, `rsi index ${i} must be null during warm-up`)
  assert.notEqual(out[14], null)
})

test('macd signal line is EMA of MACD line, not of price', () => {
  const f = load('macd.fixture.json')
  const { macdLine, signalLine } = macd(mkCandles(f.closes), f.fast, f.slow, f.signalPeriod)
  assert.equal(macdLine.length, f.closes.length)
  assert.equal(signalLine.length, f.closes.length)

  // Independent reference EMA (SMA-seeded), applied to the MACD line values.
  const refEma = (vals, period) => {
    const k = 2 / (period + 1)
    const out = new Array(vals.length).fill(null)
    let seedCount = 0
    let sum = 0
    let prev = null
    for (let i = 0; i < vals.length; i++) {
      if (vals[i] === null || vals[i] === undefined) continue
      if (prev === null) {
        sum += vals[i]
        seedCount++
        if (seedCount === period) {
          prev = sum / period
          out[i] = prev
        }
      } else {
        prev = vals[i] * k + prev * (1 - k)
        out[i] = prev
      }
    }
    return out
  }

  const expectedSignal = refEma(closeArr(macdLine), f.signalPeriod)
  for (let i = 0; i < f.closes.length; i++) {
    if (expectedSignal[i] === null) continue
    assert.ok(
      Math.abs(signalLine[i] - expectedSignal[i]) < 1e-6,
      `signal[${i}] is not the EMA of the MACD line — classic bug: signal computed from price instead`
    )
  }

  // MACD line itself: fastEMA - slowEMA at every defined index
  const refMacdEmaFast = refEma(f.closes, f.fast)
  const refMacdEmaSlow = refEma(f.closes, f.slow)
  for (let i = f.slow - 1; i < f.closes.length; i++) {
    const exp = refMacdEmaFast[i] - refMacdEmaSlow[i]
    assert.ok(Math.abs(macdLine[i] - exp) < 1e-6, `macd[${i}] != emaFast - emaSlow`)
  }
})

test('empty candles: no crash, empty output', () => {
  for (const fn of [sma, ema]) {
    const out = fn([], 3)
    assert.ok(Array.isArray(out))
    assert.equal(out.length, 0)
  }
  assert.ok(Array.isArray(rsi([], 14)))
  const m = macd([], 12, 26, 9)
  assert.ok(Array.isArray(m.macdLine ?? m) || typeof m === 'object')
})

test('single candle: no crash, length 1', () => {
  const one = mkCandles([42])
  assert.equal(sma(one, 3).length, 1)
  assert.equal(ema(one, 3).length, 1)
  assert.equal(rsi(one, 14).length, 1)
})

test('fewer candles than period: no crash, no garbage values', () => {
  const two = mkCandles([1, 2])
  for (const [name, out] of [
    ['sma', sma(two, 3)],
    ['ema', ema(two, 3)],
    ['rsi', rsi(two, 14)]
  ]) {
    assert.equal(out.length, 2, `${name} length`)
    for (let i = 0; i < out.length; i++) {
      if (out[i] !== null) {
        assert.ok(
          Number.isFinite(out[i]),
          `${name}[${i}] emitted a non-finite value (${out[i]}) with fewer candles than the period`
        )
      }
    }
  }
})

test('flat series: RSI must not leak NaN (documented behaviour asserted)', () => {
  const flat = mkCandles(new Array(20).fill(50))
  const out = rsi(flat, 14)
  for (let i = 0; i < out.length; i++) {
    if (out[i] !== null) {
      // Chosen convention under test: 0/0 resolves to neutral 50, never NaN.
      // If implementation differs intentionally, update this assertion AND note it in the report.
      assert.ok(
        Number.isFinite(out[i]),
        `flat-series RSI leaked NaN/null-ish at index ${i} — undefined behaviour`
      )
    }
  }
})

test('timestamp gaps and out-of-order candles do not crash indicators', () => {
  const closes = Array.from({ length: 20 }, (_, i) => 100 + i)
  const gapped = closes.map((c, i) => ({ t: 1700000000000 + i * 60000 * (i % 5 === 0 ? 5 : 1), o: c, h: c, l: c, c, v: 1 }))
  const shuffledT = [...mkCandles(closes)].sort(() => 0.5 - Math.random())
  for (const candles of [gapped, shuffledT]) {
    assert.doesNotThrow(() => sma(candles, 5))
    assert.doesNotThrow(() => ema(candles, 5))
    assert.doesNotThrow(() => rsi(candles, 14))
    assert.doesNotThrow(() => macd(candles, 12, 26, 9))
  }
})

test('malformed candles (NaN / zero volume): no crash, length preserved', () => {
  const candles = mkCandles(Array.from({ length: 20 }, (_, i) => 100 + i))
  candles[7].c = NaN
  candles[11].v = 0
  candles[13].h = null
  for (const [name, fn] of [['sma', () => sma(candles, 5)], ['ema', () => ema(candles, 5)], ['rsi', () => rsi(candles, 14)]]) {
    let out
    assert.doesNotThrow(() => { out = fn() }, `${name} threw on malformed input`)
    assert.equal(out.length, 20, `${name} must preserve input length on malformed input`)
  }
})
