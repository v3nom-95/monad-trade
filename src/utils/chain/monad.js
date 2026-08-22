/**
 * Monad TESTNET chain layer. Ported from proj_monad/web/lib/chain/*.
 *
 * Deliberately ZERO dependencies: everything here is window.ethereum JSON-RPC
 * plus two hand-encoded calls. viem/wagmi would work but wagmi is React-only
 * and pulling viem into a Vue 2.7 build buys nothing for two functions whose
 * ABI encoding is a selector plus fixed 32-byte words.
 *
 * TESTNET ONLY — no mainnet RPC or address appears in this file.
 */

export const CHAIN_ID = 10143
export const CHAIN_ID_HEX = '0x279f'
/** Monad MAINNET. Present only so the guard can name it — one digit off. */
export const MAINNET_CHAIN_ID = 143
export const RPC_URL = 'https://testnet-rpc.monad.xyz'
export const EXPLORER = 'https://testnet.monadexplorer.com'

export const ADD_CHAIN_PARAMS = {
  chainId: CHAIN_ID_HEX,
  chainName: 'Monad Testnet',
  rpcUrls: [RPC_URL],
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  blockExplorerUrls: [EXPLORER]
}

/** Kuru MarginAccount — the collateral layer of the Kuru DEX. */
export const MARGIN_ACCOUNT = '0xd029C2D98ff85D8F64799017fE00a59B1159CE02'
/** MarginAccount addresses native MON as the zero address. */
export const NATIVE_TOKEN = '0x0000000000000000000000000000000000000000'

const SEL_DEPOSIT = '0x8340f549' // deposit(address,address,uint256)
const SEL_GET_BALANCE = '0xd4fac45d' // getBalance(address,address)

/**
 * NO WITHDRAW EXISTS on the deployed MarginAccount implementation. All 41
 * selectors in its bytecode were enumerated; deposit and getBalance are there,
 * no withdraw of any standard shape is. The UI must say so BEFORE depositing.
 */
export const HAS_VERIFIED_WITHDRAW = false

/**
 * Monad's reserve floor. Below 10 MON an account is rate-limited to one tx per
 * ~1.2s, and a tx reverts if the ending balance would fall under
 * min(starting_balance, 10 MON). The emptying-transaction exception still lets
 * an UNDELEGATED account spend below it, so this is a WARNING, never a block.
 */
export const RESERVE_FLOOR_WEI = 10n * 10n ** 18n

// --- provider ---------------------------------------------------------------

export function hasWallet () {
  return typeof window !== 'undefined' && !!window.ethereum
}

export function rpc (method, params = []) {
  if (!hasWallet()) return Promise.reject(new Error('No browser wallet detected.'))
  return window.ethereum.request({ method, params })
}

/** Read-only calls go to the public RPC so they work before a wallet connects. */
export async function publicRpc (method, params = []) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  })
  const json = await res.json()
  if (json.error) throw new Error(json.error.message)
  return json.result
}

// --- encoding ---------------------------------------------------------------

const pad = (hex) => hex.replace(/^0x/, '').toLowerCase().padStart(64, '0')
const addrWord = (a) => pad(a)
const uintWord = (v) => pad(BigInt(v).toString(16))

export function encodeDeposit (user, token, amountWei) {
  return SEL_DEPOSIT + addrWord(user) + addrWord(token) + uintWord(amountWei)
}

export function encodeGetBalance (user, token) {
  return SEL_GET_BALANCE + addrWord(user) + addrWord(token)
}

// --- formatting -------------------------------------------------------------

export const toWei = (mon) => {
  const [whole, frac = ''] = String(mon).trim().split('.')
  const padded = (frac + '0'.repeat(18)).slice(0, 18)
  return BigInt(whole || '0') * 10n ** 18n + BigInt(padded || '0')
}

/** Truncates rather than rounds, so a displayed balance is never overstated. */
export function formatMon (wei, dp = 4) {
  const v = BigInt(wei)
  const whole = v / 10n ** 18n
  const frac = (v % 10n ** 18n).toString().padStart(18, '0').slice(0, dp)
  return dp > 0 ? `${whole}.${frac}` : String(whole)
}

export const shortAddress = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`

// --- gas --------------------------------------------------------------------

/**
 * Estimate plus 18%. NEVER 2x: Monad charges gas on the LIMIT, not on gas
 * used, so padding is money taken from the user rather than refunded.
 */
export const padGasLimit = (estimate) => (BigInt(estimate) * 118n) / 100n

/** Worst case is the only honest number to show before signing. */
export const worstCaseGasWei = (gasLimit, maxFeePerGas) =>
  BigInt(gasLimit) * BigInt(maxFeePerGas)
