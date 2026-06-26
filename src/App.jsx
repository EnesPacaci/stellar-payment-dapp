import { useState, useEffect, useCallback } from 'react'
import { Horizon, TransactionBuilder, Networks, Operation, Contract, Address, rpc, scValToNative, nativeToScVal } from '@stellar/stellar-sdk'
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit'

import { FreighterModule } from '@creit.tech/stellar-wallets-kit/modules/freighter'
import { AlbedoModule } from '@creit.tech/stellar-wallets-kit/modules/albedo'
import { LobstrModule } from '@creit.tech/stellar-wallets-kit/modules/lobstr'
import { xBullModule } from '@creit.tech/stellar-wallets-kit/modules/xbull'
import { RabetModule } from '@creit.tech/stellar-wallets-kit/modules/rabet'
import { HanaModule } from '@creit.tech/stellar-wallets-kit/modules/hana'

const HORIZON_SERVER = new Horizon.Server('https://horizon-testnet.stellar.org')
const SOROBAN_SERVER = new rpc.Server('https://soroban-testnet.stellar.org')
const CONTRACT_ID = 'CDVCR252R3SL4DDLTAX6XZ4G7K2EZAN5EURMNFYUNVM6A7ABVP5HRTLD'
const contract = new Contract(CONTRACT_ID)

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
  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState('')
  const [txHash, setTxHash] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [walletName, setWalletName] = useState('')
  const [totalRaised, setTotalRaised] = useState('0')
  const [goal, setGoal] = useState('0')
  const [recentDonors, setRecentDonors] = useState([])

  const fetchBalance = async (pk) => {
    try {
      const account = await HORIZON_SERVER.loadAccount(pk)
      const nativeBalance = account.balances.find((b) => b.asset_type === 'native')
      setBalance(nativeBalance.balance)
    } catch (error) {
      console.error("Balance fetch failed", error)
      setBalance('0')
    }
  }

  const invokeRead = useCallback(async (method, ...args) => {
    try {
      const sourceAccount = await HORIZON_SERVER.loadAccount(publicKey || 'GDGGSUZ42XTYN5MLZGLNNUGO446SVL6XVZQQSPTSCEM2PCHCRZCW3X3C')
      const tx = new TransactionBuilder(sourceAccount, {
        fee: '100',
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(contract.call(method, ...args))
        .setTimeout(30)
        .build()

      const result = await SOROBAN_SERVER.simulateTransaction(tx)
      if (result.error) throw result.error
      const retval = result.result?.retval
      if (!retval) return null
      return scValToNative(retval)
    } catch (error) {
      console.error(`Read ${method} failed:`, error)
      return null
    }
  }, [publicKey])

  const fetchContractData = useCallback(async () => {
    try {
      const goalResult = await invokeRead('get_goal')
      const raisedResult = await invokeRead('get_total_raised')

      if (goalResult !== null && goalResult !== undefined) setGoal(String(goalResult))
      if (raisedResult !== null && raisedResult !== undefined) setTotalRaised(String(raisedResult))
    } catch (error) {
      console.error("Contract read failed", error)
    }
  }, [invokeRead])

  const fetchRecentDonors = useCallback(async () => {
    try {
      const payments = await HORIZON_SERVER.payments()
        .limit(20)
        .order('desc')
        .call()

      const donors = []
      for (const record of payments._records) {
        if (record.type === 'payment' && record.asset_type === 'native') {
          donors.push({
            address: record.from,
            amount: record.amount,
            tx: record.transaction_hash,
            time: record.created_at,
          })
        }
        if (donors.length >= 5) break
      }
      setRecentDonors(donors)
    } catch (error) {
      console.error("Events fetch failed", error)
    }
  }, [])

  useEffect(() => {
    fetchContractData()
    fetchRecentDonors()
    const interval = setInterval(() => {
      fetchContractData()
      fetchRecentDonors()
    }, 10000)
    return () => clearInterval(interval)
  }, [fetchContractData, fetchRecentDonors])

  useEffect(() => {
    const unsub = StellarWalletsKit.on('STATE_UPDATE', (e) => {
      if (e.payload.address) {
        setPublicKey(e.payload.address)
        fetchBalance(e.payload.address)
      }
    })
    return () => unsub()
  }, [])

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
    setAmount('')
    setStatus('')
    setTxHash('')
    setWalletName('')
  }

  const sendTransaction = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setStatus('Please enter a valid amount')
      return
    }

    setIsSending(true)
    setStatus('Building transaction...')
    setTxHash('')

    try {
      const account = await HORIZON_SERVER.loadAccount(publicKey)
      const amountStroops = Math.floor(parseFloat(amount) * 10_000_000)

      const transaction = new TransactionBuilder(account, {
        fee: await HORIZON_SERVER.fetchBaseFee(),
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          contract.call(
            'donate',
            nativeToScVal(new Address(publicKey), { type: 'address' }),
            nativeToScVal(amountStroops, { type: 'i128' })
          )
        )
        .setTimeout(60)
        .build()

      setStatus('Simulating transaction...')
      const simResult = await SOROBAN_SERVER.simulateTransaction(transaction)
      if (simResult.error) throw simResult.error

      const assembledTx = rpc.assembleTransaction(transaction, simResult).build()

      setStatus('Waiting for wallet signature...')
      const { signedTxXdr } = await StellarWalletsKit.signTransaction(assembledTx.toXDR(), {
        networkPassphrase: Networks.TESTNET,
      })

      setStatus('Submitting to network...')
      const signedTx = TransactionBuilder.fromXDR(signedTxXdr, Networks.TESTNET)
      const result = await HORIZON_SERVER.submitTransaction(signedTx)

      setTxHash(result.hash)
      setStatus('Donation successful!')
      await fetchBalance(publicKey)
      await fetchContractData()
      await fetchRecentDonors()
      setAmount('')
    } catch (error) {
      console.error("Transaction failed", error)
      const msg = error.message || String(error)
      if (msg.includes('user rejected') || msg.includes('rejected')) {
        setStatus('Transaction rejected by user.')
      } else if (msg.includes('account') && msg.includes('not found')) {
        setStatus('Account not found on testnet. Get XLM from friendbot first.')
      } else if (msg.includes('insufficient') || msg.includes('underfunded')) {
        setStatus('Insufficient balance for this donation.')
      } else {
        setStatus(`Error: ${msg}`)
      }
    } finally {
      setIsSending(false)
    }
  }

  const isError = status && (status.startsWith('Error') || status.includes('failed') || status.includes('rejected') || status.includes('not found') || status.includes('Insufficient'))

  const goalXLM = parseFloat(goal) / 10_000_000
  const raisedXLM = parseFloat(totalRaised) / 10_000_000
  const progressPct = goalXLM > 0 ? Math.min((raisedXLM / goalXLM) * 100, 100) : 0

  const s = {
    wrap: { minHeight: '100vh', background: '#0f172a' },
    header: {
      background: '#1e293b',
      color: 'white',
      padding: '14px 24px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderBottom: '1px solid #334155',
    },
    title: { fontWeight: 700, fontSize: '17px', letterSpacing: '-0.3px', color: '#38bdf8' },
    walletRow: { display: 'flex', alignItems: 'center', gap: '14px' },
    balanceHeader: { fontSize: '13px', opacity: 0.85, fontFamily: 'monospace' },
    addr: { fontSize: '13px', opacity: 0.7, fontFamily: 'monospace', background: 'rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: '4px' },
    connectBtn: {
      background: '#38bdf8', color: '#0f172a', border: 'none',
      padding: '8px 20px', borderRadius: '6px', cursor: 'pointer',
      fontSize: '14px', fontWeight: 600,
    },
    disconnectBtn: {
      background: 'transparent', color: 'white',
      border: '1px solid rgba(255,255,255,0.25)',
      padding: '6px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
    },
    main: { maxWidth: 520, margin: '48px auto', padding: '0 20px' },
    card: {
      background: '#1e293b', borderRadius: '12px',
      padding: '32px', boxShadow: '0 2px 16px rgba(0,0,0,0.3)',
      border: '1px solid #334155',
    },
    statsRow: { display: 'flex', justifyContent: 'space-between', marginBottom: '24px' },
    statBox: { textAlign: 'center', flex: 1 },
    statValue: { fontSize: '22px', fontWeight: 700, color: '#38bdf8', fontFamily: 'monospace' },
    statLabel: { fontSize: '12px', color: '#94a3b8', marginTop: '4px' },
    progressBar: {
      width: '100%', height: '12px', background: '#334155',
      borderRadius: '6px', overflow: 'hidden', marginBottom: '8px',
    },
    progressFill: {
      height: '100%', background: 'linear-gradient(90deg, #38bdf8, #818cf8)',
      borderRadius: '6px', transition: 'width 0.5s ease', width: `${progressPct}%`,
    },
    progressText: { fontSize: '13px', color: '#94a3b8', marginBottom: '24px', textAlign: 'right' },
    desc: { color: '#94a3b8', fontSize: '14px', marginBottom: '24px', lineHeight: '1.6' },
    label: { display: 'block', fontSize: '13px', fontWeight: 500, color: '#cbd5e1', marginBottom: '6px' },
    input: {
      width: '100%', padding: '11px 14px', border: '1px solid #334155',
      borderRadius: '8px', fontSize: '14px', marginBottom: '16px',
      outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace',
      transition: 'border 0.2s', background: '#0f172a', color: 'white',
    },
    sendBtn: {
      width: '100%', background: '#38bdf8', color: '#0f172a', border: 'none',
      padding: '12px', borderRadius: '8px', fontSize: '14px', fontWeight: 600,
      cursor: 'pointer', marginTop: '4px', letterSpacing: '0.2px',
    },
    sendBtnDisabled: {
      width: '100%', background: '#334155', color: '#64748b', border: 'none',
      padding: '12px', borderRadius: '8px', fontSize: '14px', fontWeight: 600,
      cursor: 'not-allowed', marginTop: '4px',
    },
    status: { marginTop: '14px', fontSize: '13px', color: '#94a3b8', textAlign: 'center' },
    error: { marginTop: '14px', fontSize: '13px', color: '#f87171', textAlign: 'center' },
    prompt: { textAlign: 'center', color: '#64748b', fontSize: '14px', marginTop: '20px' },
    donorsSection: { marginTop: '24px', borderTop: '1px solid #334155', paddingTop: '20px' },
    donorsTitle: { fontSize: '14px', fontWeight: 600, color: '#cbd5e1', marginBottom: '12px' },
    donorRow: {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '8px 0', borderBottom: '1px solid #1e293b',
    },
    donorAddr: { fontSize: '12px', fontFamily: 'monospace', color: '#94a3b8' },
    donorAmount: { fontSize: '13px', fontWeight: 600, color: '#38bdf8' },
    donorTime: { fontSize: '11px', color: '#64748b' },
    noDonors: { fontSize: '13px', color: '#64748b', textAlign: 'center', padding: '16px' },
    quickBtns: { display: 'flex', gap: '8px', marginBottom: '16px' },
    quickBtn: {
      flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #334155',
      background: 'transparent', color: '#38bdf8', cursor: 'pointer',
      fontSize: '13px', fontWeight: 500,
    },
  }

  return (
    <div style={s.wrap}>
      <header style={s.header}>
        <span style={s.title}>Stellar Crowdfund</span>
        {publicKey ? (
          <div style={s.walletRow}>
            <span style={s.balanceHeader}>Balance: {balance ? `${parseFloat(balance).toFixed(4)} XLM` : '...'}</span>
            <span style={s.addr}>{publicKey.slice(0, 6)}...{publicKey.slice(-4)}</span>
            <button style={s.disconnectBtn} onClick={disconnectWallet}>Disconnect</button>
          </div>
        ) : (
          <button style={s.connectBtn} onClick={connectWallet}>Connect Wallet</button>
        )}
      </header>

      <main style={s.main}>
        <div style={s.card}>
          <div style={s.statsRow}>
            <div style={s.statBox}>
              <div style={s.statValue}>{raisedXLM.toFixed(2)}</div>
              <div style={s.statLabel}>Raised (XLM)</div>
            </div>
            <div style={s.statBox}>
              <div style={s.statValue}>{goalXLM.toFixed(0)}</div>
              <div style={s.statLabel}>Goal (XLM)</div>
            </div>
            <div style={s.statBox}>
              <div style={s.statValue}>{recentDonors.length}</div>
              <div style={s.statLabel}>Donations</div>
            </div>
          </div>

          <div style={s.progressBar}>
            <div style={s.progressFill} />
          </div>
          <div style={s.progressText}>{progressPct.toFixed(1)}% funded</div>

          <p style={s.desc}>
            Support this crowdfund campaign on Stellar testnet. Connect your wallet and donate XLM.
          </p>

          {publicKey ? (
            <div>
              <label style={s.label}>Donation Amount (XLM)</label>
              <div style={s.quickBtns}>
                {[10, 50, 100, 500].map((val) => (
                  <button key={val} style={s.quickBtn} onClick={() => setAmount(val.toString())}>
                    {val} XLM
                  </button>
                ))}
              </div>
              <input
                style={s.input}
                type="number"
                placeholder="Enter amount..."
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
                {isSending ? 'Sending...' : 'Donate XLM'}
              </button>
            </div>
          ) : (
            <p style={s.prompt}>Connect your wallet to donate.</p>
          )}

          {status && (
            <p style={isError ? s.error : s.status}>{status}</p>
          )}

          {txHash && (
            <p style={{ ...s.status, color: '#38bdf8' }}>
              <a href={`https://stellar.expert/explorer/testnet/tx/${txHash}`} target="_blank" rel="noopener noreferrer" style={{ color: '#38bdf8' }}>
                View on Explorer
              </a>
            </p>
          )}

          <div style={s.donorsSection}>
            <div style={s.donorsTitle}>Recent Donations</div>
            {recentDonors.length > 0 ? (
              recentDonors.map((d, i) => (
                <div key={i} style={s.donorRow}>
                  <div>
                    <div style={s.donorAddr}>{d.address.slice(0, 6)}...{d.address.slice(-4)}</div>
                    <div style={s.donorTime}>{new Date(d.time).toLocaleString()}</div>
                  </div>
                  <div style={s.donorAmount}>{(parseFloat(d.amount)).toFixed(2)} XLM</div>
                </div>
              ))
            ) : (
              <div style={s.noDonors}>No donations yet. Be the first!</div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
