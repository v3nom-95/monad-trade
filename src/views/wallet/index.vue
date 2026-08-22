<template>
  <div class="wallet-view">
    <div class="wallet-head">
      <h1>Wallet</h1>
      <p>Connect a browser wallet on Monad Testnet to deposit collateral to Kuru.</p>
    </div>

    <!-- 1. CONNECT -->
    <a-card :bordered="false" class="wallet-card">
      <div v-if="!account" class="connect-row">
        <a-button type="primary" icon="link" :loading="connecting" @click="connect">
          {{ connecting ? 'Connecting…' : 'Connect wallet' }}
        </a-button>
        <span v-if="!hasWallet" class="muted">No browser wallet detected.</span>
      </div>
      <div v-else class="connect-row">
        <a-tag color="green">Connected</a-tag>
        <span class="mono">{{ shortAddress(account) }}</span>
        <a-button size="small" @click="disconnect">Disconnect</a-button>
      </div>
      <a-alert v-if="connectError" type="error" show-icon :message="connectError" style="margin-top: 12px;" />
    </a-card>

    <!-- 2. NETWORK GUARD -->
    <a-card v-if="account && !onCorrectChain" :bordered="false" class="wallet-card guard-card">
      <h3 class="guard-title">Wrong network</h3>
      <p v-if="chainId === MAINNET_CHAIN_ID">
        Your wallet is on <strong>Monad mainnet (143)</strong>. This app runs on
        <strong>Monad Testnet ({{ CHAIN_ID }})</strong>. These are real funds versus test funds —
        switch before doing anything.
      </p>
      <p v-else>
        Your wallet is on chain <strong>{{ chainId === null ? 'unknown' : chainId }}</strong>.
        This app runs on <strong>Monad Testnet ({{ CHAIN_ID }})</strong>.
      </p>
      <a-button type="primary" :loading="switching" @click="switchChain">
        {{ switching ? 'Switching…' : 'Switch to Monad Testnet' }}
      </a-button>
      <a-alert v-if="switchError" type="error" show-icon :message="switchError" style="margin-top: 12px;" />
    </a-card>

    <template v-if="account && onCorrectChain">
      <!-- 3. BALANCE + RESERVE FLOOR -->
      <a-card :bordered="false" class="wallet-card">
        <div class="balance-row">
          <div>
            <div class="label">Native MON</div>
            <div class="muted-sm">Read at block tag `latest`.</div>
          </div>
          <div class="balance-value">{{ balance === null ? '…' : formatMon(balance) }}</div>
        </div>
      </a-card>

      <a-alert
        v-if="belowFloor"
        type="warning"
        show-icon
        style="margin-bottom: 16px;"
      >
        <span slot="message">Below the 10 MON reserve floor</span>
        <span slot="description">
          Trading still works — Monad's emptying-transaction exception lets you spend below the
          floor — but you are limited to <strong>one transaction every ~1.2 seconds</strong>.
          If a second transaction fires too quickly it will fail; that is the network rule, not this app.
        </span>
      </a-alert>

      <!-- 4. KURU DEPOSIT -->
      <a-card :bordered="false" class="wallet-card">
        <h3 class="section-title">Deposit collateral to Kuru</h3>
        <p class="muted">
          MarginAccount is the collateral layer of the Kuru DEX. Limit orders settle from this
          balance, not from your wallet — so this is step 1 of the trading flow.
        </p>

        <div class="balance-row">
          <div class="label">Your Kuru collateral</div>
          <div class="mono">{{ collateral === null ? '…' : formatMon(collateral) + ' MON' }}</div>
        </div>

        <a-alert type="error" show-icon style="margin: 16px 0;">
          <span slot="message">No withdraw function — read before depositing</span>
          <span slot="description">
            We enumerated all 41 selectors in the deployed MarginAccount implementation. It exposes
            <code>deposit</code> and <code>getBalance</code>, but <strong>no withdraw</strong> of any
            standard shape. Deposited MON can back orders but may not be retrievable.
            Deposit only what you are willing to leave there.
          </span>
        </a-alert>

        <div class="deposit-row">
          <a-input v-model="amount" addon-after="MON" style="width: 220px;" />
          <a-button :disabled="maxAmount === null" @click="setMax">Max</a-button>
          <a-button type="primary" :loading="sending" :disabled="!canDeposit" @click="confirming = true">
            Review deposit
          </a-button>
        </div>

        <div class="gas-lines">
          <div><span class="label">Contract</span><span class="mono">{{ MARGIN_ACCOUNT }}</span></div>
          <div><span class="label">Gas limit (est +18%)</span><span class="mono">{{ gasLimit === null ? '—' : gasLimit.toString() }}</span></div>
          <div><span class="label">Worst-case gas (limit × max fee)</span><span class="mono">{{ worstGas === null ? '—' : formatMon(worstGas, 6) + ' MON' }}</span></div>
        </div>

        <a-alert v-if="depositError" type="error" show-icon :message="depositError" style="margin-top: 12px;" />

        <div v-if="txHash" class="tx-box">
          <div><strong>{{ txStatus }}</strong></div>
          <a :href="EXPLORER + '/tx/' + txHash" target="_blank" rel="noopener noreferrer" class="mono">{{ txHash }}</a>
        </div>
      </a-card>
    </template>

    <!-- CONFIRMATION -->
    <a-modal
      :visible="confirming"
      title="Confirm deposit"
      ok-text="Deposit"
      :confirm-loading="sending"
      :wrapClassName="isDarkTheme ? 'qd-dark-modal' : ''"
      @ok="deposit"
      @cancel="confirming = false"
    >
      <p>
        Deposit <strong>{{ amount }} MON</strong> as collateral to
        <span class="mono">{{ MARGIN_ACCOUNT }}</span>.
      </p>
      <p class="muted">
        Monad charges gas on the <strong>limit</strong>, not on gas used, so this costs up to
        <strong>{{ worstGas === null ? '—' : formatMon(worstGas, 6) }} MON</strong> regardless.
      </p>
      <a-tag color="purple">testnet {{ CHAIN_ID }}</a-tag>
    </a-modal>
  </div>
