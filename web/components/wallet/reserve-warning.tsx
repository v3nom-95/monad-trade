"use client";

import { Card, CardContent } from "@/components/ui/card";
import {
  RESERVE_FLOOR_MON,
  formatAmount,
  isBelowReserveFloor,
} from "@/lib/chain/reserve";

/**
 * A warning, deliberately not a block. Under 10 MON the emptying-transaction
 * exception still lets an undelegated account trade — it is just rate-limited.
 * Refusing here would lock a user out of their own funds.
 */
export function ReserveWarning({
  balance,
  isDelegated,
}: {
  balance?: bigint;
  isDelegated?: boolean;
}) {
  if (!isBelowReserveFloor(balance)) return null;

  return (
    <Card className="border-destructive/50">
      <CardContent className="flex flex-col gap-2">
        <strong>Below the {RESERVE_FLOOR_MON.toString()} MON reserve floor</strong>
        <p className="text-sm text-muted-foreground">
          You have {balance !== undefined ? formatAmount(balance) : "0"} MON.
          Trading still works — Monad&apos;s emptying-transaction exception lets
          you spend below the floor — but you are limited to{" "}
          <strong>one transaction every ~1.2 seconds</strong>. If a second trade
          fires too quickly it will fail; that is the network rule, not this app.
        </p>
        {isDelegated && (
          <p className="text-sm text-destructive">
            This account has EIP-7702 delegation set. Delegated accounts cannot
            use the emptying exception, so the{" "}
            {RESERVE_FLOOR_MON.toString()} MON floor applies to every balance
            decrease and trades will revert until you top up.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
