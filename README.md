<div align="center">

# Monad Trade

**An AI-native quant trading terminal for Monad — that tells you which of its signals you can actually execute.**

</div>

---

## The problem

Every backtester shows you one number: total P&L. On a spot DEX that number is a lie.

Roughly **half of every mean-reversion strategy's trades are shorts** — and you cannot short
on a spot DEX. A strategy that reports +271 may only have been able to place +160 of it.

Monad Trade reports **both numbers, always**.

```
RSI-14 · MON/USDT · 6,500 hourly bars · 8.9 months

  Total P&L        271.70      ← what the signal said
  Executable only  160.14      ← what a spot DEX could place
  181 trades · 64.6% win · 6.3% max drawdown
  91 of 181 trades unplaceable  (short-not-supported-on-spot)
```

Every excluded trade carries a machine-readable reason. Nothing is hidden.

---

## Features

| | |
|---|---|
| **Strategy Lab** | SMA / RSI / MACD backtests on live market data, with total *and* executable-only P&L |
| **AI Assistant** | Gemini-powered strategy analysis that reasons about your actual trade list |
| **Token tracking by address** | Paste any contract address — resolves via DexScreener, picks the deepest-liquidity pair across up to 30 |
| **Monad wallet layer** | Testnet-pinned (10143), structural wrong-network guard, live balances |
| **Kuru DEX integration** | On-chain collateral deposits, order encoding, guards that refuse rather than burn gas |
| **Indicator IDE** | Author, validate and version your own indicators |
| **Market + Live** | Watchlists, charts, execution surfaces |

---

## Monad-specific engineering

Monad is not Ethereum. These are handled explicitly:

- **Gas is charged on `gas_limit`, not gas used** — estimates padded 18%, never 2×, and the
  confirmation shows *worst-case* cost (`gas_limit × maxFee`), not an estimate
- **10 MON reserve floor** — below it accounts are throttled to one tx per ~1.2s. We warn
  rather than block, because the emptying-transaction exception still permits spending
- **EIP-7702 detection** — delegated accounts lose that exception and are hard-blocked
- **`eth_sendRawTransactionSync`** — receipt returned in the same call, no polling
- **Block tags** — quotes read at `latest`, settlement confirmed at `finalized`

---

## Deployed contracts — Monad Testnet (`10143`)

RPC `https://testnet-rpc.monad.xyz` · Explorer `https://testnet.monadexplorer.com`

Every address verified with `eth_getCode` against the live chain.

| Contract | Address |
|---|---|
| Kuru Router | `0x7EFbE105Ca7415dE98F96622173458ac1c054630` |
| Kuru OrderBookImpl | `0x72caE0a99C19B574e8a6De558F43fc1D019c9374` |
| Kuru Market MON/USDC | `0xa241896A7Dbe8a550D2E5fF7A914bB1989ceD2D9` |
| Kuru MarginAccount | `0xd029C2D98ff85D8F64799017fE00a59B1159CE02` |
| USDC (testnet) | `0x3bA3d39AFcf8bb994f7964B3e0171Ea2Ba361570` |
| WMON (live) | `0x5a4E0bFDeF88C9032CB4d24338C5EB3d3870BfDd` |
| Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` |
| Permit2 | `0x000000000022d473030f116ddee9f6b43ac78ba3` |

Market parameters read live from `getMarketParams()`: base `address(0)` (native MON) ·
quote USDC · `minSize 200 MON` · `tickSize 0.000001` · 0 bps taker/maker.

> We deploy no contracts. Monad Trade integrates existing on-chain protocols, and every
> address above is independently verifiable.

---

## What we found on Monad testnet

- Uniswap is **not deployed on testnet** — 17 protocols there vs 175 on mainnet
- Kuru MON/USDC: **`s_orderIdCounter() == 0`** — not one order has ever been placed
- `bestBidAsk()` returns the empty sentinels; the AMM vault holds nothing
- A wallet holding **297,579 MON** gets the same `InsufficientBalance()` revert as one holding 4

So a swap cannot fill today — proven at the contract level with decoded revert selectors
(`SizeError 0x0a5c4f1f`, `InsufficientBalance 0xf4d678b8`), not assumed.

**Working on-chain today:** wallet connect · live balance reads · live market/orderbook reads ·
**collateral deposit to Kuru MarginAccount (confirmed on-chain)**.

---

## Run locally

```bash
docker compose -f docker-compose.ghcr.yml -f docker-compose.override.yml up -d
# → http://127.0.0.1:8888
```

Configure `backend.env`:

```
SECRET_KEY=<python -c "import secrets; print(secrets.token_hex(32))">
ADMIN_USER=admin
ADMIN_PASSWORD=<strong>
BRAND_APP_NAME=Monad Trade
LLM_PROVIDER=google
GOOGLE_API_KEY=<your key>
GOOGLE_MODEL=gemini-2.5-flash
```

If port 6379 is taken, set `REDIS_PORT=127.0.0.1:6380` in a root `.env`.
After rebuilding the frontend, always swap with `--force-recreate`.

---

## Licence

Apache License 2.0 — see [`LICENSE`](./LICENSE).