</template>

<script>
import {
  ADD_CHAIN_PARAMS, CHAIN_ID, CHAIN_ID_HEX, EXPLORER, MAINNET_CHAIN_ID,
  MARGIN_ACCOUNT, NATIVE_TOKEN, RESERVE_FLOOR_WEI,
  encodeDeposit, encodeGetBalance, formatMon, hasWallet, padGasLimit,
  publicRpc, rpc, shortAddress, toWei, worstCaseGasWei
} from '@/utils/chain/monad'

export default {
  name: 'WalletView',
  data () {
    return {
      CHAIN_ID, CHAIN_ID_HEX, MAINNET_CHAIN_ID, MARGIN_ACCOUNT, EXPLORER,
      hasWallet: hasWallet(),
      account: '',
      chainId: null,
      balance: null,
      collateral: null,
      connecting: false,
      switching: false,
      sending: false,
      connectError: '',
      switchError: '',
      depositError: '',
      amount: '1',
      gasLimit: null,
      maxFeePerGas: null,
      confirming: false,
      txHash: '',
      txStatus: '',
      onChainChanged: null
    }
  },
  computed: {
    isDarkTheme () {
      const t = this.$store && this.$store.state.app && this.$store.state.app.theme
      return t === 'dark' || t === 'realdark'
    },
    onCorrectChain () {
      return this.chainId === CHAIN_ID
    },
    belowFloor () {
      return this.balance !== null && BigInt(this.balance) < RESERVE_FLOOR_WEI
    },
    worstGas () {
      if (this.gasLimit === null || this.maxFeePerGas === null) return null
      return worstCaseGasWei(this.gasLimit, this.maxFeePerGas)
    },
    /** Max leaves 3x worst-case gas so a deposit can never strand the account. */
    maxAmount () {
      if (this.balance === null || this.worstGas === null) return null
      const head = this.worstGas * 3n
      const b = BigInt(this.balance)
      return b > head ? b - head : 0n
    },
    canDeposit () {
      if (!this.account || !this.onCorrectChain || this.gasLimit === null) return false
      let v
      try { v = toWei(this.amount) } catch (e) { return false }
      if (v <= 0n) return false
      // The only genuine hard block: cannot cover the amount plus worst-case gas.
      return this.balance !== null && v + (this.worstGas || 0n) <= BigInt(this.balance)
    }
  },
  watch: {
    amount () { this.refreshGas() }
  },
  mounted () {
    if (!this.hasWallet) return
    this.onChainChanged = (hex) => {
      this.chainId = parseInt(hex, 16)
      this.refreshAll()
    }
    window.ethereum.on('chainChanged', this.onChainChanged)
    window.ethereum.on('accountsChanged', (accs) => {
      this.account = (accs && accs[0]) || ''
      this.refreshAll()
    })
    // Restore a session the wallet already authorised.
    rpc('eth_accounts').then((accs) => {
      if (accs && accs.length) {
        this.account = accs[0]
        return this.readChain().then(() => this.refreshAll())
      }
    }).catch(() => {})
  },
  beforeDestroy () {
    if (this.hasWallet && this.onChainChanged) {
      window.ethereum.removeListener('chainChanged', this.onChainChanged)
    }
  },
  methods: {
    formatMon,
    shortAddress,
    async readChain () {
      const hex = await rpc('eth_chainId')
      this.chainId = parseInt(hex, 16)
    },
    async connect () {
      this.connecting = true
      this.connectError = ''
      try {
        const accs = await rpc('eth_requestAccounts')
        this.account = (accs && accs[0]) || ''
        await this.readChain()
        await this.refreshAll()
      } catch (e) {
        this.connectError = (e && e.message) || 'Could not connect.'
      } finally {
        this.connecting = false
      }
    },
    disconnect () {
      // EIP-1193 has no programmatic disconnect; clear local session state.
      this.account = ''
      this.balance = null
      this.collateral = null
      this.txHash = ''
    },
    async switchChain () {
      this.switching = true
      this.switchError = ''
      try {
        await rpc('wallet_switchEthereumChain', [{ chainId: CHAIN_ID_HEX }])
      } catch (e) {
        // 4902 = chain unknown to the wallet; add it, then it is selected.
        if (e && (e.code === 4902 || /unrecognized|not been added/i.test(e.message || ''))) {
          try {
            await rpc('wallet_addEthereumChain', [ADD_CHAIN_PARAMS])
          } catch (e2) {
            this.switchError = (e2 && e2.message) || 'Could not add Monad Testnet.'
          }
        } else {
          this.switchError = (e && e.message) || 'Could not switch network.'
        }
      } finally {
        this.switching = false
        try { await this.readChain(); await this.refreshAll() } catch (e) {}
      }
    },
    async refreshAll () {
      if (!this.account || !this.onCorrectChain) return
      await Promise.all([this.refreshBalance(), this.refreshCollateral(), this.refreshGas()])
    },
    async refreshBalance () {
      try {
        this.balance = BigInt(await publicRpc('eth_getBalance', [this.account, 'latest']))
      } catch (e) { this.balance = null }
    },
    async refreshCollateral () {
      try {
        const data = encodeGetBalance(this.account, NATIVE_TOKEN)
        const res = await publicRpc('eth_call', [{ to: MARGIN_ACCOUNT, data }, 'latest'])
        this.collateral = res && res !== '0x' ? BigInt(res) : 0n
      } catch (e) { this.collateral = null }
    },
    async refreshGas () {
      this.depositError = ''
      if (!this.account || !this.onCorrectChain) return
      let value
      try { value = toWei(this.amount) } catch (e) { this.gasLimit = null; return }
      if (value <= 0n) { this.gasLimit = null; return }
      try {
        const params = {
          from: this.account,
          to: MARGIN_ACCOUNT,
          data: encodeDeposit(this.account, NATIVE_TOKEN, value),
          value: '0x' + value.toString(16)
        }
        const [est, fee] = await Promise.all([
          publicRpc('eth_estimateGas', [params]),
          publicRpc('eth_gasPrice', [])
        ])
        this.gasLimit = padGasLimit(BigInt(est))
        this.maxFeePerGas = BigInt(fee)
      } catch (e) {
        this.gasLimit = null
        this.depositError = 'Simulation failed: ' + ((e && e.message) || 'unknown')
      }
    },
    setMax () {
      if (this.maxAmount === null) return
      this.amount = formatMon(this.maxAmount, 6)
    },
    async deposit () {
      this.sending = true
      this.depositError = ''
      try {
        const value = toWei(this.amount)
        const hash = await rpc('eth_sendTransaction', [{
          from: this.account,
          to: MARGIN_ACCOUNT,
          data: encodeDeposit(this.account, NATIVE_TOKEN, value),
          value: '0x' + value.toString(16),
          gas: '0x' + this.gasLimit.toString(16)
        }])
        this.txHash = hash
        this.txStatus = 'Submitted — waiting for receipt'
        this.confirming = false
        this.pollReceipt(hash)
      } catch (e) {
        this.depositError = (e && e.message) || 'Transaction rejected.'
      } finally {
        this.sending = false
      }
    },
    async pollReceipt (hash) {
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 1500))
        try {
          const r = await publicRpc('eth_getTransactionReceipt', [hash])
          if (r) {
            this.txStatus = r.status === '0x1' ? 'Deposit confirmed' : 'Transaction reverted'
            await this.refreshAll()
            return
          }
        } catch (e) { /* keep polling */ }
      }
      this.txStatus = 'Still pending — check the explorer'
    }
  }
}
</script>

