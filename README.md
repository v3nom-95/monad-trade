<div align="center">

<img src="./src/assets/logo.png" alt="Monad Trade" width="420"/>

# Monad Trade

### The quant terminal that tells you which signals you can *actually* execute

[![Network](https://img.shields.io/badge/Monad-Testnet%2010143-8c5cff?style=for-the-badge)](https://testnet.monadexplorer.com)
[![Venue](https://img.shields.io/badge/DEX-Kuru-a37764?style=for-the-badge)](https://kuru.io)
[![AI](https://img.shields.io/badge/AI-Gemini%202.5-4285F4?style=for-the-badge)](https://ai.google.dev)
[![Data](https://img.shields.io/badge/Data-6%2C500%20live%20bars-22c55e?style=for-the-badge)]()

</div>

---

## ⚡ The problem nobody else shows you

> Every backtester reports one number. On a spot DEX, that number is fiction.

About **half of every mean-reversion strategy's trades are shorts** — and **you cannot short on a spot DEX**.
Your backtest counts profits from trades the chain would never have accepted.

<div align="center">

### RSI-14 · MON/USDT · 6,500 hourly bars · 8.9 months

| | |
|:--|--:|
| Signal P&L *(what every other tool shows)* | **+271.70** |
| **Executable P&L** *(what a spot DEX could place)* | **+160.14** |
| Trades | 181 |
| Win rate | 64.6% |
| Max drawdown | 6.3% |
| ⛔ Unplaceable | **91 of 181** |

</div>

Every excluded trade carries a machine-readable reason — `short-not-supported-on-spot`.
Nothing is rounded away, nothing is hidden.

---

## 🧩 What's inside

<table>
<tr><td width="34%"><b>📊 Strategy Lab</b></td><td>SMA · RSI · MACD backtested on live market data. Reports signal P&L <i>and</i> executable P&L, side by side.</td></tr>
<tr><td><b>🤖 AI Assistant</b></td><td>Gemini 2.5 reasons over <i>your</i> trade list — not generic advice. Knows your shorts are unplaceable.</td></tr>
<tr><td><b>🔍 Track by contract address</b></td><td>Paste any token address. Resolves via DexScreener, auto-selects the deepest-liquidity pair from up to 30.</td></tr>
<tr><td><b>👛 Monad wallet layer</b></td><td>Pinned to 10143. Structural wrong-network guard — the trading UI does not render off-chain.</td></tr>
<tr><td><b>🔗 Kuru DEX</b></td><td>On-chain collateral deposits, live orderbook reads, order encoding with guards that refuse rather than burn gas.</td></tr>
<tr><td><b>🛠 Indicator IDE</b></td><td>Author, validate and version custom indicators.</td></tr>
</table>

---

## 🔷 Built for Monad, not ported to it

<table>
<tr><th align="left">Monad behaviour</th><th align="left">How we handle it</th></tr>
<tr><td>Gas charged on <code>gas_limit</code>, not gas used</td><td>Estimate <b>+18%, never 2×</b>. Confirmation shows <b>worst-case</b> cost, not an estimate.</td></tr>
<tr><td>10 MON reserve floor</td><td>Warn, don't block — the emptying-transaction exception still permits spending. UI rate-limits to ~1.2s.</td></tr>
<tr><td>EIP-7702 delegation</td><td>Detected. Delegated accounts lose the exception and are hard-blocked.</td></tr>
<tr><td><code>eth_sendRawTransactionSync</code></td><td>Receipt in the same call. No polling round-trip.</td></tr>
<tr><td>Speculative vs finalized state</td><td>Quotes at <code>latest</code>. Settlement confirmed at <code>finalized</code>.</td></tr>
</table>

---

## 📜 Deployed contracts — Monad Testnet

**Chain ID** `10143` · **RPC** `https://testnet-rpc.monad.xyz` · **Explorer** `testnet.monadexplorer.com`

> Every address below verified with `eth_getCode` against the live chain. Byte sizes are what the chain returned.

### Kuru — orderbook DEX

| Contract | Address | Code |
|:--|:--|--:|
| Router | [`0x7EFbE105Ca7415dE98F96622173458ac1c054630`](https://testnet.monadexplorer.com/address/0x7EFbE105Ca7415dE98F96622173458ac1c054630) | 284 B |
| OrderBookImpl | [`0x72caE0a99C19B574e8a6De558F43fc1D019c9374`](https://testnet.monadexplorer.com/address/0x72caE0a99C19B574e8a6De558F43fc1D019c9374) | 71,098 B |
| Market MON/USDC | [`0xa241896A7Dbe8a550D2E5fF7A914bB1989ceD2D9`](https://testnet.monadexplorer.com/address/0xa241896A7Dbe8a550D2E5fF7A914bB1989ceD2D9) | 284 B |
| MarginAccount | [`0xd029C2D98ff85D8F64799017fE00a59B1159CE02`](https://testnet.monadexplorer.com/address/0xd029C2D98ff85D8F64799017fE00a59B1159CE02) | 142 B |
| MarginAccount impl | `0xf10af40f060b7ae54a2d5da682becc981dfb52c3` | 4,989 B |
| USDC (quote) | [`0x3bA3d39AFcf8bb994f7964B3e0171Ea2Ba361570`](https://testnet.monadexplorer.com/address/0x3bA3d39AFcf8bb994f7964B3e0171Ea2Ba361570) | 3,476 B |

**Live market parameters** — read from `getMarketParams()`, not hardcoded:

```
baseAsset  address(0)  (native MON, 18 dec)     minSize    200 MON
quote      USDC        (6 dec)                  tickSize   0.000001 USDC
sizePrec   1e10        pricePrec  1e8           fees       0 bps / 0 bps
```

### Canonical

| Contract | Address |
|:--|:--|
| WMON *(live — registry entry is stale)* | `0x5a4E0bFDeF88C9032CB4d24338C5EB3d3870BfDd` |
| Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` |
| Permit2 | `0x000000000022d473030f116ddee9f6b43ac78ba3` |
| CreateX | `0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed` |

> **We deploy no contracts.** Monad Trade integrates existing on-chain protocols — every address is third-party and independently verifiable.

---

## 🔬 What we found on Monad testnet

Deep integration produces findings, not just features:

```
✗  Uniswap is NOT deployed on Monad testnet     17 protocols vs 175 on mainnet
✗  Kuru MON/USDC: s_orderIdCounter() == 0       not one order, ever
✗  bestBidAsk() → (uint256.max, 0)              empty-book sentinels
✗  AMM vault                                     0 MON, 0 USDC
✗  A 297,579 MON wallet gets the same           InsufficientBalance() revert
```

A swap cannot fill today — proven with decoded revert selectors
(`SizeError 0x0a5c4f1f`, `InsufficientBalance 0xf4d678b8`), not assumed.

**✅ Working on-chain now:** wallet connect · live balance reads · live market + orderbook reads ·
**collateral deposit to Kuru MarginAccount, confirmed on-chain**

---

## 🚀 Run it

```bash
docker compose -f docker-compose.ghcr.yml -f docker-compose.override.yml up -d
```

→ **http://127.0.0.1:8888**

<details>
<summary><b>Configuration</b></summary>

```env
SECRET_KEY=<python -c "import secrets; print(secrets.token_hex(32))">
ADMIN_USER=admin
ADMIN_PASSWORD=<strong password>
BRAND_APP_NAME=Monad Trade

LLM_PROVIDER=google
GOOGLE_API_KEY=<your key>
GOOGLE_MODEL=gemini-2.5-flash

BILLING_ENABLED=false
```

**Port 6379 taken?** `REDIS_PORT=127.0.0.1:6380` in a root `.env`
**Rebuilt the frontend?** Always swap with `--force-recreate` — an unchanged tag will not be picked up.

</details>

---

<div align="center">

**Monad Trade** — honest backtesting for on-chain execution

</div>
