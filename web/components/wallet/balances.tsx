"use client";

import { useAccount } from "wagmi";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatAmount } from "@/lib/chain/reserve";
import { useIsDelegated, useMonBalance } from "@/lib/chain/useBalances";

import { ReserveWarning } from "./reserve-warning";

export function Balances() {
  const { isConnected } = useAccount();
  const mon = useMonBalance();
  const isDelegated = useIsDelegated();

  if (!isConnected) return null;

  return (
    <div className="flex flex-col gap-4">
      <ReserveWarning balance={mon.data?.value} isDelegated={isDelegated} />

      <Card>
        <CardHeader>
          <CardTitle>Balance</CardTitle>
          <CardDescription>Read at block tag `latest`.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline justify-between">
            <span className="flex items-center gap-2">
              <strong>MON</strong>
              <Badge variant="secondary">native</Badge>
            </span>
            <span className="font-mono">
              {mon.isLoading
                ? "…"
                : mon.data
                  ? formatAmount(mon.data.value)
                  : "unavailable"}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
