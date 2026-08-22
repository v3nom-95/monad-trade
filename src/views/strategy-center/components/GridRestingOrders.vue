<template>
  <section class="grid-orders-panel">
    <header class="grid-orders-head">
      <div>
        <h3>{{ $t('strategyCenter.gridOrders.title') }}</h3>
        <p>{{ $t('strategyCenter.gridOrders.description') }}</p>
      </div>
      <a-button icon="sync" :loading="loading" @click="load(true)">{{ $t('strategyCenter.gridOrders.reconcile') }}</a-button>
    </header>

    <a-alert
      v-if="summary.sync_requested && !summary.sync_ok"
      type="error"
      show-icon
      :message="$t('strategyCenter.gridOrders.syncFailed')"
      :description="summary.sync_error"
    />
    <div class="grid-order-summary">
      <div><span>{{ $t('strategyCenter.gridOrders.open') }}</span><strong>{{ summary.total || orders.length }}</strong></div>
      <div><span>{{ $t('strategyCenter.gridOrders.verified') }}</span><strong>{{ summary.verified_exchange_orders || 0 }}</strong></div>
      <div :class="{ danger: Number(summary.unverified_orders || 0) > 0 }"><span>{{ $t('strategyCenter.gridOrders.unverified') }}</span><strong>{{ summary.unverified_orders || 0 }}</strong></div>
      <div><span>{{ $t('strategyCenter.gridOrders.lastSync') }}</span><strong>{{ formatTime(summary.last_reconciled_at) }}</strong></div>
    </div>

    <a-table
      :columns="columns"
      :data-source="orders"
      :loading="loading"
      :pagination="false"
      row-key="id"
      size="small"
      :scroll="{ x: 1050 }"
    >
      <template slot="side" slot-scope="value, row">
        <a-tag :color="String(row.side).toLowerCase() === 'buy' ? 'green' : 'red'">{{ row.side || '-' }}</a-tag>
      </template>
      <template slot="status" slot-scope="value">
        <a-tag :color="statusColor(value)">{{ value || '-' }}</a-tag>
      </template>
      <template slot="number" slot-scope="value">{{ formatNumber(value) }}</template>
      <template slot="exchangeOrderId" slot-scope="value">
        <code :class="{ missing: !value }">{{ value || $t('strategyCenter.gridOrders.notVerified') }}</code>
      </template>
      <template slot="updatedAt" slot-scope="value">{{ formatTime(value) }}</template>
      <template slot="emptyText">
        <div class="grid-orders-empty">
          <a-icon type="warning" />
          <strong>{{ $t('strategyCenter.gridOrders.empty') }}</strong>
          <span>{{ $t('strategyCenter.gridOrders.emptyHint') }}</span>
        </div>
      </template>
    </a-table>
  </section>
</template>

<script>
import { getGridRestingOrders } from '@/api/strategy'

export default {
  name: 'GridRestingOrders',
  props: {
    strategyId: { type: Number, required: true }
  },
  data () {
    return {
      orders: [],
      summary: {},
      loading: false,
      timer: null
    }
  },
  computed: {
    columns () {
      return [
        { title: this.$t('strategyCenter.gridOrders.cell'), dataIndex: 'cell_index', width: 72 },
        { title: this.$t('strategyCenter.gridOrders.purpose'), dataIndex: 'purpose_label', width: 130 },
        { title: this.$t('strategyCenter.gridOrders.side'), dataIndex: 'side', scopedSlots: { customRender: 'side' }, width: 80 },
        { title: this.$t('strategyCenter.gridOrders.price'), dataIndex: 'price', scopedSlots: { customRender: 'number' }, width: 120 },
        { title: this.$t('strategyCenter.gridOrders.quantity'), dataIndex: 'quantity', scopedSlots: { customRender: 'number' }, width: 130 },
        { title: this.$t('strategyCenter.gridOrders.filled'), dataIndex: 'filled_quantity', scopedSlots: { customRender: 'number' }, width: 120 },
        { title: this.$t('strategyCenter.gridOrders.status'), dataIndex: 'status', scopedSlots: { customRender: 'status' }, width: 100 },
        { title: this.$t('strategyCenter.gridOrders.exchangeOrderId'), dataIndex: 'exchange_order_id', scopedSlots: { customRender: 'exchangeOrderId' }, width: 210 },
        { title: this.$t('strategyCenter.gridOrders.updatedAt'), dataIndex: 'updated_at', scopedSlots: { customRender: 'updatedAt' }, width: 170 }
      ]
    }
  },
  watch: {
    strategyId: {
      immediate: true,
      handler () { this.load(true) }
    }
  },
  mounted () {
    this.timer = setInterval(() => this.load(false), 15000)
  },
  beforeDestroy () {
    if (this.timer) clearInterval(this.timer)
  },
  methods: {
    async load (sync) {
      if (!this.strategyId || this.loading) return
      this.loading = true
      try {
        const response = await getGridRestingOrders(this.strategyId, { status: '', limit: 200, sync })
        const data = response && response.data || {}
        this.orders = data.orders || data.items || []
        this.summary = data.summary || {}
      } finally {
        this.loading = false
      }
    },
    statusColor (value) {
      const status = String(value || '').toLowerCase()
      if (status === 'filled') return 'green'
      if (status === 'partial') return 'orange'
      if (['cancelled', 'rejected', 'failed'].includes(status)) return 'red'
      return 'blue'
    },
    formatNumber (value) {
      const number = Number(value)
      return Number.isFinite(number) ? number.toLocaleString(undefined, { maximumFractionDigits: 12 }) : '-'
    },
    formatTime (value) {
      if (!value) return '-'
      const date = new Date(value)
      return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString()
    }
  }
}
</script>

<style scoped>
.grid-orders-panel { padding: 18px; }
.grid-orders-head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin-bottom: 14px; }
.grid-orders-head h3 { margin: 0; color: var(--text-primary, #e5e7eb); }
.grid-orders-head p { margin: 5px 0 0; color: var(--text-secondary, #8b949e); }
.grid-order-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 14px 0; }
.grid-order-summary div { padding: 12px; border: 1px solid #27313a; border-radius: 10px; background: #101418; }
.grid-order-summary span, .grid-order-summary strong { display: block; }
.grid-order-summary span { color: #8b949e; font-size: 12px; }
.grid-order-summary strong { margin-top: 4px; color: #e5e7eb; }
.grid-order-summary .danger strong, code.missing { color: #ff7875; }
code { color: #91caff; word-break: break-all; }
.grid-orders-empty { padding: 36px; display: flex; flex-direction: column; align-items: center; gap: 7px; color: #8b949e; }
.grid-orders-empty strong { color: #e5e7eb; }
@media (max-width: 900px) { .grid-order-summary { grid-template-columns: 1fr 1fr; } }
</style>
