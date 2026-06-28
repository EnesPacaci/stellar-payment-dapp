import { useState, useEffect, useCallback, useRef } from 'react'
import { Horizon, TransactionBuilder, Networks, Contract, Address, rpc, scValToNative, nativeToScVal, xdr } from '@stellar/stellar-sdk'
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
import { CONTRACT_ADDRESSES, SOROBAN_RPC_URL, HORIZON_URL, NETWORK_PASSPHRASE } from './config'

const HORIZON_SERVER = new Horizon.Server(HORIZON_URL)
const SOROBAN_SERVER = new rpc.Server(SOROBAN_RPC_URL)
const FACTORY_ID = CONTRACT_ADDRESSES.factory
const factoryContract = new Contract(FACTORY_ID)

function parseMilestoneStatus(status) {
  if (status == null) return 0
  if (typeof status === 'number') return status
  if (typeof status === 'string') return ({ Pending: 0, Completed: 1, Approved: 2 })[status] ?? 0
  if (typeof status === 'object') {
    const inner = status[0] ?? status['0']
    if (typeof inner === 'string') return ({ Pending: 0, Completed: 1, Approved: 2 })[inner] ?? 0
    for (const key of ['Pending', 'Completed', 'Approved']) {
      if (key in status) return ({ Pending: 0, Completed: 1, Approved: 2 })[key]
    }
    if (status.tag) return ({ Pending: 0, Completed: 1, Approved: 2 })[status.tag] ?? 0
    if (status._arm) return ({ Pending: 0, Completed: 1, Approved: 2 })[status._arm] ?? 0
    if (status.value) return ({ Pending: 0, Completed: 1, Approved: 2 })[status.value] ?? 0
  }
  return 0
}

