/**
 * Shared "track by token contract address" behaviour for every add-to-watchlist
 * surface.
 *
 * There are three independent add-to-watchlist modals (ai-analysis/index.vue,
 * CopilotWorkbench.vue, indicator-ide/index.vue), each with its own search box
 * and its own selection variable. Wiring them one at a time is what let a
 * pasted address fall through to the CCXT symbol search in the unwired ones, so
 * the detection / resolution / duplicate / error logic lives here once and each
 * component only supplies its own selection binding.
 */

import {
  isTokenAddress,
  resolveTokenByAddress,
  dexRowAddress,
  DEX_EXCHANGE_PREFIX
} from '@/api/dexscreener'

/** True for anything the user plausibly meant as a contract address. */
export function looksLikeTokenAddress (value) {
  return /^0x/i.test(String(value || '').trim())
}

export default {
  data () {
    return {
      dexResolving: false,
      dexError: '',
      dexToken: null
    }
  },
  computed: {
    // Scopes the local DEX watchlist per account so two users sharing a browser
    // do not see each other's tokens.
    dexUserId () {
      const info = this.$store && this.$store.getters && this.$store.getters.userInfo
      return (info && info.id) || ''
    }
  },
  methods: {
    dexI18n (key, fallback, values) {
      const translated = this.$t ? this.$t(`watchlist.dex.${key}`, values) : ''
      if (translated && translated !== `watchlist.dex.${key}`) return translated
      return Object.entries(values || {}).reduce(
        (text, [name, value]) => text.replace(new RegExp(`\\{${name}\\}`, 'g'), value),
        fallback
      )
    },
    clearDexResolution () {
      this.dexResolving = false
      this.dexError = ''
      this.dexToken = null
    },
    // DEX tokens are routinely sub-cent, so a fixed 2dp would render them as 0.
    formatDexPrice (value) {
      const n = Number(value || 0)
      if (!n) return '0'
      if (n >= 1) return n.toFixed(4)
      if (n >= 0.0001) return n.toFixed(6)
      return n.toExponential(4)
    },
    formatDexLiquidity (value) {
      const n = Number(value || 0)
      if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
      if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'
      if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K'
      return n.toFixed(2)
    },
    /** Watchlist row shape for a resolved token. */
    dexRowFromToken (token) {
      return {
        market: 'Crypto',
        symbol: token.pairSymbol,
        name: token.name,
        exchange_id: DEX_EXCHANGE_PREFIX + token.chainId,
        market_type: 'spot',
        instrument_id: token.address,
        settle_currency: token.quoteSymbol
      }
    },
    /**
     * Resolve a pasted address to a watchlist row, or return null and leave a
     * message in `dexError`. Sets `dexToken` for the confirmation card.
     */
    async resolveDexAddress (rawAddress, existingRows) {
      const address = String(rawAddress || '').trim()
      this.dexToken = null
      this.dexError = ''

      if (!isTokenAddress(address)) {
        this.dexError = this.dexI18n(
          'invalidAddress',
          'That does not look like a token contract address (expected 0x followed by 40 hex characters).'
        )
        return null
      }

      const duplicate = (existingRows || []).find(
        row => dexRowAddress(row).toLowerCase() === address.toLowerCase()
      )
      if (duplicate) {
        this.dexError = this.dexI18n(
          'duplicate',
          '{symbol} is already in your watchlist.',
          { symbol: duplicate.symbol }
        )
        return null
      }

      this.dexResolving = true
      try {
        const token = await resolveTokenByAddress(address)
        if (!token) {
          this.dexError = this.dexI18n('notFound', 'Token not found on any supported DEX.')
          return null
        }
        this.dexToken = token
        return this.dexRowFromToken(token)
      } catch (e) {
        // Only transport failures land here; "not found" is the null above.
        this.dexError = this.dexI18n(
          'lookupFailed',
          'Could not reach DexScreener. Check your connection and try again.'
        )
        return null
      } finally {
        this.dexResolving = false
      }
    }
  }
}
