"use client";

import { useReadContracts } from "wagmi";

import {
  KURU_MARKET_MON_USDC,
  MARKET_PARAMS_FALLBACK,
  isBookEmpty,
  orderBookAbi,
} from "./kuru";
import { TARGET_CHAIN_ID } from "./config";

/**
 * Market scaling params and book state, read live rather than trusted from a
 * constant — a stale precision is how you send the wrong amount.
 */
export function useKuruMarket() {
  const { data, isLoading, refetch } = useReadContracts({
    allowFailure: true,
    contracts: [
      {
        address: KURU_MARKET_MON_USDC,
        abi: orderBookAbi,
        functionName: "getMarketParams",
        chainId: TARGET_CHAIN_ID,
      },
      {
        address: KURU_MARKET_MON_USDC,
        abi: orderBookAbi,
        functionName: "bestBidAsk",
        chainId: TARGET_CHAIN_ID,
      },
    ],
    query: { refetchInterval: 10_000 },
  });

  const [paramsRes, bookRes] = data ?? [];

  const p =
    paramsRes?.status === "success"
      ? (paramsRes.result as readonly unknown[])
      : undefined;

  const params = p
    ? {
        pricePrecision: BigInt(p[0] as bigint),
        sizePrecision: BigInt(p[1] as bigint),
        baseAsset: p[2] as `0x${string}`,
        quoteAsset: p[4] as `0x${string}`,
        tickSize: BigInt(p[6] as bigint),
        minSize: BigInt(p[7] as bigint),
        maxSize: BigInt(p[8] as bigint),
        baseDecimals: Number(p[3] as bigint),
        quoteDecimals: Number(p[5] as bigint),
      }
    : {
        ...MARKET_PARAMS_FALLBACK,
        baseAsset: "0x0000000000000000000000000000000000000000" as const,
        quoteAsset: "0x0000000000000000000000000000000000000000" as const,
        maxSize: 0n,
      };

  const book =
    bookRes?.status === "success"
      ? (bookRes.result as readonly [bigint, bigint])
      : undefined;

  return {
    params,
    paramsLive: paramsRes?.status === "success",
    bestBid: book?.[0],
    bestAsk: book?.[1],
    empty: isBookEmpty(book?.[0], book?.[1]),
    isLoading,
    refetch,
  };
}
