# Quant core tests

Plain Node built-in test runner — no framework installed, none needed (Node >= 22.6).

## Run

From repo root (PowerShell):

    # indicators
    node --experimental-strip-types --test web/lib/quant/__tests__/indicators.test.mjs

    # backtest (needs the .ts extension resolver because quant/*.ts use extensionless imports)
    node --experimental-strip-types --import ./web/lib/quant/__tests__/resolve-ts.mjs --test web/lib/quant/__tests__/backtest.test.mjs

## Fixtures

`../__fixtures__/*.fixture.json` — hand-computed expected values; each file's
`comment` field states where every number came from.

Conventions pinned by fixtures:
- Indicators return arrays aligned to input, leading `null` during warm-up.
- EMA is SMA-seeded (first value emitted at index period-1).
- RSI flat series must resolve to a finite value (never NaN).
- MACD signal line is an EMA of the MACD line, not of price.
