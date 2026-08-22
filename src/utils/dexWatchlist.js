/**
 * Local persistence for DEX-tracked watchlist rows.
 *
 * These cannot go through /api/market/watchlist/add: that endpoint validates
 * the symbol against the CCXT universe and rejects anything not centrally
 * listed ("Symbol 'X' not found on Crypto"), which is exactly the case a
 * DEX-only token is. Storing them in localStorage keeps the feature
 * frontend-only, at the cost of being per-browser rather than per-account.
 */

import { isTokenAddress } from '@/api/dexscreener'

const KEY_PREFIX = 'monadtrade.dex-watchlist.v1'

function storageKey (userId) {
  return userId ? `${KEY_PREFIX}.${userId}` : KEY_PREFIX
}

export function loadDexWatchlist (userId) {
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(row => row && isTokenAddress(row.instrument_id))
  } catch (e) {
    return []
  }
}

function persist (userId, rows) {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(rows))
  } catch (e) {
    // Quota or private-mode failure: the row just will not survive a reload.
  }
}

/** Returns false when the address is already tracked. */
export function addDexWatchlistRow (userId, row) {
  if (!row || !isTokenAddress(row.instrument_id)) return false
  const rows = loadDexWatchlist(userId)
  const addr = String(row.instrument_id).toLowerCase()
  if (rows.some(r => String(r.instrument_id).toLowerCase() === addr)) return false
  rows.push(row)
  persist(userId, rows)
  return true
}

export function removeDexWatchlistRow (userId, address) {
  const addr = String(address || '').toLowerCase()
  const rows = loadDexWatchlist(userId).filter(
    r => String(r.instrument_id).toLowerCase() !== addr
  )
  persist(userId, rows)
}
