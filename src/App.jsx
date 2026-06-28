import { useState, useEffect, useCallback, useRef } from 'react'
import { Horizon, TransactionBuilder, Networks, Contract, Address, rpc, scValToNative, nativeToScVal } from '@stellar/stellar-sdk'
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit'
import { FreighterModule } from '@creit.tech/stellar-wallets-kit/modules/freighter'
import { AlbedoModule } from '@creit.tech/stellar-wallets-kit/modules/albedo'
import { LobstrModule } from '@creit.tech/stellar-wallets-kit/modules/lobstr'
import { xBullModule } from '@creit.tech/stellar-wallets-kit/modules/xbull'
import { RabetModule } from '@creit.tech/stellar-wallets-kit/modules/rabet'
import { HanaModule } from '@creit.tech/stellar-wallets-kit/modules/hana'

import useStore from './store'
import Header from './components/Header'
import CampaignCard from './components/CampaignCard'
import DonateForm from './components/DonateForm'
import RecentDonations from './components/RecentDonations'
import CreateCampaign from './components/CreateCampaign'

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
  const canvasRef = useRef(null)
  const {
    setPublicKey, setBalance, setWalletName, setStatus, setTxHash,
    setIsSending, setTotalRaised, setGoal, setRecentDonors,
    setDonationCount, resetWallet, publicKey,
  } = useStore()

  const fireConfetti = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const particles = []
    const colors = ['#38bdf8', '#818cf8', '#f472b6', '#34d399', '#fbbf24', '#f87171']

    for (let i = 0; i < 150; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: canvas.height + Math.random() * 100,
        w: Math.random() * 10 + 5,
        h: Math.random() * 6 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        vx: (Math.random() - 0.5) * 6,
        vy: -(Math.random() * 12 + 8),
        gravity: 0.15,
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 10,
      })
    }

    let frame = 0
    const maxFrames = 180
    const animate = () => {
      if (frame >= maxFrames) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        return
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      particles.forEach((p) => {
        p.vy += p.gravity
        p.x += p.vx
        p.y += p.vy
        p.rotation += p.rotSpeed
        p.vx *= 0.99
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate((p.rotation * Math.PI) / 180)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        ctx.restore()
      })
      frame++
      requestAnimationFrame(animate)
    }
    animate()
  }

  const fetchBalance = useCallback(async (pk) => {
    try {
      const account = await HORIZON_SERVER.loadAccount(pk)
      const nativeBalance = account.balances.find((b) => b.asset_type === 'native')
      setBalance(nativeBalance.balance)
    } catch {
      setBalance('0')
    }
  }, [setBalance])

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
      const [goalResult, raisedResult] = await Promise.all([
        invokeRead('get_goal'),
        invokeRead('get_total_raised'),
      ])
      if (goalResult != null) setGoal(String(goalResult))
      if (raisedResult != null) setTotalRaised(String(raisedResult))
    } catch {
      console.error('Contract read failed')
    }
  }, [invokeRead, setGoal, setTotalRaised])

  const fetchRecentDonors = useCallback(async () => {
    try {
      const stored = localStorage.getItem('crowdfund_donations')
      if (stored) {
        const donations = JSON.parse(stored)
        setDonationCount(donations.length)
        setRecentDonors(donations.slice(0, 5))
      }
    } catch {}
  }, [setDonationCount, setRecentDonors])

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
        if (StellarWalletsKit.selectedModule) {
          setWalletName(StellarWalletsKit.selectedModule.productName || 'Wallet')
        }
      }
    })
    return () => unsub()
  }, [setPublicKey, setWalletName, fetchBalance])

  const connectWallet = async () => {
    try {
      const { address } = await StellarWalletsKit.authModal()
      if (StellarWalletsKit.selectedModule) {
        setWalletName(StellarWalletsKit.selectedModule.productName || 'Wallet')
      }
      setPublicKey(address)
      await fetchBalance(address)
      setStatus('')
    } catch {
      setStatus('Connection failed. Please ensure a wallet is available.')
    }
  }

  const disconnectWallet = () => {
    StellarWalletsKit.disconnect()
    resetWallet()
  }

  const sendTransaction = async () => {
    const amount = useStore.getState().amount
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
      fireConfetti()

      const stored = localStorage.getItem('crowdfund_donations')
      const donations = stored ? JSON.parse(stored) : []
      donations.unshift({
        address: publicKey,
        amount: String(amountStroops),
        tx: result.hash,
        time: new Date().toISOString(),
      })
      localStorage.setItem('crowdfund_donations', JSON.stringify(donations))

      await fetchBalance(publicKey)
      await fetchContractData()
      await fetchRecentDonors()
      useStore.getState().setAmount('')
    } catch (error) {
      console.error('Transaction failed', error)
      const msg = error.message || String(error)
      if (msg.includes('rejected')) {
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

  const status = useStore((s) => s.status)
  const txHash = useStore((s) => s.txHash)
  const isError = status &&
    (status.startsWith('Error') ||
     status.includes('failed') ||
     status.includes('rejected') ||
     status.includes('not found') ||
     status.includes('Insufficient'))

  return (
    <div className="min-h-screen bg-slate-900">
      <canvas
        ref={canvasRef}
        className="fixed top-0 left-0 w-full h-full pointer-events-none"
        style={{ zIndex: 9999 }}
      />

      <Header onConnect={connectWallet} onDisconnect={disconnectWallet} />

      <main className="max-w-lg mx-auto mt-12 px-5">
        <div className="bg-slate-800 rounded-xl p-8 shadow-lg border border-slate-700">
          <CampaignCard />

          <p className="text-sm text-slate-400 mb-6 leading-relaxed">
            Support this crowdfund campaign on Stellar testnet. Connect your wallet and donate XLM.
          </p>

          <DonateForm onDonate={sendTransaction} />

          {status && (
            <p className={`mt-3.5 text-xs text-center ${isError ? 'text-red-400' : 'text-slate-400'}`}>
              {status}
            </p>
          )}

          {txHash && (
            <p className="mt-3.5 text-xs text-center text-cyan-400">
              <a
                href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 hover:underline"
              >
                View on Explorer
              </a>
            </p>
          )}
        </div>

        <div className="bg-slate-800 rounded-xl p-8 shadow-lg border border-slate-700 mt-5">
          <RecentDonations />
        </div>
      </main>

      <CreateCampaign />
    </div>
  )
}

export default App
