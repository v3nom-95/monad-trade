import { formatEther, parseEther } from "viem";

/**
 * Monad's reserve balance rule (docs.monad.xyz/developer-essentials/reserve-balance):
 *
 * - A transaction reverts if the ending balance (before gas refunds) drops
 *   below min(starting_balance, 10 MON).
 * - EMPTYING-TRANSACTION EXCEPTION: an *undelegated* account that has sent no
 *   other transaction in the past 3 blocks CAN spend below the reserve. This is
 *   what lets a user withdraw their whole balance.
 * - Accounts under 10 MON are rate-limited to one transaction per 3 blocks
 *   (~1.2 s).
 * - EIP-7702 *delegated* accounts cannot use the emptying exception — the floor
 *   always applies to them when their balance decreases.
 *
 * So being under 10 MON is NOT a reason to block trading. It is a reason to
 * warn and to rate-limit the UI. The only genuine hard block is not having
 * enough balance to cover the trade plus worst-case gas.
 */
export const RESERVE_FLOOR_MON = 10n;
export const RESERVE_FLOOR_WEI = parseEther(RESERVE_FLOOR_MON.toString());

/** One tx per 3 blocks (~1.2 s); padded so the UI never races the chain. */
export const LOW_BALANCE_COOLDOWN_MS = 1500;

export function isBelowReserveFloor(balanceWei: bigint | undefined): boolean {
  if (balanceWei === undefined) return false;
  return balanceWei < RESERVE_FLOOR_WEI;
}

/**
 * The real insufficient-funds check: can this account cover the trade plus the
 * worst-case gas charge? Distinct from the reserve floor, and the only case
 * that should actually stop a trade.
 */
export function exceedsBalance(
  balanceWei: bigint | undefined,
  spendWei: bigint,
  worstCaseGasWei: bigint,
): boolean {
  if (balanceWei === undefined) return false;
  return spendWei + worstCaseGasWei > balanceWei;
}

/**
 * Monad charges gas on the LIMIT, not on gas used, so the worst case is the
 * only honest number to show before signing.
 */
export function worstCaseGasWei(gasLimit: bigint, maxFeePerGas: bigint): bigint {
  return gasLimit * maxFeePerGas;
}

/**
 * Estimate plus headroom. Never 2x — on Monad the padding is charged, not
 * refunded, so an over-padded limit is money taken from the user.
 */
export function padGasLimit(estimate: bigint, percent = 18n): bigint {
  return (estimate * (100n + percent)) / 100n;
}

/** Trim a wei amount to a readable number of decimals without rounding up. */
export function formatAmount(value: bigint, decimals = 4): string {
  const full = formatEther(value);
  const dot = full.indexOf(".");
  if (dot === -1) return full;
  return full.slice(0, dot + 1 + decimals).replace(/\.$/, "");
}