<style lang="less" scoped>
.wallet-view { padding: 24px; max-width: 900px; }

.wallet-head {
  margin-bottom: 16px;
  h1 { font-size: 24px; font-weight: 600; margin: 0; color: var(--primary-color, #a37764); }
  p { color: #9c8478; margin: 4px 0 0; }
}

.wallet-card { margin-bottom: 16px; }

.connect-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }

.guard-card { border: 1px solid #dc2626 !important; }
.guard-title { color: #dc2626; font-weight: 600; margin-bottom: 6px; }

.section-title { font-size: 16px; font-weight: 600; margin-bottom: 4px; }

.balance-row {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
}

.balance-value { font-family: monospace; font-size: 28px; font-weight: 600; }

.label { color: #9c8478; font-size: 13px; }
.muted { color: #9c8478; }
.muted-sm { color: #9c8478; font-size: 12px; }
.mono { font-family: monospace; }

.deposit-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }

.gas-lines > div {
  display: flex; justify-content: space-between; gap: 16px; font-size: 13px; padding: 2px 0;
  .mono { font-size: 12px; }
}

.tx-box {
  margin-top: 14px; padding: 12px;
  border-radius: 6px;
  background: var(--primary-color-soft, color-mix(in srgb, var(--primary-color, #a37764) 10%, transparent));
  a { display: block; word-break: break-all; font-size: 12px; }
}
</style>
