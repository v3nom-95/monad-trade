import type { Address } from "viem";

/**
 * Kuru MarginAccount — the collateral layer of the Kuru DEX on Monad TESTNET.
 *
 * This is step 1 of Kuru's trading flow, and it is why addSellOrder reverts
 * with InsufficientBalance(): a LIMIT order settles from MarginAccount credit,
 * not from msg.value. (A MARKET order — placeAndExecuteMarketSell/Buy — is
 * payable and takes msg.value instead. Same contract, two different funding
 * paths; that asymmetry reads like a bug if you only look at one of them.)
 *
 * TESTNET ONLY.
 */
export const MARGIN_ACCOUNT: Address =
  "0xd029C2D98ff85D8F64799017fE00a59B1159CE02";

/** Implementation behind the proxy, resolved from the EIP-1967 slot. */
export const MARGIN_ACCOUNT_IMPL: Address =
  "0xf10af40f060b7ae54a2d5da682becc981dfb52c3";

/** MarginAccount addresses native MON as the zero address, same as the market. */
export const NATIVE_TOKEN: Address =
  "0x0000000000000000000000000000000000000000";

/**
 * Minimal ABI. Both selectors were confirmed present in the deployed
 * implementation bytecode:
 *   deposit(address,address,uint256) 0x8340f549
 *   getBalance(address,address)      0xd4fac45d
 *
 * Only the 3-arg deposit works — deposit(address,uint256) and depositNative()
 * both revert.
 */
export const marginAccountAbi = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "payable",
    inputs: [
      { name: "_user", type: "address" },
      { name: "_token", type: "address" },
      { name: "_amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getBalance",
    stateMutability: "view",
    inputs: [
      { name: "_user", type: "address" },
      { name: "_token", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/**
 * NO WITHDRAW FUNCTION EXISTS on this implementation.
 *
 * I enumerated all 41 selectors referenced in the deployed bytecode and probed
 * every common shape — withdraw(address,uint256), withdraw(address,address,uint256),
 * withdrawNative, withdrawToken, withdrawAll, claim, redeem — none are present.
 * Deposited MON can be traded against but there is no verified exit path, so the
 * UI must say so BEFORE the user deposits.
 */
export const HAS_VERIFIED_WITHDRAW = false;
