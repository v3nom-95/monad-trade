import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runBacktest, generateSignals, maxDrawdown, DEFAULT_STRATEGY } from '../backtest.ts'

const mkCandles = (closes, t0 = 1700000000000, stepMs = 60000) =>
  closes.map((c, i) => ({ t: t0 + i * stepMs, o: c, h: c, l: c, c, v: 1 }))

test('determinism: same input twice -> identical output', () => {
  const candles = mkCandles(Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 5) * 10))
  const a = JSON.stringify(runBacktest(candles))
  const b = JSON.stringify(runBacktest(candles))
  assert.equal(a, b, 'two runs on identical input produced different output — non-deterministic')
})

test('empty input: well-formed empty result, no crash', () => {
  const res = runBacktest([])
  assert.deepEqual(res.trades, [])
  assert.equal(res.tradeCount, 0)
  assert.equal(res.totalPnl, 0)
  assert.equal(res.maxDrawdown, 0)
})

test('single candle: no crash, no trades possible', () => {
  const res = runBacktest(mkCandles([42]))
  assert.equal(res.trades.length, 0)
  assert.equal(res.equityCurve.length, 1)
})

test('monotonically rising equity curve -> maxDrawdown === 0, not NaN', () => {
  // Steady uptrend with long-biased default strategy: equity should never decline.
  const candles = mkCandles(Array.from({ length: 80 }, (_, i) => 100 + i))
  const res = runBacktest(candles)
  assert.ok(
    typeof res.maxDrawdown === 'number' && !Number.isNaN(res.maxDrawdown),
    `maxDrawdown leaked NaN (${res.maxDrawdown})`
  )
  const eq = res.equityCurve
  if (eq.length > 1 && eq.every((p, i) => i === 0 || p.equity >= eq[i - 1].equity)) {
    assert.ok(res.maxDrawdown === 0, `rising equity but maxDrawdown=${res.maxDrawdown}, expected 0`)
  }
})

test('maxDrawdown helper: rising curve -> 0; known drop -> correct fraction', () => {
  const pt = (t, equity) => ({ t, equity })
  assert.equal(maxDrawdown([pt(0, 100), pt(1, 110), pt(2, 120)]), 0)
  // Peak 120 -> trough 90: drawdown = 30/120 = 0.25
  const dd = maxDrawdown([pt(0, 100), pt(1, 120), pt(2, 90), pt(3, 95)])
  assert.ok(Math.abs(dd - 0.25) < 1e-12, `maxDrawdown=${dd}, expected 0.25`)
})

test('generateSignals: no lookahead — signal at i uses only data up to i', () => {
  const base = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 5) * 10)
  const s1 = generateSignals(mkCandles(base), DEFAULT_STRATEGY)
  // Change the LAST candle only; earlier signals must be unchanged.
  const modified = [...base]
  modified[59] += 500
  const s2 = generateSignals(mkCandles(modified), DEFAULT_STRATEGY)
  for (let i = 0; i < 59; i++) {
    assert.equal(s1[i], s2[i], `signal[${i}] changed when a LATER candle changed — lookahead bug`)
  }
})

test('short trades are flagged executable:false; executable P&L differs from full P&L', () => {
  // Steady downtrend should produce short signals under SMA cross.
  const candles = mkCandles(Array.from({ length: 120 }, (_, i) => 200 - i))
  const res = runBacktest(candles)
  assert.ok(Array.isArray(res.trades))

  const shortTrades = res.trades.filter((tr) => tr.side === 'short')
  assert.ok(shortTrades.length > 0, 'downtrend produced no short trades — cannot verify executable flag')
  for (const tr of shortTrades) {
    assert.equal(tr.executable, false, 'short trade marked executable:true — spot cannot short')
  }

  assert.notEqual(
    res.executablePnl,
    res.totalPnl,
    'executable-only P&L equals full P&L despite shorts existing — dishonest numbers'
  )
  assert.ok(Math.abs(res.totalPnl - res.trades.reduce((s, t) => s + t.pnl, 0)) < 1e-6)
  assert.equal(res.nonExecutableTradeCount, shortTrades.length)
})

test('allowShort:false collapses shorts to flat instead of hiding them silently', () => {
  const candles = mkCandles(Array.from({ length: 120 }, (_, i) => 200 - i))
  const noShort = { ...DEFAULT_STRATEGY, allowShort: false }
  const res = runBacktest(candles, noShort)
  for (const tr of res.trades) {
    assert.notEqual(tr.side, 'short', 'short trade emitted despite allowShort:false')
  }
})

test('result shape matches BacktestResult contract', () => {
  const res = runBacktest(mkCandles(Array.from({ length: 60 }, (_, i) => 100 + (i % 7))))
  for (const key of [
    'trades', 'equityCurve', 'winRate', 'totalPnl', 'maxDrawdown',
    'tradeCount', 'firstCandleT', 'lastCandleT', 'source',
    'executablePnl', 'executableWinRate', 'executableTradeCount', 'nonExecutableTradeCount'
  ]) {
    assert.ok(key in res, `BacktestResult missing field: ${key}`)
  }
  assert.ok(res.winRate >= 0 && res.winRate <= 1, `winRate out of [0,1]: ${res.winRate}`)
  assert.ok(res.maxDrawdown >= 0 && res.maxDrawdown <= 1, `maxDrawdown out of [0,1]: ${res.maxDrawdown}`)
  assert.equal(typeof res.firstCandleT, 'number')
  assert.equal(typeof res.lastCandleT, 'number')
})
