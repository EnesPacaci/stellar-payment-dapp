import { useState, useEffect, useCallback } from 'react'
import { requestAccess, signTransaction } from '@stellar/freighter-api'
import { Horizon, TransactionBuilder, Asset, Networks, Operation } from '@stellar/stellar-sdk'

const SERVER = new Horizon.Server('https://horizon-testnet.stellar.org')

function Confetti({ active }) {
  const [pieces, setPieces] = useState([])

  useEffect(() => {
    if (!active) { setPieces([]); return }
    const colors = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#f43f5e', '#8b5cf6']
    const newPieces = Array.from({ length: 80 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: Math.random() * 0.8,
      duration: 1.5 + Math.random() * 1.5,
      rotation: Math.random() * 360,
      size: 6 + Math.random() * 8,
    }))
    setPieces(newPieces)
  }, [active])

  if (!active || pieces.length === 0) return null

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999, overflow: 'hidden' }}>
      {pieces.map(p => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            left: `${p.left}%`,
            top: '-20px',
            width: `${p.size}px`,
            height: `${p.size * 0.6}px`,
            background: p.color,
            borderRadius: '2px',
            animation: `confettiFall ${p.duration}s ease-in ${p.delay}s forwards`,
            transform: `rotate(${p.rotation}deg)`,
          }}
        />
      ))}
      <style>{`
        @keyframes confettiFall {
          0% { opacity: 1; transform: translateY(0) rotate(0deg) scale(1); }
          50% { opacity: 1; }
          100% { opacity: 0; transform: translateY(100vh) rotate(720deg) scale(0.5); }
        }
      `}</style>
    </div>
  )
}

function SuccessOverlay({ show, hash, onClose }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (show) {
      setTimeout(() => setVisible(true), 50)
    } else {
      setVisible(false)
    }
  }, [show])

  if (!show) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.3s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: '16px', padding: '40px',
          textAlign: 'center', maxWidth: '380px', width: '90%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          transform: visible ? 'scale(1)' : 'scale(0.8)',
          transition: 'transform 0.3s ease',
        }}
      >
        <div style={{
          width: '64px', height: '64px', borderRadius: '50%',
          background: '#eef2ff', display: 'flex', alignItems: 'center',
          justifyContent: 'center', margin: '0 auto 16px',
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#1a1a2e', marginBottom: '8px' }}>
          Transaction Successful!
        </h3>
        <p style={{ fontSize: '13px', color: '#888', marginBottom: '16px' }}>
          Your XLM has been sent on the Stellar testnet.
        </p>
        {hash && (
          <a
            href={`https://stellar.expert/explorer/testnet/tx/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-block', fontSize: '11px', color: '#6366f1',
              fontFamily: 'monospace', wordBreak: 'break-all',
              textDecoration: 'none', background: '#f0f0ff',
              padding: '8px 12px', borderRadius: '6px', marginBottom: '20px',
            }}
          >
            {hash}
          </a>
        )}
        <br />
        <button
          onClick={onClose}
          style={{
            background: '#6366f1', color: 'white', border: 'none',
            padding: '10px 32px', borderRadius: '8px', fontSize: '14px',
            fontWeight: 600, cursor: 'pointer', marginTop: '8px',
          }}
        >
          OK
        </button>
      </div>
    </div>
  )
}

function App() {
  const [publicKey, setPublicKey] = useState(null)
  const [balance, setBalance] = useState(null)
  const [destination, setDestination] = useState('')
  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState('')
  const [txHash, setTxHash] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

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
    setStatus('Connecting...')
    try {
      const result = await requestAccess()
      if (result.error) {
        throw new Error(result.error.message)
      }
      setPublicKey(result.address)
      await fetchBalance(result.address)
      setStatus('')
    } catch (error) {
      console.error("Wallet connection failed", error)
      setStatus('Connection failed. Make sure Freighter is installed and set to Testnet.')
    }
  }

  const disconnectWallet = () => {
    setPublicKey(null)
    setBalance(null)
    setDestination('')
    setAmount('')
    setStatus('')
    setTxHash('')
    setShowConfetti(false)
    setShowSuccess(false)
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
      const signResult = await signTransaction(transaction.toXDR(), {
        networkPassphrase: Networks.TESTNET,
      })

      if (signResult.error) {
        throw new Error(signResult.error.message)
      }

      setStatus('Submitting to network...')
      const signedTx = TransactionBuilder.fromXDR(
        signResult.signedTxXdr,
        Networks.TESTNET
      )
      const result = await SERVER.submitTransaction(signedTx)

      setTxHash(result.hash)
      setStatus('')
      setShowConfetti(true)
      setShowSuccess(true)
      await fetchBalance(publicKey)
      setDestination('')
      setAmount('')

      setTimeout(() => setShowConfetti(false), 4000)
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
      <Confetti active={showConfetti} />
      <SuccessOverlay
        show={showSuccess}
        hash={txHash}
        onClose={() => setShowSuccess(false)}
      />

      <header style={s.header}>
        <span style={s.title}>Stellar Payment dApp</span>
        {publicKey ? (
          <div style={s.walletRow}>
            <span style={s.balanceHeader}>Your balance: {balance ? `${parseFloat(balance).toFixed(7)} XLM` : '...'}</span>
            <span style={s.addr}>{publicKey.slice(0, 6)}...{publicKey.slice(-4)}</span>
            <button style={s.disconnectBtn} onClick={disconnectWallet}>Disconnect</button>
          </div>
        ) : (
          <button style={s.connectBtn} onClick={connectWallet}>Connect Freighter</button>
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
