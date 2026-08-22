<template>
  <div class="strategy-lab">
    <div class="lab-head">
      <h1>Strategy Lab</h1>
      <p>Backtests against real MONUSDT hourly candles from Bybit spot. No wallet or chain needed.</p>
    </div>

    <a-card :bordered="false" class="lab-card">
      <div class="lab-controls">
        <a-select v-model="strategyId" style="width: 240px;">
          <a-select-option v-for="s in strategies" :key="s.id" :value="s.id">{{ s.name }}</a-select-option>
        </a-select>
        <a-tag>MONUSDT</a-tag>
        <a-tag>1h</a-tag>
        <a-button type="primary" icon="play-circle" :loading="running" @click="run">
          {{ running ? 'Running…' : 'Run backtest' }}
        </a-button>
      </div>

      <a-alert v-if="error" type="error" show-icon :message="error" style="margin-top: 16px;" />

      <template v-if="result">
        <a-divider />

        <div class="stat-row">
          <div class="stat">
            <div class="stat-label">Total P&amp;L</div>
            <div class="stat-value">{{ fmt(result.totalPnl) }}</div>
          </div>
          <!-- The differentiator: what the system could actually have placed. -->
          <div class="stat stat--exec">
            <div class="stat-label">Executable only</div>
            <div class="stat-value">{{ fmt(result.executablePnl) }}</div>
          </div>
          <div class="stat stat--small">
            <div class="stat-label">Trades</div>
            <div class="stat-value-sm">{{ result.tradeCount }}</div>
          </div>
          <div class="stat stat--small">
            <div class="stat-label">Win rate</div>
            <div class="stat-value-sm">{{ fmt(result.winRate * 100, 1) }}%</div>
          </div>
          <div class="stat stat--small">
            <div class="stat-label">Max drawdown</div>
            <div class="stat-value-sm">{{ fmt(result.maxDrawdown * 100, 1) }}%</div>
          </div>
        </div>

        <div class="coverage">{{ coverage }}</div>

        <a-alert
          v-if="result.liquidated"
          type="error"
          show-icon
          message="This strategy blew up — equity reached zero under this cost model."
          style="margin-top: 12px;"
        />

        <a-divider />

        <p class="exec-note">Shorts cannot be executed on a spot DEX. We report both numbers.</p>

        <a-table
          :columns="columns"
          :data-source="result.trades"
          :row-key="rowKey"
          :pagination="false"
          :scroll="{ y: 420 }"
          size="small"
          :row-class-name="rowClass"
        >
          <span slot="side" slot-scope="text">{{ String(text).toUpperCase() }}</span>
          <span slot="price" slot-scope="text">{{ Number(text).toFixed(5) }}</span>
          <span slot="pnl" slot-scope="text, record">
            <span :class="pnlClass(record)">{{ (text >= 0 ? '+' : '') + fmt(text) }}</span>
          </span>
          <span slot="executable" slot-scope="text, record">
            <a-tag v-if="record.executable" color="green">yes</a-tag>
            <span v-else>
              <a-tag color="red">no</a-tag>
              <span class="reason">{{ record.reason }}</span>
            </span>
          </span>
        </a-table>
      </template>
    </a-card>
  </div>
</template>

<script>
import { builtInStrategies, runBacktest } from '@/utils/quant/backtest'
import { describeCoverage, fetchCandles } from '@/utils/quant/ohlc'

export default {
  name: 'BacktestLab',
  data () {
    return {
      strategies: builtInStrategies('MONUSDT', '60'),
      // rsi-14 is the profitable one and what the demo leads with.
      strategyId: 'rsi-14',
      running: false,
      result: null,
      coverage: '',
      error: '',
      columns: [
        { title: 'Side', dataIndex: 'side', width: 90, scopedSlots: { customRender: 'side' } },
        { title: 'Entry', dataIndex: 'entryPrice', width: 110, scopedSlots: { customRender: 'price' } },
        { title: 'Exit', dataIndex: 'exitPrice', width: 110, scopedSlots: { customRender: 'price' } },
        { title: 'P&L', dataIndex: 'pnl', width: 110, align: 'right', scopedSlots: { customRender: 'pnl' } },
        { title: 'Executable', dataIndex: 'executable', scopedSlots: { customRender: 'executable' } }
      ]
    }
  },
  methods: {
    fmt (n, dp = 2) {
      return Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
    },
    rowKey (record, index) {
      return `${record.entryT}-${index}`
    },
    rowClass (record) {
      return record.executable ? '' : 'row-non-executable'
    },
    pnlClass (record) {
      if (!record.executable) return ''
      return record.pnl >= 0 ? 'pnl-up' : 'pnl-down'
    },
    async run () {
      this.running = true
      this.error = ''
      try {
        const strategy = this.strategies.find(s => s.id === this.strategyId) || this.strategies[0]
        // fetchCandles caches to localStorage, so a second run is instant and
        // works with no network at all — the wifi fallback.
        const set = await fetchCandles({ symbol: 'MONUSDT', interval: '60' })
        this.coverage = describeCoverage(set)
        this.result = runBacktest(set.candles, strategy)
      } catch (e) {
        this.error = (e && e.message) || 'Backtest failed.'
      } finally {
        this.running = false
      }
    }
  }
}
</script>

<style lang="less" scoped>
.strategy-lab {
  padding: 24px;
}

.lab-head {
  margin-bottom: 16px;

  h1 {
    font-size: 24px;
    font-weight: 600;
    margin: 0;
  }

  p {
    color: #9c8478;
    margin: 4px 0 0;
  }
}

.lab-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.stat-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 32px;
}

.stat-label {
  font-size: 13px;
  color: #9c8478;
}

.stat-value {
  font-size: 40px;
  font-weight: 600;
  line-height: 1.1;
  font-family: monospace;
}

.stat-value-sm {
  font-size: 22px;
  font-weight: 600;
  font-family: monospace;
}

/* The executable-only number is the point of the whole feature. */
.stat--exec {
  padding: 8px 18px;
  border-radius: 8px;
  border: 1px solid var(--primary-color-soft-strong, color-mix(in srgb, var(--primary-color, #a37764) 30%, transparent));
  background: var(--primary-color-soft, color-mix(in srgb, var(--primary-color, #a37764) 10%, transparent));

  .stat-label { color: var(--primary-color, #a37764); font-weight: 600; }
  .stat-value { color: var(--primary-color, #a37764); }
}

.coverage {
  margin-top: 14px;
  font-family: monospace;
  font-size: 12px;
  color: #9c8478;
}

.exec-note {
  margin-bottom: 12px;
}

.pnl-up { color: #16a34a; font-weight: 600; }
.pnl-down { color: #dc2626; font-weight: 600; }

.reason {
  margin-left: 6px;
  font-size: 12px;
  color: #9c8478;
}
</style>

<style lang="less">
/* Non-executable rows must be unmistakable — that contrast IS the demo. */
.strategy-lab .row-non-executable > td {
  background: rgba(156, 132, 120, 0.12) !important;
  color: #9c8478 !important;
  text-decoration: line-through;
}

.strategy-lab .row-non-executable > td:last-child {
  text-decoration: none;
}
</style>
