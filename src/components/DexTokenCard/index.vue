<template>
  <div class="dex-token-section">
    <div v-if="resolving" class="dex-token-loading">{{ labels.resolving }}</div>
    <a-alert v-else-if="error" type="error" show-icon :message="error" />
    <div v-else-if="token" class="dex-token-card">
      <div class="dex-token-head">
        <strong class="dex-token-symbol">{{ token.symbol }}</strong>
        <span class="dex-token-name">{{ token.name }}</span>
        <a-tag color="purple">{{ token.chainId }}</a-tag>
        <a-tag color="gold">{{ token.dexId }}</a-tag>
      </div>
      <div class="dex-token-stats">
        <span class="dex-stat">
          <span class="dex-stat-label">{{ labels.price }}</span>
          <span class="dex-stat-value">${{ formatPrice(token.priceUsd) }}</span>
        </span>
        <span class="dex-stat">
          <span class="dex-stat-label">{{ labels.change }}</span>
          <span class="dex-stat-value" :class="token.change24h >= 0 ? 'dex-up' : 'dex-down'">
            {{ token.change24h >= 0 ? '+' : '' }}{{ Number(token.change24h).toFixed(2) }}%
          </span>
        </span>
        <span class="dex-stat">
          <span class="dex-stat-label">{{ labels.liquidity }}</span>
          <span class="dex-stat-value">${{ formatLiquidity(token.liquidityUsd) }}</span>
        </span>
      </div>
      <div class="dex-token-pair">{{ pairLine }}</div>
    </div>
  </div>
</template>

<script>
/**
 * Confirmation row shown before a DEX-tracked token is added, so the user can
 * see which pair was picked. Shared by all three add-to-watchlist modals.
 */
export default {
  name: 'DexTokenCard',
  props: {
    token: { type: Object, default: null },
    error: { type: String, default: '' },
    resolving: { type: Boolean, default: false },
    formatPrice: { type: Function, required: true },
    formatLiquidity: { type: Function, required: true },
    t: { type: Function, required: true }
  },
  computed: {
    labels () {
      return {
        resolving: this.t('resolving', 'Looking up token on DexScreener...'),
        price: this.t('price', 'Price'),
        change: this.t('change24h', '24h'),
        liquidity: this.t('liquidity', 'Liquidity')
      }
    },
    pairLine () {
      if (!this.token) return ''
      return this.t(
        'pairChosen',
        'Tracking {pair} on {dex} — deepest of {count} pairs',
        { pair: this.token.pairSymbol, dex: this.token.dexId, count: this.token.pairCount }
      )
    }
  }
}
</script>

<style lang="less" scoped>
.dex-token-section {
  margin-top: 12px;
}

.dex-token-loading {
  padding: 12px 0;
  color: var(--primary-color, #a37764);
}

.dex-token-card {
  padding: 12px 14px;
  border: 1px solid var(--primary-color-soft-strong, color-mix(in srgb, var(--primary-color, #a37764) 18%, transparent));
  border-radius: 8px;
  background: var(--primary-color-soft, color-mix(in srgb, var(--primary-color, #a37764) 8%, transparent));
}

.dex-token-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.dex-token-symbol {
  font-size: 16px;
}

.dex-token-name {
  color: #9c8478;
}

.dex-token-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  margin-top: 10px;
}

.dex-stat {
  display: flex;
  flex-direction: column;
}

.dex-stat-label {
  font-size: 12px;
  color: #9c8478;
}

.dex-stat-value {
  font-weight: 600;
}

.dex-up { color: #16a34a; }
.dex-down { color: #dc2626; }

.dex-token-pair {
  margin-top: 10px;
  font-size: 12px;
  color: #9c8478;
}
</style>
