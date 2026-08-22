"use client";

import { useAccount, useBalance, useBytecode } from "wagmi";

import { TARGET_CHAIN_ID } from "./config";

/**
 * Native MON balance, read at block tag `latest`.
 *
 * WMON is deliberately absent: the address the Monad protocol registry lists as
 * canonical testnet WMON (0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701) has NO
 * bytecode on chain 10143 — verified via eth_getCode against three independent
 * RPCs — so there is nothing to read. See addresses.ts.
 */
export function useMonBalance() {
  const { address, chainId } = useAccount();
  return useBalance({
    address,
    chainId: TARGET_CHAIN_ID,
    blockTag: "latest",
    query: { enabled: Boolean(address) && chainId === TARGET_CHAIN_ID },
  });
}

/**
 * EIP-7702 delegation check — an EOA with a delegation indicator has bytecode
 * (the 0xef0100 prefix). Cheap: one eth_getCode we are already able to make.
 * Matters because a delegated account loses the emptying-transaction exception
 * and is hard-blocked by the 10 MON floor.
 */
export function useIsDelegated(): boolean {
  const { address, chainId } = useAccount();
  const { data } = useBytecode({
    address,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: Boolean(address) && chainId === TARGET_CHAIN_ID },
  });
  return Boolean(data && data !== "0x" && data.startsWith("0xef0100"));
}