function parseContractError(error, context) {
  const msg = error?.message || String(error) || ''
  if (msg.includes('rejected') || msg.includes('User rejected')) return 'Transaction rejected by user.'
  if (msg.includes('insufficient') || msg.includes('underfunded') || msg.includes('Insufficient')) {
    if (context === 'approve') return 'Insufficient funds to release this milestone. Donate more XLM first.'
    return 'Insufficient balance for this action.'
  }
  if (msg.includes('account') && msg.includes('not found')) return 'Account not found on testnet. Get XLM from friendbot first.'
  if (msg.includes('MissingValue') || msg.includes('non-existing value')) return 'Campaign data not found on-chain. The contract may still be initializing.'
  if (msg.includes('UnreachableCodeReached') || msg.includes('WasmVm')) {
    if (context === 'approve') return 'Cannot approve this milestone. Ensure it has been submitted and there are enough released funds.'
    if (context === 'submit') return 'Cannot submit this milestone. It may have already been submitted or is not in pending status.'
    return 'Smart contract error. Please try again.'
  }
  if (msg.includes('not completed')) return 'This milestone has not been submitted yet. Submit it first.'
  if (msg.includes('not pending')) return 'This milestone has already been submitted.'
  if (msg.includes('only admin')) return 'Only the campaign creator can perform this action.'
  return `Transaction failed: ${msg.slice(0, 120)}`
}

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
    setIsSending, setTotalRaised, setGoal, setDeadline, setRecentDonors,
    setDonationCount, resetWallet, publicKey, selectedCampaign,
    setSelectedCampaign, setCampaigns, campaigns,     setIsLoadingCampaigns, isSending,
    showCreateForm, setShowCreateForm,
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

  const invokeFactoryRead = useCallback(async (method, ...args) => {
    try {
      const sourceAccount = await HORIZON_SERVER.loadAccount(publicKey || 'GDGGSUZ42XTYN5MLZGLNNUGO446SVL6XVZQQSPTSCEM2PCHCRZCW3X3C')
      const tx = new TransactionBuilder(sourceAccount, {
        fee: '100',
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(factoryContract.call(method, ...args))
        .setTimeout(30)
        .build()

      const result = await SOROBAN_SERVER.simulateTransaction(tx)
      if (result.error) throw result.error
      const retval = result.result?.retval
      if (!retval) return null
      return scValToNative(retval)
    } catch (error) {
      console.error(`Factory read ${method} failed:`, error)
      return null
    }
  }, [publicKey])

  const invokeCampaignRead = useCallback(async (contractId, method, ...args) => {
    try {
      const contract = new Contract(contractId)
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
      const native = scValToNative(retval)
      return native
    } catch (error) {
      console.error(`Campaign read ${method} failed:`, error)
      return null
    }
  }, [publicKey])

  const fetchSingleCampaign = useCallback(async (addr) => {
    try {
      const [info, name, rawMilestones, totalReleased] = await Promise.all([
        invokeCampaignRead(addr, 'get_info'),
        invokeCampaignRead(addr, 'get_name'),
        invokeCampaignRead(addr, 'get_milestones'),
        invokeCampaignRead(addr, 'get_total_released'),
      ])
      if (!info) return null
      const [goal, raised, deadline] = info
      const milestones = Array.isArray(rawMilestones)
        ? rawMilestones.map((m) => {
            const st = parseMilestoneStatus(m.status)
            return { amount: String(m.amount || '0'), description: String(m.description || ''), status: st }
          })
        : []
      return {
        address: addr,
        name: name || 'Loading...',
        goal: String(goal),
        raised: String(raised),
        deadline: Number(deadline),
        milestones,
        totalReleased: String(totalReleased || '0'),
      }
    } catch {
      return null
    }
  }, [invokeCampaignRead])

  const fetchCampaigns = useCallback(async () => {
    setIsLoadingCampaigns(true)
    try {
      const campaignAddrs = await invokeFactoryRead('get_campaigns')
      if (!campaignAddrs || !Array.isArray(campaignAddrs)) {
        setCampaigns([])
        return
      }

      const campaignData = await Promise.all(
        campaignAddrs.map(async (addr) => {
          try {
            const [info, name] = await Promise.all([
              invokeCampaignRead(addr, 'get_info'),
              invokeCampaignRead(addr, 'get_name'),
            ])
            if (!info) return null
            const [goal, raised, deadline] = info
            const rawMilestones = await invokeCampaignRead(addr, 'get_milestones')
            const milestones = Array.isArray(rawMilestones)
              ? rawMilestones.map((m) => {
                  const st = parseMilestoneStatus(m.status)
                  return { amount: String(m.amount || '0'), description: String(m.description || ''), status: st }
                })
              : []
            const totalReleased = await invokeCampaignRead(addr, 'get_total_released')
            return {
              address: addr,
              name: name || 'Loading...',
              goal: String(goal),
              raised: String(raised),
              deadline: Number(deadline),
              milestones,
              totalReleased: String(totalReleased || '0'),
            }
          } catch {
            return {
              address: addr,
              name: 'Loading...',
              goal: '0',
              raised: '0',
              deadline: 0,
              milestones: [],
              totalReleased: '0',
            }
          }
        })
      )

      const validCampaigns = campaignData.filter(Boolean).reverse()
      setCampaigns(validCampaigns)
    } catch (error) {
      console.error('Failed to fetch campaigns:', error)
    } finally {
      setIsLoadingCampaigns(false)
    }
  }, [invokeFactoryRead, invokeCampaignRead, setCampaigns, setIsLoadingCampaigns])

  const fetchContractData = useCallback(async () => {
    if (selectedCampaign) {
      const goalResult = await invokeCampaignRead(selectedCampaign.address, 'get_goal')
      const raisedResult = await invokeCampaignRead(selectedCampaign.address, 'get_total_raised')
      if (goalResult != null) setGoal(String(goalResult))
      if (raisedResult != null) setTotalRaised(String(raisedResult))
    }
  }, [selectedCampaign, invokeCampaignRead, setGoal, setTotalRaised])

  const fetchRecentDonors = useCallback(async () => {
    try {
      const key = selectedCampaign
        ? `crowdfund_donations_${selectedCampaign.address}`
        : 'crowdfund_donations'
      const stored = localStorage.getItem(key)
      if (stored) {
        const donations = JSON.parse(stored)
        setDonationCount(donations.length)
        setRecentDonors(donations.slice(0, 5))
      } else {
        setDonationCount(0)
        setRecentDonors([])
      }
    } catch {}
  }, [setDonationCount, setRecentDonors, selectedCampaign])

  useEffect(() => {
    fetchCampaigns()
  }, [])

  useEffect(() => {
    if (selectedCampaign) {
      fetchContractData()
      fetchRecentDonors()
    }
  }, [selectedCampaign])

  useEffect(() => {
    let timeout
    const poll = async () => {
      if (!isSending) await fetchCampaigns()
      timeout = setTimeout(poll, 15000)
    }
    timeout = setTimeout(poll, 15000)
    return () => clearTimeout(timeout)
  }, [isSending, fetchCampaigns])

  useEffect(() => {
    if (!selectedCampaign) return
    let timeout
    const poll = async () => {
      if (!isSending) {
        const fresh = await fetchSingleCampaign(selectedCampaign.address)
        if (fresh && fresh.name !== 'Loading...') setSelectedCampaign(fresh)
      }
      timeout = setTimeout(poll, 10000)
    }
    timeout = setTimeout(poll, 10000)
    return () => clearTimeout(timeout)
  }, [selectedCampaign, isSending, fetchSingleCampaign])

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
    if (!selectedCampaign) {
      setStatus('Please select a campaign first')
      return
    }

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
      const campaignContract = new Contract(selectedCampaign.address)

      const transaction = new TransactionBuilder(account, {
        fee: await HORIZON_SERVER.fetchBaseFee(),
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          campaignContract.call(
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

      const key = `crowdfund_donations_${selectedCampaign.address}`
      const stored = localStorage.getItem(key)
      const donations = stored ? JSON.parse(stored) : []
      donations.unshift({
        address: publicKey,
        amount: String(amountStroops),
        tx: result.hash,
        time: new Date().toISOString(),
      })
      localStorage.setItem(key, JSON.stringify(donations))

      await fetchBalance(publicKey)
      await fetchRecentDonors()
      if (selectedCampaign) {
        const newRaised = String(BigInt(selectedCampaign.raised || '0') + BigInt(amountStroops))
        const updatedCampaign = { ...selectedCampaign, raised: newRaised }
        setSelectedCampaign(updatedCampaign)
        const currentCampaigns = useStore.getState().campaigns
        setCampaigns(currentCampaigns.map(c => c.address === selectedCampaign.address ? updatedCampaign : c))
      }
      useStore.getState().setAmount('')
    } catch (error) {
      console.error('Transaction failed', error)
      setStatus(parseContractError(error, 'donate'))
    } finally {
      setIsSending(false)
    }
  }

  const createCampaign = async (name, goal, deadline, milestones) => {
    if (!publicKey) {
      setStatus('Please connect wallet first')
      return
    }

    setIsSending(true)
    setStatus('Creating campaign...')
    setTxHash('')

    try {
      const account = await HORIZON_SERVER.loadAccount(publicKey)

      const msVec = xdr.ScVal.scvVec(
        milestones.map((m) => {
          const amountStroops = BigInt(Math.floor(parseFloat(m.amount) * 10_000_000))
          const hi = amountStroops / (1n << 64n)
          const lo = amountStroops % (1n << 64n)
          return xdr.ScVal.scvVec([
            xdr.ScVal.scvI128(new xdr.Int128Parts({
              hi: xdr.Int64.fromString(String(hi)),
              lo: xdr.Uint64.fromString(String(lo)),
            })),
            nativeToScVal(m.description, { type: 'string' }),
            nativeToScVal(0, { type: 'u32' }),
          ])
        })
      )

      const transaction = new TransactionBuilder(account, {
        fee: await HORIZON_SERVER.fetchBaseFee(),
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          factoryContract.call(
            'create_campaign',
            nativeToScVal(new Address(publicKey), { type: 'address' }),
            nativeToScVal(name, { type: 'string' }),
            nativeToScVal(Math.floor(parseFloat(goal) * 10_000_000), { type: 'i128' }),
            nativeToScVal(BigInt(deadline), { type: 'u64' }),
            msVec
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

      setStatus('Campaign submitted! Initializing on-chain...')
      await new Promise(resolve => setTimeout(resolve, 2000))

      setStatus('Fetching campaigns...')
      const campaignAddrs = await invokeFactoryRead('get_campaigns')
      const newCampaignAddr = campaignAddrs?.[campaignAddrs.length - 1]

      await fetchCampaigns()

      if (newCampaignAddr) {
        let ready = false
        for (let attempt = 1; attempt <= 5; attempt++) {
          try {
            const name = await invokeCampaignRead(newCampaignAddr, 'get_name')
            if (name) {
              ready = true
              break
            }
          } catch {}
          setStatus(`Waiting for contract data... (${attempt}/5)`)
          await new Promise(resolve => setTimeout(resolve, 3000))
        }
        if (ready) {
          setStatus('Refreshing campaign data...')
          await fetchCampaigns()
        }
      }

      setStatus('Campaign created successfully!')
      fireConfetti()

      await new Promise(resolve => setTimeout(resolve, 1500))

      setShowCreateForm(false)
      setStatus('')
    } catch (error) {
      console.error('Campaign creation failed', error)
      setStatus(parseContractError(error, 'create'))
    } finally {
      setIsSending(false)
    }
  }

  const submitMilestone = async (campaignAddr, index) => {
    if (!publicKey) return
    const campaign = useStore.getState().campaigns.find(c => c.address === campaignAddr) || selectedCampaign
    if (campaign && campaign.milestones[index] && campaign.milestones[index].status !== 0) {
      setStatus('This milestone has already been submitted.')
      return
    }
    setIsSending(true)
    setStatus('Submitting milestone...')
    setTxHash('')
    try {
      const account = await HORIZON_SERVER.loadAccount(publicKey)
      const campaignContract = new Contract(campaignAddr)
      const transaction = new TransactionBuilder(account, {
        fee: await HORIZON_SERVER.fetchBaseFee(),
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          campaignContract.call(
            'submit_milestone',
            nativeToScVal(new Address(publicKey), { type: 'address' }),
            nativeToScVal(index, { type: 'u32' })
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
      setStatus('Milestone submitted successfully!')
      fireConfetti()
      if (selectedCampaign) {
        const ms = [...selectedCampaign.milestones]
        ms[index] = { ...ms[index], status: 1 }
        const updated = { ...selectedCampaign, milestones: ms }
        setSelectedCampaign(updated)
        const current = useStore.getState().campaigns
        setCampaigns(current.map(c => c.address === campaignAddr ? updated : c))
      }
      setTimeout(async () => {
        const fresh = await fetchSingleCampaign(campaignAddr)
        if (fresh && fresh.name !== 'Loading...') setSelectedCampaign(fresh)
      }, 3000)
    } catch (error) {
      console.error('Submit milestone failed', error)
      setStatus(parseContractError(error, 'submit'))
    } finally {
      setIsSending(false)
    }
  }

  const approveMilestone = async (campaignAddr, index) => {
    if (!publicKey) return
    const campaign = useStore.getState().campaigns.find(c => c.address === campaignAddr) || selectedCampaign
    if (campaign) {
      const ms = campaign.milestones[index]
      if (ms && ms.status !== 1) {
        if (ms.status === 0) {
          setStatus('This milestone has not been submitted yet. Submit it first.')
          setIsSending(false)
          return
        }
        if (ms.status === 2) {
          setStatus('This milestone has already been approved.')
          setIsSending(false)
          return
        }
      }
      const raised = BigInt(campaign.raised || '0')
      const released = BigInt(campaign.totalReleased || '0')
      const msAmount = BigInt(ms?.amount || '0')
      if (raised < released + msAmount) {
        setStatus('Insufficient funds to release this milestone. Donate more XLM first.')
        setIsSending(false)
        return
      }
    }
    setIsSending(true)
    setStatus('Approving milestone...')
    setTxHash('')
    try {
      const account = await HORIZON_SERVER.loadAccount(publicKey)
      const campaignContract = new Contract(campaignAddr)
      const transaction = new TransactionBuilder(account, {
        fee: await HORIZON_SERVER.fetchBaseFee(),
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          campaignContract.call(
            'approve_milestone',
            nativeToScVal(new Address(publicKey), { type: 'address' }),
            nativeToScVal(index, { type: 'u32' })
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
      setStatus('Milestone approved & funds released!')
      fireConfetti()
      if (selectedCampaign) {
        const ms = [...selectedCampaign.milestones]
        const msAmount = ms[index].amount
        ms[index] = { ...ms[index], status: 2 }
        const newReleased = String(BigInt(selectedCampaign.totalReleased || '0') + BigInt(msAmount))
        const updated = { ...selectedCampaign, milestones: ms, totalReleased: newReleased }
        setSelectedCampaign(updated)
        const current = useStore.getState().campaigns
        setCampaigns(current.map(c => c.address === campaignAddr ? updated : c))
      }
      setTimeout(async () => {
        const fresh = await fetchSingleCampaign(campaignAddr)
        if (fresh && fresh.name !== 'Loading...') setSelectedCampaign(fresh)
      }, 3000)
    } catch (error) {
      console.error('Approve milestone failed', error)
      setStatus(parseContractError(error, 'approve'))
    } finally {
      setIsSending(false)
    }
  }

  const status = useStore((s) => s.status)
  const txHash = useStore((s) => s.txHash)
  const isError = status &&
    (status.startsWith('Error') ||
     status.startsWith('Transaction failed') ||
     status.includes('failed') ||
     status.includes('rejected') ||
     status.includes('not found') ||
     status.includes('Insufficient') ||
     status.includes('Cannot') ||
     status.includes('not been') ||
     status.includes('not pending') ||
     status.includes('already') ||
     status.includes('Only the campaign'))

  return (
    <div className="min-h-screen bg-slate-900">
      <canvas
        ref={canvasRef}
        className="fixed top-0 left-0 w-full h-full pointer-events-none"
        style={{ zIndex: 9999 }}
      />

      <Header onConnect={connectWallet} onDisconnect={disconnectWallet} />

      <main className="max-w-2xl mx-auto mt-12 px-5">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white">
            {selectedCampaign ? 'Campaign Details' : 'Active Campaigns'}
          </h2>
          <div className="flex gap-2">
            {selectedCampaign && !isSending && (
              <button
                onClick={() => {
                  setSelectedCampaign(null)
                  setGoal('0')
                  setTotalRaised('0')
                  setRecentDonors([])
                  setDonationCount(0)
                  setTxHash('')
                  setStatus('')
                }}
                className="text-xs text-slate-300 border border-slate-600 px-3 py-1.5 rounded-md hover:bg-slate-700 transition-colors"
              >
                Back
              </button>
            )}
            {selectedCampaign && !isSending && (
              <button
                onClick={() => {
                  setStatus('Refreshing...')
                  setTimeout(async () => {
                    const fresh = await fetchSingleCampaign(selectedCampaign.address)
                    const hasData = fresh && fresh.milestones.length > 0 && fresh.totalReleased !== '0'
                    if (fresh && (fresh.name !== 'Loading...' || hasData)) {
                      setSelectedCampaign(fresh)
                      setStatus('')
                    } else {
                      setStatus('RPC not ready. Try Refresh again.')
                    }
                  }, 500)
                }}
                className="text-xs text-slate-400 border border-slate-700 px-3 py-1.5 rounded-md hover:bg-slate-600 transition-colors"
              >
                Refresh
              </button>
            )}
            <button
              onClick={() => {
                setShowCreateForm(!showCreateForm)
                setStatus('')
              }}
              disabled={isSending}
              className="text-xs bg-cyan-400 text-slate-900 px-3 py-1.5 rounded-md font-semibold hover:bg-cyan-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {showCreateForm ? 'Cancel' : '+ New Campaign'}
            </button>
          </div>
        </div>

        {showCreateForm && (
          <CreateCampaign onSubmit={createCampaign} />
        )}

        {!showCreateForm && !selectedCampaign && (
          <>
            {useStore.getState().isLoadingCampaigns ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-slate-800 rounded-xl p-5 shadow-lg border border-slate-700 animate-pulse">
                    <div className="flex justify-between items-start mb-3">
                      <div className="h-3 bg-slate-700 rounded w-32"></div>
                      <div className="h-3 bg-slate-700 rounded w-10"></div>
                    </div>
                    <div className="flex justify-between mb-3">
                      <div className="h-6 bg-slate-700 rounded w-20"></div>
                      <div className="h-6 bg-slate-700 rounded w-20"></div>
                    </div>
                    <div className="w-full h-2 bg-slate-700 rounded-full"></div>
                  </div>
                ))}
              </div>
            ) : (
              <CampaignCard
                campaigns={campaigns}
                onSelect={(c) => {
                  if (c.name === 'Loading...') return
                  setSelectedCampaign(c)
                  setTxHash('')
                }}
              />
            )}
          </>
        )}

        {selectedCampaign && (
          <>
            <div className="bg-slate-800 rounded-xl p-8 shadow-lg border border-slate-700">
              <div className="mb-4">
                <div className="text-xs text-slate-500 mb-1">Campaign Address</div>
                <div className="text-xs font-mono text-slate-400 break-all">
                  {selectedCampaign.address}
                </div>
              </div>

              <CampaignCard
                campaigns={[selectedCampaign]}
                compact
              />

                    {selectedCampaign.milestones && selectedCampaign.milestones.length > 0 && (
                <div className="mt-6 mb-4">
                  <div className="text-xs text-slate-500 mb-3">Milestones</div>
                  <div className="space-y-2">
                    {selectedCampaign.milestones.map((ms, i) => {
                      const msXLM = (Number(ms.amount) / 10_000_000).toFixed(0)
                      const st = parseMilestoneStatus(ms.status)
                      const statusLabel = st === 0 ? 'Pending' : st === 1 ? 'Submitted' : 'Approved'
                      const statusColor = st === 0 ? 'text-slate-500' : st === 1 ? 'text-yellow-400' : 'text-green-400'
                      return (
                        <div key={i} className="bg-slate-900 rounded-lg p-3 border border-slate-700 flex items-center justify-between">
                          <div className="flex-1">
                            <div className="text-xs font-medium text-white">{ms.description}</div>
                            <div className="text-[11px] text-slate-500 font-mono">{msXLM} XLM</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[11px] font-medium ${statusColor}`}>{statusLabel}</span>
                            {st === 0 && (
                              <button
                                onClick={() => submitMilestone(selectedCampaign.address, i)}
                                disabled={isSending}
                                className="text-[10px] px-2 py-1 rounded bg-yellow-400/10 text-yellow-400 hover:bg-yellow-400/20 transition-colors disabled:opacity-50"
                              >
                                Submit
                              </button>
                            )}
                            {st === 1 && (
                              <button
                                onClick={() => approveMilestone(selectedCampaign.address, i)}
                                disabled={isSending}
                                className="text-[10px] px-2 py-1 rounded bg-green-400/10 text-green-400 hover:bg-green-400/20 transition-colors disabled:opacity-50"
                              >
                                Approve
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex justify-between mt-2 text-[11px] text-slate-500">
                    <span>Released: {(Number(selectedCampaign.totalReleased || 0) / 10_000_000).toFixed(0)} XLM</span>
                    <span>Locked: {((Number(selectedCampaign.raised || 0) - Number(selectedCampaign.totalReleased || 0)) / 10_000_000).toFixed(0)} XLM</span>
                  </div>
                </div>
              )}

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
          </>
        )}
      </main>
    </div>
  )
}

export default App
