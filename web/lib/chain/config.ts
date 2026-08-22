import { createConfig, http } from "wagmi";
import { monad, monadTestnet } from "wagmi/chains";
import { injected } from "wagmi/connectors";

/**
 * Monad testnet. `wagmi/chains` does ship `monadTestnet` (verified: id 10143,
 * rpc https://testnet-rpc.monad.xyz), so we use it rather than hand-rolling a
 * chain definition — but the RPC is pinned explicitly in the transport below so
 * it never silently changes underneath us.
 */
export const TARGET_CHAIN = monadTestnet;
export const TARGET_CHAIN_ID = monadTestnet.id; // 10143

/**
 * Mainnet is 143 and testnet is 10143 — one digit apart. Kept here so the
 * wrong-network guard can name the chain the user is actually on.
 */
export const MONAD_MAINNET_ID = monad.id; // 143

export const RPC_URL = "https://testnet-rpc.monad.xyz";

export const wagmiConfig = createConfig({
  chains: [monadTestnet],
  connectors: [injected()],
  transports: {
    [monadTestnet.id]: http(RPC_URL),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
