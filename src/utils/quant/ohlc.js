/**
 * OHLC ingest for MON/USDT. Straight port of proj_monad/web/lib/quant/ohlc.ts.
 *
 * Bybit v5 public spot klines, fetched DIRECTLY from the browser — the endpoint
 * is public and CORS-enabled, so this deliberately does NOT go through
 * @/utils/request (that prefixes /api and attaches our auth headers, neither of
 * which belongs on a third-party host).
 *
 * WHY BYBIT AND NOT A MONAD DEX: the app executes on Monad testnet, whose pool
 * prices are arbitrary and have no history. A strategy backtested on testnet
 * prices would be meaningless, so strategies are evaluated against the real MON
 * market.
 */

const BYBIT_BASE = 'https://api.bybit.com/v5/market/kline'
const MAX_LIMIT = 1000
const MINUTE = 60000

const INTERVAL_MS = {
  1: MINUTE, 3: 3 * MINUTE, 5: 5 * MINUTE, 15: 15 * MINUTE,
  30: 30 * MINUTE, 60: 60 * MINUTE, 120: 120 * MINUTE,
  240: 240 * MINUTE, 360: 360 * MINUTE, 720: 720 * MINUTE,
  D: 24 * 60 * MINUTE,
  W: 7 * 24 * 60 * MINUTE,
  M: 30 * 24 * 60 * MINUTE
}

const DAY_MS = INTERVAL_MS.D

function rowToCandle (r) {
  return { t: Number(r[0]), o: Number(r[1]), h: Number(r[2]), l: Number(r[3]), c: Number(r[4]), v: Number(r[5]) }
}

async function fetchPage (symbol, interval, start, end) {
  const url =
    `${BYBIT_BASE}?category=spot&symbol=${encodeURIComponent(symbol)}` +
    `&interval=${interval}&start=${start}&end=${end}&limit=${MAX_LIMIT}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`bybit kline HTTP ${res.status}`)
  const json = await res.json()
  if (json.retCode !== 0) throw new Error(`bybit kline error: ${json.retMsg}`)
  const list = (json.result && json.result.list) || []
  // Bybit hands back newest-first; we work oldest-first everywhere.
  return list.map(rowToCandle).sort((a, b) => a.t - b.t)
}

const cacheKey = (source, start, end) =>
  // End is bucketed by day so "now" does not produce a fresh key every call.
  `quant-ohlc:${source}:${start}:${Math.floor(end / DAY_MS)}`

function readCache (source, start, end) {
  try {
    const raw = window.localStorage.getItem(cacheKey(source, start, end))
    return raw ? JSON.parse(raw) : null
  } catch (e) {
    return null // a cold or corrupt cache is never fatal
  }
}

function writeCache (source, start, end, set) {
  try {
    window.localStorage.setItem(cacheKey(source, start, end), JSON.stringify(set))
  } catch (e) {
    // Caching is an optimisation. Never let it break a backtest.
  }
}

/**
 * Fetch the full available history for a symbol/interval.
 *
 * PAGINATES BACKWARD. Bybit caps a windowed request at `limit` and returns the
 * most RECENT bars in that window, so paginating FORWARD from `start` silently
 * yields only the newest 1000 and nothing older. Moving the `end` cursor back
 * past the oldest bar received is what actually reaches the listing date.
 */
export async function fetchCandles (opts = {}) {
  const symbol = opts.symbol || 'MONUSDT'
  const interval = opts.interval || '60'
  const step = INTERVAL_MS[interval]
  // 2025-01-01 — before any MON listing, so we discover the real first candle.
  const start = opts.start || Date.UTC(2025, 0, 1)
  const end = opts.end || Date.now()
  const source = `bybit:spot:${symbol}:${interval}`

  if (!opts.noCache) {
    const hit = readCache(source, start, end)
    if (hit) return hit
  }

  const seen = new Map()
  let cursorEnd = end
  // Bounded so a misbehaving endpoint can never spin forever.
  for (let page = 0; page < 200; page++) {
    const batch = await fetchPage(symbol, interval, start, cursorEnd)
    if (batch.length === 0) break
    let added = 0
    for (const c of batch) {
      if (!seen.has(c.t)) {
        seen.set(c.t, c)
        added++
      }
    }
    const oldest = batch[0].t
    const nextEnd = oldest - step
    if (added === 0 || oldest <= start || nextEnd <= start) break
    cursorEnd = nextEnd
  }

  const candles = [...seen.values()].sort((a, b) => a.t - b.t)
  // Drop the still-forming final bar, or two runs minutes apart disagree.
  if (!opts.includeIncomplete && candles.length > 0) {
    const lastOpen = candles[candles.length - 1].t
    if (lastOpen + step > end) candles.pop()
  }
  if (candles.length === 0) {
    throw new Error(`no candles returned for ${source} — check the symbol is listed on Bybit spot`)
  }

  const set = {
    candles,
    source,
    symbol,
    interval,
    firstCandleT: candles[0].t,
    lastCandleT: candles[candles.length - 1].t
  }
  if (!opts.noCache) writeCache(source, start, end, set)
  return set
}

/** Human-readable statement of what history actually exists. */
export function describeCoverage (set) {
  const days = (set.lastCandleT - set.firstCandleT) / DAY_MS
  const from = new Date(set.firstCandleT).toISOString().slice(0, 10)
  const to = new Date(set.lastCandleT).toISOString().slice(0, 10)
  const months = days / 30.44
  return (
    `${set.source}: ${set.candles.length} bars, ${from} to ${to} ` +
    `(${days.toFixed(0)} days / ${months.toFixed(1)} months)`
  )
}
