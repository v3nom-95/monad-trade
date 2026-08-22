"use client";

import { useState } from "react";
import { encodeFunctionData, formatUnits, parseEther } from "viem";
import { useAccount, useEstimateFeesPerGas, useEstimateGas } from "wagmi";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  KURU_MARKET_MON_USDC,
  isOnTick,
  orderBookAbi,
  toRawPrice,
  toRawSize,
} from "@/lib/chain/kuru";
import {
  exceedsBalance,
  formatAmount,
  isBelowReserveFloor,
  padGasLimit,
  worstCaseGasWei,
} from "@/lib/chain/reserve";
import { useMonBalance } from "@/lib/chain/useBalances";
import { useKuruMarket } from "@/lib/chain/useKuruMarket";

type Blocker = { fatal: boolean; message: string };

export function SellPanel() {
  const { address, isConnected } = useAccount();
  const { data: balance } = useMonBalance();
  const market = useKuruMarket();
  const { data: feeData } = useEstimateFeesPerGas({
    query: { refetchInterval: 15_000 },
  });

  const [amount, setAmount] = useState("200");
  const [price, setPrice] = useState("0.30");
  const [confirming, setConfirming] = useState(false);

  // Computed plainly rather than with useMemo: the React Compiler memoizes
  // this component and rejects manual memoization it cannot verify.
  let rawSize = 0n;
  let rawPrice = 0n;
  let calldata: `0x${string}` | undefined;
  let encodeError = "";
  try {
    rawSize = toRawSize(amount || "0", market.params.sizePrecision);
    rawPrice = toRawPrice(price || "0", market.params.pricePrecision);
    calldata = encodeFunctionData({
      abi: orderBookAbi,
      functionName: "addSellOrder",
      // postOnly = true: this order MAKES liquidity and must never cross.
      args: [Number(rawPrice), rawSize, true],
    });
  } catch (e) {
    encodeError = e instanceof Error ? e.message : "encoding failed";
  }

  const { data: gasEstimate, error: gasError } = useEstimateGas({
    to: KURU_MARKET_MON_USDC,
    data: calldata,
    account: address,
    query: { enabled: Boolean(address && calldata && rawSize > 0n) },
  });

  const gasLimit = gasEstimate ? padGasLimit(gasEstimate) : undefined;
  const maxFee = feeData?.maxFeePerGas;
  const worstGas =
    gasLimit && maxFee ? worstCaseGasWei(gasLimit, maxFee) : undefined;

  // A sell escrows the MON being sold; addSellOrder is NOT payable, so the
  // contract pulls it from the user's MarginAccount credit rather than msg.value.
  let spend = 0n;
  try {
    spend = parseEther(amount || "0");
  } catch {
    spend = 0n;
  }

  const sizeDigits = market.params.sizePrecision.toString().length - 1;
  const priceDigits = market.params.pricePrecision.toString().length - 1;

  const blockers: Blocker[] = [];
  if (rawSize > 0n && rawSize < market.params.minSize) {
    blockers.push({
      fatal: true,
      message: `Minimum order on this market is ${formatUnits(
        market.params.minSize,
        sizeDigits,
      )} MON. Anything smaller reverts on chain with SizeError.`,
    });
  }
  if (!isOnTick(rawPrice, market.params.tickSize)) {
    blockers.push({
      fatal: true,
      message: `Price must land on a ${formatUnits(
        market.params.tickSize,
        priceDigits,
      )} USDC tick, or the contract reverts with TickSizeError.`,
    });
  }
  if (exceedsBalance(balance?.value, spend, worstGas ?? 0n)) {
    blockers.push({
      fatal: true,
      message: `This order escrows ${formatAmount(spend)} MON plus ${
        worstGas ? formatAmount(worstGas) : "…"
      } MON worst-case gas, but you hold ${
        balance ? formatAmount(balance.value) : "…"
      } MON.`,
    });
  }
  if (gasError) {
    // This revert is almost always InsufficientBalance() from MarginAccount: a
    // LIMIT order settles from Kuru collateral, not the wallet, whereas a MARKET
    // order (placeAndExecuteMarketSell) is payable and takes msg.value. Naming
    // the cause beats echoing "execution reverted".
    const raw = gasError.message;
    const isBalance =
      raw.includes("0xf4d678b8") ||
      /insufficient/i.test(raw) ||
      /unknown reason/i.test(raw);
    blockers.push({
      fatal: true,
      message: isBalance
        ? "Simulation reverts with InsufficientBalance(). A limit order settles from your Kuru collateral, not your wallet — deposit to MarginAccount above first, then place the order."
        : `The network rejected this order in simulation: ${raw.split("\n")[0]}`,
    });
  }

  const fatal = blockers.some((b) => b.fatal);
  const lowBalance = isBelowReserveFloor(balance?.value);

  if (!isConnected) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sell MON</CardTitle>
        <CardDescription>
          Limit sell on Kuru MON/USDC (testnet). Post-only — this order makes
          liquidity and never crosses the book.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">Book</span>
          {market.isLoading ? (
            <span className="text-sm">Reading market…</span>
          ) : market.empty ? (
            <span className="text-sm">
              No orders in this market yet — your order would be the first.
            </span>
          ) : (
            <span className="font-mono text-sm">
              bid {market.bestBid?.toString()} · ask {market.bestAsk?.toString()}
            </span>
          )}
        </div>

        <Separator />

        <div className="flex gap-4">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-sm text-muted-foreground">Amount (MON)</span>
            <input
              className="rounded-md border border-input bg-background px-3 py-2 font-mono"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-sm text-muted-foreground">
              Limit price (USDC per MON)
            </span>
            <input
              className="rounded-md border border-input bg-background px-3 py-2 font-mono"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="decimal"
            />
          </label>
        </div>

        {/* Raw scaled values shown alongside the human ones so a decimal-scale
            bug is visible before anything is signed. */}
        <div className="rounded-md bg-muted/50 p-3 font-mono text-xs">
          <div>
            size (uint96) = {rawSize.toString()}{" "}
            <span className="text-muted-foreground">
              (÷{market.params.sizePrecision.toString()})
            </span>
          </div>
          <div>
            price (uint32) = {rawPrice.toString()}{" "}
            <span className="text-muted-foreground">
              (÷{market.params.pricePrecision.toString()})
            </span>
          </div>
          <div className="text-muted-foreground">
            params read {market.paramsLive ? "live from chain" : "from fallback"}
          </div>
        </div>

        {lowBalance && !fatal && (
          <p className="text-sm text-muted-foreground">
            You are under the 10 MON reserve floor. The order can still be sent
            (emptying exception), but you are limited to one transaction every
            ~1.2 s.
          </p>
        )}

        {blockers.map((b) => (
          <p key={b.message} className="text-sm text-destructive">
            {b.message}
          </p>
        ))}
        {encodeError && (
          <p className="text-sm text-destructive">{encodeError}</p>
        )}

        <Separator />

        <div className="flex flex-col gap-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Contract</span>
            <span className="font-mono text-xs">{KURU_MARKET_MON_USDC}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Gas limit (est +18%)</span>
            <span className="font-mono">
              {gasLimit ? gasLimit.toString() : "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              Worst-case gas (limit × max fee)
            </span>
            <span className="font-mono">
              {worstGas ? `${formatAmount(worstGas, 6)} MON` : "—"}
            </span>
          </div>
        </div>

        <Button disabled={fatal || !gasLimit} onClick={() => setConfirming(true)}>
          {fatal ? "Cannot place this order" : "Review order"}
        </Button>

        {confirming && !fatal && (
          <div className="rounded-md border border-primary/40 p-3 text-sm">
            <strong>Confirm</strong>
            <p className="text-muted-foreground">
              Sell {amount} MON at {price} USDC via addSellOrder on{" "}
              {KURU_MARKET_MON_USDC}. Monad charges gas on the limit, so this
              costs up to {worstGas ? formatAmount(worstGas, 6) : "—"} MON
              regardless of gas used.
            </p>
            <Badge variant="secondary" className="mt-2">
              testnet 10143
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
