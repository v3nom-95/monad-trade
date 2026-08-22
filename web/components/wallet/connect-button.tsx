"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";

import { Button } from "@/components/ui/button";

function shorten(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();

  const injectedConnector = connectors[0];

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-3">
        <span className="font-mono text-sm text-muted-foreground">
          {shorten(address)}
        </span>
        <Button variant="outline" onClick={() => disconnect()}>
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        onClick={() => injectedConnector && connect({ connector: injectedConnector })}
        disabled={!injectedConnector || isPending}
      >
        {isPending ? "Connecting…" : "Connect wallet"}
      </Button>
      {!injectedConnector && (
        <p className="text-sm text-muted-foreground">
          No browser wallet detected.
        </p>
      )}
      {error && (
        <p className="text-sm text-destructive">{error.message}</p>
      )}
    </div>
  );
}
