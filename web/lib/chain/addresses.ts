import type { Address } from "viem";

/**
 * Monad TESTNET addresses (chainId 10143). Never carry a mainnet address over —
 * WMON in particular is a different address on each network.
 *
 * WMON status, checked 2026-08-22 against three independent testnet RPCs
 * (testnet-rpc.monad.xyz, monad-testnet.drpc.org, rpc.ankr.com/monad_testnet):
 *
 *   eth_getCode(0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701) -> "0x"  (NO CODE)
 *
 * That address is what monad-crypto/protocols lists as the canonical testnet
 * WMON (testnet/CANONICAL.jsonc, last touched 2026-05-28), but the live chain
 * has nothing deployed there, while every other canonical testnet entry in the
 * same file does have code (Multicall3, Permit2, CreateX, Create2Deployer,
 * SingletonFactory, EntryPoint v0.6). So the registry entry is stale, not the
 * RPC. It is left here rather than replaced with a guess — a wrong token
 * address is the "lose funds" case. The UI degrades to "not deployed" instead
 * of rendering a fake 0 balance.
 */
export const WMON_ADDRESS: Address =
  "0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701";

/** Deterministic deploys — identical on mainnet and testnet, both verified to have code. */
export const MULTICALL3_ADDRESS: Address =
  "0xcA11bde05977b3631167028862bE2a173976CA11";
export const PERMIT2_ADDRESS: Address =
  "0x000000000022d473030f116ddee9f6b43ac78ba3";
