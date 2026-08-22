/**
 * DexScreener lookups for watchlist rows that track a raw token contract
 * address instead of a centrally-listed CCXT symbol.
 *
 * Called straight from the browser: DexScreener serves
 * `access-control-allow-origin: *` and needs no API key, so this needs no
 * backend route. It deliberately does NOT go through `@/utils/request` — that
 * helper prefixes `/api` and attaches our auth headers, neither of which
 * belongs on a third-party host.
 */

const BASE = 'https://api.dexscreener.com/latest/dex/tokens'
const TIMEOUT_MS = 8000

/** EVM contract address, checksummed or lowercase. */
export const TOKEN_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/

/** Marks a watchlist row as DEX-tracked: `exchange_id` = `dex:<chainId>`. */
export const DEX_EXCHANGE_PREFIX = 'dex:'

export function isTokenAddress (value) {
  return TOKEN_ADDRESS_RE.test(String(value || '').trim())
}

export function isDexRow (row) {
  return String(row?.exchange_id || '').startsWith(DEX_EXCHANGE_PREFIX)
}

/** Contract address for a DEX row, or '' when the row is a normal CEX symbol. */
export function dexRowAddress (row) {
  return isDexRow(row) ? String(row.instrument_id || '').trim() : ''
}

async function getJson (url) {
  // AbortController rather than a bare fetch: a hung third-party request must
  // not leave the caller spinning forever.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`DexScreener HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * An address can appear in many pairs across several chains and DEXes — the
 * proven MON address returns 30. Deepest liquidity wins, since that is the pair
 * whose price is least likely to be noise. Pairs where the address is the quote
 * side are only considered if it is never the base side.
 */
export function pickCanonicalPair (pairs, address) {
  const list = Array.isArray(pairs) ? pairs.filter(Boolean) : []
  if (!list.length) return null
  const wanted = String(address || '').toLowerCase()
  const asBase = list.filter(p => String(p.baseToken?.address || '').toLowerCase() === wanted)
  const candidates = asBase.length ? asBase : list
  return candidates
    .slice()
    .sort((a, b) => Number(b.liquidity?.usd || 0) - Number(a.liquidity?.usd || 0))[0] || null
}

function normalizePair (pair, address) {
  const wanted = String(address || '').toLowerCase()
  const baseIsWanted = String(pair.baseToken?.address || '').toLowerCase() === wanted
  const token = baseIsWanted ? pair.baseToken : (pair.quoteToken || pair.baseToken)
  const counter = baseIsWanted ? pair.quoteToken : pair.baseToken
  const symbol = String(token?.symbol || '').toUpperCase()
  const quoteSymbol = String(counter?.symbol || '').toUpperCase()
  return {
    // Echo back the address as DexScreener spells it, so the stored value is
    // checksummed even when the user pasted lowercase.
    address: token?.address || address,
    name: token?.name || symbol,
    symbol,
    quoteSymbol,
    // Watchlist rows are keyed on `market:symbol`, so DEX rows need a pair-like
    // symbol to sit alongside the CEX ones.
    pairSymbol: quoteSymbol ? `${symbol}/${quoteSymbol}` : symbol,
    chainId: pair.chainId || '',
    dexId: pair.dexId || '',
    pairAddress: pair.pairAddress || '',
    priceUsd: Number(pair.priceUsd || 0),
    change24h: Number(pair.priceChange?.h24 || 0),
    liquidityUsd: Number(pair.liquidity?.usd || 0),
    pairCount: 0,
    url: pair.url || ''
  }
}

/**
 * Resolve a contract address to its canonical (deepest-liquidity) pair.
 * Returns null when the address is not on any DEX DexScreener indexes.
 * Throws only on transport failure, so callers can tell "not found" from "down".
 */
export async function resolveTokenByAddress (address) {
  const addr = String(address || '').trim()
  const data = await getJson(`${BASE}/${encodeURIComponent(addr)}`)
  const pair = pickCanonicalPair(data?.pairs, addr)
  if (!pair) return null
  const token = normalizePair(pair, addr)
  token.pairCount = Array.isArray(data.pairs) ? data.pairs.length : 0
  return token
}

/**
 * Prices for DEX-tracked rows, keyed by lowercase address.
 *
 * One request per address rather than DexScreener's comma-separated batch
 * form: that form caps the response at 30 pairs total, so a single deep token
 * would crowd every other address out of the result.
 *
 * Never throws — a DEX outage must not take down pricing for CEX rows.
 */
export async function fetchDexPrices (addresses) {
  const unique = [...new Set((addresses || [])
    .map(a => String(a || '').trim())
    .filter(isTokenAddress))]
  const out = {}
  await Promise.all(unique.map(async addr => {
    try {
      const token = await resolveTokenByAddress(addr)
      if (token && token.priceUsd > 0) {
        out[addr.toLowerCase()] = { price: token.priceUsd, change: token.change24h }
      }
    } catch (e) {
      // Leave the address out of the map; the row renders without a price.
    }
  }))
  return out
}
