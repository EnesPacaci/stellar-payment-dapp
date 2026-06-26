import { useState, useEffect } from 'react'
import { Horizon, TransactionBuilder, Asset, Networks, Operation } from '@stellar/stellar-sdk'
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit'

import { FreighterModule, FREIGHTER_ID } from '@creit.tech/stellar-wallets-kit/modules/freighter'
import { AlbedoModule, ALBEDO_ID } from '@creit.tech/stellar-wallets-kit/modules/albedo'
import { LobstrModule, LOBSTR_ID } from '@creit.tech/stellar-wallets-kit/modules/lobstr'
import { xBullModule, XBULL_ID } from '@creit.tech/stellar-wallets-kit/modules/xbull'
import { RabetModule, RABET_ID } from '@creit.tech/stellar-wallets-kit/modules/rabet'
import { HanaModule, HANA_ID } from '@creit.tech/stellar-wallets-kit/modules/hana'

const SERVER = new Horizon.Server('https://horizon-testnet.stellar.org')

const kit = StellarWalletsKit.init({
  modules: [
    new FreighterModule(),
    new AlbedoModule(),
    new LobstrModule(),
    new xBullModule(),
    new RabetModule(),
    new HanaModule(),
  ],
  network: Networks.TESTNET,
})

function App() {
  const [publicKey, setPublicKey] = useState(null)
  const [balance, setBalance] = useState(null)
  const [destination, setDestination] = useState('')
  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState('')
  const [txHash, setTxHash] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [walletName, setWalletName] = useState('')

  useEffect(() => {
    const unsub = StellarWalletsKit.on('STATE_UPDATE', (e) => {
      if (e.payload.address) {
        setPublicKey(e.payload.address)
        fetchBalance(e.payload.address)
      }
    })
    return () => unsub()
  }, [])

  const fetchBalance = async (pk) => {
    try {
      const account = await SERVER.loadAccount(pk)
      const nativeBalance = account.balances.find((b) => b.asset_type === 'native')
      setBalance(nativeBalance.balance)
    } catch (error) {
      console.error("Balance fetch failed", error)
      setBalance('0')
    }
  }

  const connectWallet = async () => {
    try {
      const { address } = await StellarWalletsKit.authModal()
      if (StellarWalletsKit.selectedModule) {
        const module = StellarWalletsKit.selectedModule
        setWalletName(module.productName || 'Wallet')
      }
      setPublicKey(address)
      await fetchBalance(address)
      setStatus('')
    } catch (error) {
      console.error("Wallet connection failed", error)
      setStatus('Connection failed. Please ensure a wallet is available.')
    }
  }

  const disconnectWallet = () => {
    StellarWalletsKit.disconnect()
    setPublicKey(null)
    setBalance(null)
    setDestination('')
    setAmount('')
    setStatus('')
    setTxHash('')
    setWalletName('')
  }

  const sendTransaction = async () => {
    if (!destination) {
      setStatus('Please enter a destination address')
      return
    }
    if (!amount || parseFloat(amount) <= 0) {
      setStatus('Please enter a valid amount')
      return
    }

    setIsSending(true)
    setStatus('Building transaction...')
    setTxHash('')

    try {
      const account = await SERVER.loadAccount(publicKey)

      const transaction = new TransactionBuilder(account, {
        fee: await SERVER.fetchBaseFee(),
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          Operation.payment({
            destination,
            asset: Asset.native(),
            amount,
          })
        )
        .setTimeout(60)
        .build()

      setStatus('Waiting for wallet signature...')
      const { signedTxXdr } = await StellarWalletsKit.signTransaction(transaction.toXDR(), {
        networkPassphrase: Networks.TESTNET,
      })

      setStatus('Submitting to network...')
      const signedTx = TransactionBuilder.fromXDR(signedTxXdr, Networks.TESTNET)
      const result = await SERVER.submitTransaction(signedTx)

      setTxHash(result.hash)
      setStatus('Transaction successful!')
      await fetchBalance(publicKey)
      setDestination('')
      setAmount('')
    } catch (error) {
      console.error("Transaction failed", error)
      const msg = error.message || String(error)
      if (msg.includes('user rejected') || msg.includes('rejected')) {
        setStatus('Transaction rejected by user.')
      } else if (msg.includes('account') && msg.includes('not found')) {
        setStatus('Account not found on testnet. Get XLM from friendbot first.')
      } else {
        setStatus(`Error: ${msg}`)
      }
    } finally {
      setIsSending(false)
    }
  }

  const isError = status && (status.startsWith('Error') || status.includes('failed') || status.includes('rejected') || status.includes('not found'))

  const s = {
    wrap: { minHeight: '100vh', background: '#f0f2f5' },
    header: {
      background: '#1a1a2e',
      color: 'white',
      padding: '14px 24px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    title: { fontWeight: 700, fontSize: '17px', letterSpacing: '-0.3px' },
    walletRow: { display: 'flex', alignItems: 'center', gap: '14px' },
    balanceHeader: { fontSize: '13px', opacity: 0.85, fontFamily: 'monospace' },
    addr: { fontSize: '13px', opacity: 0.7, fontFamily: 'monospace', background: 'rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: '4px' },
    connectBtn: {
      background: '#6366f1', color: 'white', border: 'none',
      padding: '8px 20px', borderRadius: '6px', cursor: 'pointer',
      fontSize: '14px', fontWeight: 600,
    },
    disconnectBtn: {
      background: 'transparent', color: 'white',
      border: '1px solid rgba(255,255,255,0.25)',
      padding: '6px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
    },
    main: { maxWidth: 440, margin: '48px auto', padding: '0 20px' },
    card: {
      background: 'white', borderRadius: '12px',
      padding: '32px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    },
    desc: { color: '#777', fontSize: '14px', marginBottom: '24px', lineHeight: '1.6' },
    label: { display: 'block', fontSize: '13px', fontWeight: 500, color: '#555', marginBottom: '6px' },
    input: {
      width: '100%', padding: '11px 14px', border: '1px solid #e0e0e0',
      borderRadius: '8px', fontSize: '14px', marginBottom: '16px',
      outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace',
      transition: 'border 0.2s',
    },
    sendBtn: {
      width: '100%', background: '#6366f1', color: 'white', border: 'none',
      padding: '12px', borderRadius: '8px', fontSize: '14px', fontWeight: 600,
      cursor: 'pointer', marginTop: '4px', letterSpacing: '0.2px',
    },
    sendBtnDisabled: {
      width: '100%', background: '#e0e0e0', color: '#999', border: 'none',
      padding: '12px', borderRadius: '8px', fontSize: '14px', fontWeight: 600,
      cursor: 'not-allowed', marginTop: '4px',
    },
    status: { marginTop: '14px', fontSize: '13px', color: '#888' },
    error: { marginTop: '14px', fontSize: '13px', color: '#dc2626' },
    prompt: { textAlign: 'center', color: '#aaa', fontSize: '14px', marginTop: '20px' },
  }

  return (
    <div style={s.wrap}>
      <header style={s.header}>
        <span style={s.title}>Stellar Payment dApp</span>
        {publicKey ? (
          <div style={s.walletRow}>
            <span style={s.balanceHeader}>Your balance: {balance ? `${parseFloat(balance).toFixed(7)} XLM` : '...'}</span>
            <span style={s.addr}>{publicKey.slice(0, 6)}...{publicKey.slice(-4)}</span>
            <button style={s.disconnectBtn} onClick={disconnectWallet}>Disconnect</button>
          </div>
        ) : (
          <button style={s.connectBtn} onClick={connectWallet}>Connect Wallet</button>
        )}
      </header>

      <main style={s.main}>
        <div style={s.card}>
          <p style={s.desc}>
            Send XLM on the Stellar testnet. Connect your wallet, enter a destination address and amount, then send.
          </p>

          {publicKey ? (
            <div>
              <label style={s.label}>Destination Address</label>
              <input
                style={s.input}
                type="text"
                placeholder="G..."
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              />

              <label style={s.label}>Amount (XLM)</label>
              <input
                style={s.input}
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="0"
                step="0.01"
              />

              <button
                style={isSending ? s.sendBtnDisabled : s.sendBtn}
                onClick={sendTransaction}
                disabled={isSending}
              >
                {isSending ? 'Sending...' : 'Send XLM'}
              </button>
            </div>
          ) : (
            <p style={s.prompt}>Connect your wallet to send XLM.</p>
          )}

          {status && (
            <p style={isError ? s.error : s.status}>{status}</p>
          )}
        </div>
      </main>
    </div>
  )
}

export default App
