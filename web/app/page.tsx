import { QuantSection } from "@/components/quant/quant-section";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/theme-toggle";
import { Balances } from "@/components/wallet/balances";
import { ConnectButton } from "@/components/wallet/connect-button";
import { DepositPanel } from "@/components/wallet/deposit-panel";
import { NetworkGuard } from "@/components/wallet/network-guard";
import { SellPanel } from "@/components/wallet/sell-panel";
import { TARGET_CHAIN, TARGET_CHAIN_ID } from "@/lib/chain/config";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-background text-foreground">
      <header className="flex items-center justify-between px-8 py-6">
        <span className="font-semibold">vibe-trade</span>
        <div className="flex items-center gap-4">
          <ConnectButton />
          <ThemeToggle />
        </div>
      </header>

      <Separator />

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-8 py-12">
        <div className="flex flex-col gap-3">
          <Badge>
            {TARGET_CHAIN.name} · {TARGET_CHAIN_ID}
          </Badge>
          <h1 className="text-3xl font-semibold">Wallet</h1>
          <p className="text-muted-foreground">
            Connect an injected wallet to see your MON balance and place orders on Kuru.
          </p>
        </div>

        <QuantSection />

        <NetworkGuard>
          <Balances />
          <DepositPanel />
          <SellPanel />
        </NetworkGuard>
      </main>
    </div>
  );
}
