"use client";

import { useAccount, useSwitchChain } from "wagmi";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  MONAD_MAINNET_ID,
  TARGET_CHAIN,
  TARGET_CHAIN_ID,
} from "@/lib/chain/config";

/**
 * Blocks trading actions whenever the wallet is not on Monad testnet.
 *
 * Monad mainnet is 143 and testnet is 10143 — one digit apart — so being on the
 * wrong one has to be impossible to miss rather than a subtle badge. Children
 * are not rendered at all until the chain is right; there is no "proceed
 * anyway" path.
 */
export function NetworkGuard({ children }: { children: React.ReactNode }) {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending, error } = useSwitchChain();

  if (!isConnected || chainId === TARGET_CHAIN_ID) {
    return <>{children}</>;
  }

  const onMainnet = chainId === MONAD_MAINNET_ID;

  return (
    <Card className="border-destructive/50">
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <strong className="text-destructive">Wrong network</strong>
          <p className="text-sm text-muted-foreground">
            {onMainnet ? (
              <>
                Your wallet is on <strong>Monad mainnet (143)</strong>. This app
                runs on <strong>{TARGET_CHAIN.name} ({TARGET_CHAIN_ID})</strong>.
                These are real funds versus test funds — switch before doing
                anything.
              </>
            ) : (
              <>
                Your wallet is on chain <strong>{chainId ?? "unknown"}</strong>.
                This app runs on{" "}
                <strong>
                  {TARGET_CHAIN.name} ({TARGET_CHAIN_ID})
                </strong>
                .
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })}
            disabled={isPending}
          >
            {isPending ? "Switching…" : `Switch to ${TARGET_CHAIN.name}`}
          </Button>
          {error && (
            <span className="text-sm text-destructive">{error.message}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
