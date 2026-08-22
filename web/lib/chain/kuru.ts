import type { Address } from "viem";

import orderBookAbiRaw from "./__probe__/OrderBook.abi.json";

/**
 * Kuru CLOB on Monad TESTNET (chainId 10143). Verified deployed via eth_getCode.
 * TESTNET ONLY — no mainnet address appears anywhere in this file.
 */
export const KURU_MARKET_MON_USDC: Address =
  "0xa241896A7Dbe8a550D2E5fF7A914bB1989ceD2D9";
export const KURU_ORDERBOOK_IMPL: Address =
  "0x72caE0a99C19B574e8a6De558F43fc1D019c9374";
export const KURU_MARGIN_ACCOUNT: Address =
  "0xd029C2D98ff85D8F64799017fE00a59B1159CE02";
export const USDC_TESTNET: Address =
  "0x3bA3d39AFcf8bb994f7964B3e0171Ea2Ba361570";

/**
 * Official ABI from github.com/Kuru-Labs/kuru-sdk. The file is a Hardhat
 * artifact, so the ABI lives under `.abi` — not the bare array it looks like.
 * The market is a proxy; this is the implementation ABI, which is what you call
 * the proxy with.
 */
export const orderBookAbi = (
  orderBookAbiRaw as unknown as { abi: readonly unknown[] }
).abi;

export const EXPLORER_TX = (hash: string) =>
  `https://testnet.monadscan.com/tx/${hash}`;

/**
 * Live values read from getMarketParams() on the market above.
 *
 *   pricePrecision 1e8   sizePrecision 1e10   tickSize 100
 *   minSize 2e12 raw = 200 MON        maxSize 2e18 raw
 *   baseAsset  address(0)  = NATIVE MON, 18 decimals
 *   quoteAsset USDC        = 6 decimals
 *   takerFeeBps 0          makerFeeBps 0
 *
 * These are duplicated here as the defaults the UI reasons about, but the panel
 * re-reads them on chain — a hardcoded scale that drifts is how you send the
 * wrong amount.
 */
export const MARKET_PARAMS_FALLBACK = {
  pricePrecision: 100_000_000n, // 1e8
  sizePrecision: 10_000_000_000n, // 1e10
  tickSize: 100n,
  minSize: 2_000_000_000_000n, // 200 MON
  baseDecimals: 18,
  quoteDecimals: 6,
} as const;

/** MON amount -> uint96 `size`, scaled by sizePrecision. */
export function toRawSize(monAmount: string, sizePrecision: bigint): bigint {
  const [whole, frac = ""] = monAmount.split(".");
  const digits = sizePrecision.toString().length - 1;
  const padded = (frac + "0".repeat(digits)).slice(0, digits);
  return BigInt(whole || "0") * sizePrecision + BigInt(padded || "0");
}

/** USDC-per-MON -> uint32 `price`, scaled by pricePrecision. */
export function toRawPrice(usdcPrice: string, pricePrecision: bigint): bigint {
  const [whole, frac = ""] = usdcPrice.split(".");
  const digits = pricePrecision.toString().length - 1;
  const padded = (frac + "0".repeat(digits)).slice(0, digits);
  return BigInt(whole || "0") * pricePrecision + BigInt(padded || "0");
}

/** Price must sit on a tick boundary or the contract reverts with TickSizeError. */
export function isOnTick(rawPrice: bigint, tickSize: bigint): boolean {
  return tickSize === 0n || rawPrice % tickSize === 0n;
}

/**
 * bestBidAsk() sentinels for a book with nothing in it: bid = uint256 max,
 * ask = 0. An empty book does NOT make market orders revert — they succeed and
 * fill zero — so this has to be checked before any price is shown.
 */
export const NO_BID = (1n << 256n) - 1n;
export function isBookEmpty(bid?: bigint, ask?: bigint): boolean {
  if (bid === undefined || ask === undefined) return false;
  return bid === NO_BID && ask === 0n;
}
