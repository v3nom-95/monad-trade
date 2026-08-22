"use client";

import { useState } from "react";
import { formatEther, parseEther } from "viem";
import {
  useAccount,
  useEstimateFeesPerGas,
  useEstimateGas,
  useReadContract,
  useSendTransactionSync,
} from "wagmi";
import { encodeFunctionData } from "viem";

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
import { EXPLORER_TX } from "@/lib/chain/kuru";
import {
  HAS_VERIFIED_WITHDRAW,
  MARGIN_ACCOUNT,
  NATIVE_TOKEN,
  marginAccountAbi,
} from "@/lib/chain/marginAccount";
import {
  formatAmount,
  isBelowReserveFloor,
  padGasLimit,
  worstCaseGasWei,
} from "@/lib/chain/reserve";
import { useMonBalance } from "@/lib/chain/useBalances";

export function DepositPanel() {
  const { address, isConnected } = useAccount();
  const { data: balance, refetch: refetchBalance } = useMonBalance();
  const { data: feeData } = useEstimateFeesPerGas({
    query: { refetchInterval: 15_000 },
  });

  const [amount, setAmount] = useState("1");
  const [confirming, setConfirming] = useState(false);

  const { data: deposited, refetch: refetchDeposited } = useReadContract({
    address: MARGIN_ACCOUNT,
    abi: marginAccountAbi,
    functionName: "getBalance",
    args: address ? [address, NATIVE_TOKEN] : undefined,
    query: { enabled: Boolean(address), refetchInterval: 8_000 },
  });

  let value = 0n;
  let parseError = "";
  try {
    value = parseEther(amount || "0");
  } catch {
    parseError = "Enter a valid MON amount.";
  }

  const calldata =
    address && value > 0n
      ? encodeFunctionData({
          abi: marginAccountAbi,
          functionName: "deposit",
          // Only the 3-arg form works; the 2-arg and depositNative() both revert.
          args: [address, NATIVE_TOKEN, value],
        })
      : undefined;

  const { data: gasEstimate, error: gasError } = useEstimateGas({
    to: MARGIN_ACCOUNT,
    data: calldata,
    value,
    account: address,
    query: { enabled: Boolean(address && calldata) },
  });

  const gasLimit = gasEstimate ? padGasLimit(gasEstimate) : undefined;
  const maxFee = feeData?.maxFeePerGas;
  const worstGas =
    gasLimit && maxFee ? worstCaseGasWei(gasLimit, maxFee) : undefined;

  // Monad's eth_sendRawTransactionSync returns the RECEIPT in the same call —
  // no separate wait-for-receipt round trip.
  const {
    sendTransactionSync,
    data: receipt,
    isPending,
    error: sendError,
  } = useSendTransactionSync();
  const txHash = receipt?.transactionHash;

  // Leave gas headroom on MAX so a deposit can never strand the account with
  // nothing left to pay for its next transaction.
  const maxDepositable =
    balance && worstGas !== undefined
      ? balance.value > worstGas * 3n
        ? balance.value - worstGas * 3n
        : 0n
      : undefined;

  const insufficient =
    balance !== undefined && worstGas !== undefined
      ? value + worstGas > balance.value
      : false;

  const blocked = Boolean(parseError) || value === 0n || insufficient;

  if (!isConnected) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Deposit collateral to Kuru</CardTitle>
        <CardDescription>
          MarginAccount is the collateral layer of the Kuru DEX. Limit orders
          settle from this balance, not from your wallet — so this is step 1 of
          the trading flow.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">
            Your Kuru collateral
          </span>
          <span className="font-mono">
            {deposited !== undefined ? `${formatEther(deposited)} MON` : "…"}
          </span>
        </div>

        <Separator />

        {!HAS_VERIFIED_WITHDRAW && (
          <div className="rounded-md border border-destructive/50 p-3">
            <strong className="text-destructive">
              No withdraw function — read before depositing
            </strong>
            <p className="text-sm text-muted-foreground">
              This MarginAccount implementation exposes{" "}
              <code>deposit</code> and <code>getBalance</code>, but no withdraw
              of any standard shape. I enumerated all 41 selectors in the
              deployed bytecode and found no exit. Deposited MON can back orders
              but may not be retrievable. Deposit a small amount you are willing
              to leave there.
            </p>
          </div>
        )}

        <div className="flex items-end gap-3">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-sm text-muted-foreground">Amount (MON)</span>
            <input
              className="rounded-md border border-input bg-background px-3 py-2 font-mono"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
            />
          </label>
          <Button
            variant="outline"
            disabled={!maxDepositable}
            onClick={() =>
              maxDepositable && setAmount(formatAmount(maxDepositable, 6))
            }
          >
            Max
          </Button>
        </div>

        <div className="flex flex-col gap-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Contract</span>
            <span className="font-mono text-xs">{MARGIN_ACCOUNT}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Gas limit (est +18%)</span>
            <span className="font-mono">{gasLimit?.toString() ?? "—"}</span>
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

        {parseError && <p className="text-sm text-destructive">{parseError}</p>}
        {insufficient && (
          <p className="text-sm text-destructive">
            {formatAmount(value)} MON plus{" "}
            {worstGas ? formatAmount(worstGas, 6) : "…"} MON worst-case gas
            exceeds your {balance ? formatAmount(balance.value) : "…"} MON.
          </p>
        )}
        {gasError && (
          <p className="text-sm text-destructive">
            Simulation failed: {gasError.message.split("\n")[0]}
          </p>
        )}
        {isBelowReserveFloor(balance?.value) && !blocked && (
          <p className="text-sm text-muted-foreground">
            You are under the 10 MON reserve floor. This still works via the
            emptying exception, but you are limited to one transaction every
            ~1.2 s.
          </p>
        )}

        {!confirming ? (
          <Button disabled={blocked || !gasLimit} onClick={() => setConfirming(true)}>
            Review deposit
          </Button>
        ) : (
          <div className="flex flex-col gap-3 rounded-md border border-primary/40 p-3">
            <div className="text-sm">
              <strong>Confirm deposit</strong>
              <p className="text-muted-foreground">
                Deposit <strong>{amount} MON</strong> as collateral to{" "}
                <span className="font-mono text-xs">{MARGIN_ACCOUNT}</span>.
                Monad charges gas on the limit, so this costs up to{" "}
                {worstGas ? formatAmount(worstGas, 6) : "—"} MON regardless of
                gas used.
              </p>
              <Badge variant="secondary" className="mt-2">
                testnet 10143
              </Badge>
            </div>
            <div className="flex gap-2">
              <Button
                disabled={isPending}
                onClick={() =>
                  calldata &&
                  gasLimit &&
                  sendTransactionSync({
                    to: MARGIN_ACCOUNT,
                    data: calldata,
                    value,
                    gas: gasLimit,
                  })
                }
              >
                {isPending ? "Confirm in wallet…" : "Deposit"}
              </Button>
              <Button variant="outline" onClick={() => setConfirming(false)}>
                Back
              </Button>
            </div>
          </div>
        )}

        {sendError && (
          <p className="text-sm text-destructive">
            {sendError.message.split("\n")[0]}
          </p>
        )}

        {txHash && (
          <div className="flex flex-col gap-1 rounded-md bg-muted/50 p-3 text-sm">
            <span>
              <strong>
                {receipt
                  ? receipt.status === "success"
                    ? "Deposit confirmed"
                    : "Transaction reverted"
                  : "Submitted — waiting for receipt"}
              </strong>
            </span>
            <a
              className="font-mono text-xs underline"
              href={EXPLORER_TX(txHash)}
              target="_blank"
              rel="noreferrer"
            >
              {txHash}
            </a>
            {receipt && (
              <Button
                variant="outline"
                onClick={() => {
                  refetchDeposited();
                  refetchBalance();
                }}
              >
                Refresh balances
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
