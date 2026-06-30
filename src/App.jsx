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
import FeedbackForm from './components/FeedbackForm'
import NftModal from './components/NftModal'
import { CONTRACT_ADDRESSES, SOROBAN_RPC_URL, HORIZON_URL, NETWORK_PASSPHRASE } from './config'

const HORIZON_SERVER = new Horizon.Server(HORIZON_URL)
const SOROBAN_SERVER = new rpc.Server(SOROBAN_RPC_URL)
const FACTORY_ID = CONTRACT_ADDRESSES.factory
const factoryContract = new Contract(FACTORY_ID)

function parseMilestoneStatus(status) {
  if (status == null) return 0
  if (typeof status === 'number') return status
  if (typeof status === 'string') return ({ Pending: 0, Submitted: 1, Completed: 1, Approved: 2, Rejected: 3 })[status] ?? 0
  if (typeof status === 'object') {
    const inner = status[0] ?? status['0']
    if (typeof inner === 'string') return ({ Pending: 0, Submitted: 1, Completed: 1, Approved: 2, Rejected: 3 })[inner] ?? 0
    for (const key of ['Pending', 'Submitted', 'Completed', 'Approved', 'Rejected']) {
      if (key in status) return ({ Pending: 0, Submitted: 1, Completed: 1, Approved: 2, Rejected: 3 })[key]
    }
    if (status.tag) return ({ Pending: 0, Submitted: 1, Completed: 1, Approved: 2, Rejected: 3 })[status.tag] ?? 0
    if (status._arm) return ({ Pending: 0, Submitted: 1, Completed: 1, Approved: 2, Rejected: 3 })[status._arm] ?? 0
    if (status.value) return ({ Pending: 0, Submitted: 1, Completed: 1, Approved: 2, Rejected: 3 })[status.value] ?? 0
  }
  return 0
}

function parseContractError(error, context) {
  const msg = error?.message || String(error) || ''
  if (msg.includes('rejected') || msg.includes('User rejected')) return 'Transaction rejected by user.'
  if (msg.includes('insufficient') || msg.includes('underfunded') || msg.includes('Insufficient')) return 'Insufficient balance for this action.'
  if (msg.includes('account') && msg.includes('not found')) return 'Account not found on testnet. Get XLM from friendbot first.'
  if (msg.includes('MissingValue') || msg.includes('non-existing value')) return 'Campaign data not found on-chain.'
  if (msg.includes('only donors can vote')) return 'Only donors who have contributed to this campaign can vote.'
  if (msg.includes('already voted')) return 'You have already voted on this milestone.'
  if (msg.includes('voting period has ended')) return 'The voting period for this milestone has ended.'
  if (msg.includes('voting still open')) return 'Voting is still in progress. Wait for the deadline or more votes.'
  if (msg.includes('quorum not yet met')) return 'Not enough donors have voted yet. Quorum not reached.'
  if (msg.includes('milestone not submitted')) return 'This milestone has not been submitted for voting yet.'
  if (msg.includes('milestone not rejected')) return 'This milestone has not been rejected. Refunds are not available.'
  if (msg.includes('refund already claimed')) return 'You have already claimed your refund for this milestone.'
  if (msg.includes('no donation to refund')) return 'No donation found to refund.'
  if (msg.includes('refund amount is zero')) return 'Refund amount is zero. You may not be eligible.'
  if (msg.includes('only admin can submit')) return 'Only the campaign creator can submit milestones.'
  if (msg.includes('milestone not pending')) return 'This milestone has already been submitted.'
  if (msg.includes('not completed')) return 'This milestone has not been submitted yet.'
  if (msg.includes('campaign deadline has passed')) return 'The campaign deadline has passed. No more milestones can be submitted.'
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
    setSelectedCampaign, setCampaigns, campaigns, setIsLoadingCampaigns, isSending,
    showCreateForm, setShowCreateForm, showNftModal, setShowNftModal,
    nftTokens, setNftTokens, showFeedbackForm, setShowFeedbackForm,
    feedbackSubmitted, setFeedbackSubmitted,
  } = useStore()

  const campaignSearch = useStore((s) => s.campaignSearch)
  const setCampaignSearch = useStore((s) => s.setCampaignSearch)

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

  const fetchVoteStatus = useCallback(async (addr) => {
    if (!addr) return { milestones: [], donorTotal: '0', totalVoterWeight: '0' }
    try {
      const milestones = []
      const info = await invokeCampaignRead(addr, 'get_milestones')
      const count = Array.isArray(info) ? info.length : 0
      for (let i = 0; i < count; i++) {
        const status = await invokeCampaignRead(addr, 'get_vote_status', nativeToScVal(i, { type: 'u32' }))
        milestones.push({
          approvals: status ? String(status[0] || '0') : '0',
          rejections: status ? String(status[1] || '0') : '0',
          deadline: status ? Number(status[2] || 0) : 0,
        })
      }
      const donorTotal = publicKey
        ? (await invokeCampaignRead(addr, 'get_donor_total', nativeToScVal(new Address(publicKey), { type: 'address' }))) || '0'
        : '0'
      const totalVoterWeight = (await invokeCampaignRead(addr, 'get_total_voter_weight')) || '0'
      const hasVoted = []
      for (let i = 0; i < count; i++) {
        if (publicKey) {
          const voted = await invokeCampaignRead(addr, 'get_has_voted',
            nativeToScVal(new Address(publicKey), { type: 'address' }),
            nativeToScVal(i, { type: 'u32' })
          )
          hasVoted[i] = !!voted
        } else {
          hasVoted[i] = false
        }
      }
      const refundClaimed = []
      for (let i = 0; i < count; i++) {
        if (publicKey) {
          const claimed = await invokeCampaignRead(addr, 'get_refund_claimed',
            nativeToScVal(new Address(publicKey), { type: 'address' }),
            nativeToScVal(i, { type: 'u32' })
          )
          refundClaimed[i] = !!claimed
        } else {
          refundClaimed[i] = false
        }
      }
      return { milestones, donorTotal: String(donorTotal), totalVoterWeight: String(totalVoterWeight), hasVoted, refundClaimed }
    } catch {
      return { milestones: [], donorTotal: '0', totalVoterWeight: '0', hasVoted: [], refundClaimed: [] }
    }
  }, [invokeCampaignRead, publicKey])

  const fetchSingleCampaign = useCallback(async (addr) => {
    try {
      const [info, name, rawMilestones, totalReleased, voteData] = await Promise.all([
        invokeCampaignRead(addr, 'get_info'),
        invokeCampaignRead(addr, 'get_name'),
        invokeCampaignRead(addr, 'get_milestones'),
        invokeCampaignRead(addr, 'get_total_released'),
        fetchVoteStatus(addr),
      ])
      if (!info) return null
      const [goal, raised, deadline] = info
      const milestones = Array.isArray(rawMilestones)
        ? rawMilestones.map((m, i) => {
            const st = parseMilestoneStatus(m.status)
            const vs = voteData?.milestones?.[i]
            return {
              amount: String(m.amount || '0'),
              description: String(m.description || ''),
              status: st,
              approvals: vs?.approvals || '0',
              rejections: vs?.rejections || '0',
              voteDeadline: vs?.deadline || 0,
            }
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
        donorTotal: voteData?.donorTotal || '0',
        totalVoterWeight: voteData?.totalVoterWeight || '0',
        hasVoted: voteData?.hasVoted || [],
        refundClaimed: voteData?.refundClaimed || [],
      }
    } catch {
      return null
    }
  }, [invokeCampaignRead, fetchVoteStatus])

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

  const fetchNftTokens = useCallback(async () => {
    if (!publicKey) return
    try {
      const nftContract = new Contract(CONTRACT_ADDRESSES.rewardNft)
      const sourceAccount = await HORIZON_SERVER.loadAccount(publicKey || 'GDGGSUZ42XTYN5MLZGLNNUGO446SVL6XVZQQSPTSCEM2PCHCRZCW3X3C')
      const tx = new TransactionBuilder(sourceAccount, {
        fee: '100',
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(nftContract.call('get_owner_tokens', nativeToScVal(new Address(publicKey), { type: 'address' })))
        .setTimeout(30)
        .build()
      const result = await SOROBAN_SERVER.simulateTransaction(tx)
      if (result.error) throw result.error
      const retval = result.result?.retval
      if (!retval) { setNftTokens([]); return }
      const tokenIds = scValToNative(retval)
      if (!Array.isArray(tokenIds)) { setNftTokens([]); return }

      const tokens = await Promise.all(tokenIds.map(async (tid) => {
        try {
          const meta = await invokeCampaignRead(CONTRACT_ADDRESSES.rewardNft, 'get_token_metadata', nativeToScVal(tid, { type: 'u32' }))
          if (!meta) return null
          return {
            tokenId: tid,
            campaign: meta.campaign || '',
            milestoneId: Number(meta.milestone_id || 0),
            amount: String(meta.amount || '0'),
            timestamp: Number(meta.timestamp || 0),
          }
        } catch { return null }
      }))
      setNftTokens(tokens.filter(Boolean))
    } catch {
      setNftTokens([])
    }
  }, [publicKey, invokeCampaignRead, setNftTokens])

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
      if (!isSending) {
        await fetchCampaigns()
      }
      timeout = setTimeout(poll, 15000)
    }
    timeout = setTimeout(poll, 15000)
    return () => clearTimeout(timeout)
  }, [isSending, fetchCampaigns])

  useEffect(() => {
    if (!selectedCampaign) return
    const addr = selectedCampaign.address
    let cancelled = false
    let timeout
    const poll = async () => {
      if (!isSending && !cancelled) {
        const fresh = await fetchSingleCampaign(addr)
        if (!cancelled && fresh && fresh.name !== 'Loading...' && useStore.getState().selectedCampaign?.address === addr) {
          setSelectedCampaign(fresh)
        }
      }
      if (!cancelled) timeout = setTimeout(poll, 10000)
    }
    timeout = setTimeout(poll, 10000)
    return () => { cancelled = true; clearTimeout(timeout) }
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

      setShowFeedbackForm(true)
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
      setTxHash(result.hash)
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
        const still = useStore.getState().selectedCampaign
        if (!still || still.address !== campaignAddr) return
        const fresh = await fetchSingleCampaign(campaignAddr)
        if (fresh && fresh.name !== 'Loading...' && useStore.getState().selectedCampaign?.address === campaignAddr) setSelectedCampaign(fresh)
      }, 3000)
    } catch (error) {
      console.error('Submit milestone failed', error)
      setStatus(parseContractError(error, 'submit'))
    } finally {
      setIsSending(false)
    }
  }

  const voteOnMilestone = async (campaignAddr, index, approve) => {
    if (!publicKey) return
    const campaign = useStore.getState().campaigns.find(c => c.address === campaignAddr) || selectedCampaign
    if (campaign && campaign.hasVoted?.[index]) {
      setStatus('You have already voted on this milestone.')
      return
    }
    const action = approve ? 'vote_approve' : 'vote_reject'
    const label = approve ? 'Approve' : 'Reject'
    setIsSending(true)
    setStatus(`Casting ${label.toLowerCase()} vote...`)
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
            action,
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
      setStatus(`${label} vote cast successfully!`)
      setTxHash(result.hash)
      fireConfetti()

      const voterKey = `crowdfund_voters_${campaignAddr}_${index}`
      const existingVoters = JSON.parse(localStorage.getItem(voterKey) || '[]')
      if (!existingVoters.find(v => v.address === publicKey)) {
        existingVoters.push({
          address: publicKey,
          amount: String(selectedCampaign?.donorTotal || '0'),
          approve,
        })
        localStorage.setItem(voterKey, JSON.stringify(existingVoters))
      }

      setTimeout(async () => {
        const still = useStore.getState().selectedCampaign
        if (!still || still.address !== campaignAddr) return
        const fresh = await fetchSingleCampaign(campaignAddr)
        if (fresh && fresh.name !== 'Loading...' && useStore.getState().selectedCampaign?.address === campaignAddr) setSelectedCampaign(fresh)
      }, 3000)

      setShowFeedbackForm(true)
    } catch (error) {
      console.error(`${label} vote failed`, error)
      setStatus(parseContractError(error, 'vote'))
    } finally {
      setIsSending(false)
    }
  }

  const releaseMilestone = async (campaignAddr, index) => {
    if (!publicKey) return
    setIsSending(true)
    setStatus('Checking votes and releasing milestone...')
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
            'release_milestone',
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
      setStatus('Milestone released successfully!')
      setTxHash(result.hash)
      fireConfetti()

      setTimeout(async () => {
        const still = useStore.getState().selectedCampaign
        if (!still || still.address !== campaignAddr) return
        const fresh = await fetchSingleCampaign(campaignAddr)
        if (fresh && fresh.name !== 'Loading...' && useStore.getState().selectedCampaign?.address === campaignAddr) setSelectedCampaign(fresh)
      }, 3000)
    } catch (error) {
      console.error('Release milestone failed', error)
      setStatus(parseContractError(error, 'release'))
    } finally {
      setIsSending(false)
    }
  }

  const claimRefund = async (campaignAddr, index) => {
    if (!publicKey) return
    const campaign = useStore.getState().campaigns.find(c => c.address === campaignAddr) || selectedCampaign
    if (campaign && campaign.refundClaimed?.[index]) {
      setStatus('You have already claimed your refund for this milestone.')
      return
    }
    setIsSending(true)
    setStatus('Claiming refund...')
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
            'claim_refund',
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
      setStatus('Refund claimed successfully!')
      setTxHash(result.hash)
      fireConfetti()

      setTimeout(async () => {
        const still = useStore.getState().selectedCampaign
        if (!still || still.address !== campaignAddr) return
        const fresh = await fetchSingleCampaign(campaignAddr)
        if (fresh && fresh.name !== 'Loading...' && useStore.getState().selectedCampaign?.address === campaignAddr) setSelectedCampaign(fresh)
      }, 3000)
    } catch (error) {
      console.error('Claim refund failed', error)
      setStatus(parseContractError(error, 'refund'))
    } finally {
      setIsSending(false)
    }
  }

  const mintNfts = async (campaignAddr, milestoneIndex) => {
    if (!publicKey) return
    setIsSending(true)
    setStatus('Minting NFTs for voters...')
    setTxHash('')
    try {
      const voterKey = `crowdfund_voters_${campaignAddr}_${milestoneIndex}`
      const voters = JSON.parse(localStorage.getItem(voterKey) || '[]')
      const approvedVoters = voters.filter(v => v.approve)
      if (approvedVoters.length === 0) {
        setStatus('No approved voters found for this milestone.')
        setIsSending(false)
        return
      }

      const account = await HORIZON_SERVER.loadAccount(publicKey)
      const nftContract = new Contract(CONTRACT_ADDRESSES.rewardNft)

      const tx = new TransactionBuilder(account, {
        fee: await HORIZON_SERVER.fetchBaseFee(),
        networkPassphrase: Networks.TESTNET,
      })

      for (const voter of approvedVoters) {
        const voterAmount = BigInt(voter.amount || '0')
        tx.addOperation(
          nftContract.call(
            'mint',
            nativeToScVal(new Address(publicKey), { type: 'address' }),
            nativeToScVal(new Address(voter.address), { type: 'address' }),
            nativeToScVal(new Address(campaignAddr), { type: 'address' }),
            nativeToScVal(milestoneIndex, { type: 'u32' }),
            nativeToScVal(voterAmount, { type: 'i128' })
          )
        )
      }

      const transaction = tx.setTimeout(60).build()

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
      setStatus(`${approvedVoters.length} NFT(s) minted successfully!`)
      setTxHash(result.hash)
      fireConfetti()

      await fetchNftTokens()
    } catch (error) {
      console.error('Mint NFTs failed', error)
      setStatus(parseContractError(error, 'mint'))
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

      <Header
        onConnect={connectWallet}
        onDisconnect={disconnectWallet}
        onShowNft={() => {
          fetchNftTokens()
          setShowNftModal(true)
        }}
      />

      {showNftModal && (
        <NftModal
          tokens={nftTokens}
          onClose={() => setShowNftModal(false)}
        />
      )}

      {showFeedbackForm && (
        <FeedbackForm
          onClose={() => setShowFeedbackForm(false)}
          onSubmit={() => setFeedbackSubmitted(true)}
        />
      )}

      <main className="max-w-2xl mx-auto mt-8 sm:mt-12 px-4 sm:px-5">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
          <h2 className="text-lg sm:text-xl font-bold text-white">
            {selectedCampaign ? 'Campaign Details' : 'Active Campaigns'}
          </h2>
          <div className="flex gap-2 flex-wrap">
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
                  setCampaignSearch('')
                }}
                className="text-xs text-slate-300 border border-slate-600 px-3 py-1.5 rounded-md hover:bg-slate-700 transition-colors"
              >
                Back
              </button>
            )}
            {selectedCampaign && !isSending && (
              <button
                onClick={() => {
                  const addr = selectedCampaign.address
                  setStatus('Refreshing...')
                  setTimeout(async () => {
                    const current = useStore.getState().selectedCampaign
                    if (!current || current.address !== addr) return
                    const fresh = await fetchSingleCampaign(addr)
                    const still = useStore.getState().selectedCampaign
                    if (!still || still.address !== addr) return
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
                setSelectedCampaign(null)
                setShowCreateForm(!showCreateForm)
                setGoal('0')
                setTotalRaised('0')
                setRecentDonors([])
                setDonationCount(0)
                setTxHash('')
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
            {campaigns.length > 0 && (
              <div className="mb-4">
                <input
                  type="text"
                  placeholder="Search campaigns..."
                  value={campaignSearch}
                  onChange={(e) => setCampaignSearch(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-white text-xs outline-none transition-colors focus:border-cyan-400"
                />
              </div>
            )}
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
                campaigns={campaigns.filter(c => {
                  if (!campaignSearch) return true
                  const q = campaignSearch.toLowerCase()
                  return (c.name || '').toLowerCase().includes(q) ||
                         (c.address || '').toLowerCase().includes(q)
                })}
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
              {selectedCampaign.milestones && selectedCampaign.milestones.length > 0 && (
                <div className="flex items-center gap-1.5 mb-4">
                  {selectedCampaign.milestones.map((ms, i) => {
                    const st = parseMilestoneStatus(ms.status)
                    let dotColor = 'bg-slate-600'
                    if (st === 0) dotColor = 'bg-slate-500'
                    if (st === 1) dotColor = 'bg-yellow-400'
                    if (st === 2) dotColor = 'bg-green-400'
                    if (st === 3) dotColor = 'bg-red-400'
                    return <div key={i} className={`w-2.5 h-2.5 rounded-full ${dotColor}`} title={ms.description} />
                  })}
                  <span className="text-[10px] text-slate-500 ml-1">
                    {selectedCampaign.milestones.filter(m => parseMilestoneStatus(m.status) === 2).length}/{selectedCampaign.milestones.length} approved
                  </span>
                </div>
              )}

              <div className="mb-4">
                <div className="text-xs text-slate-500 mb-1">Campaign Address</div>
                <div className="flex items-center gap-2">
                  <div className="text-xs font-mono text-slate-400 break-all flex-1">
                    {selectedCampaign.address}
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(selectedCampaign.address)
                      setStatus('Address copied!')
                      setTimeout(() => setStatus(''), 2000)
                    }}
                    className="text-[10px] text-cyan-400 border border-slate-600 px-2 py-1 rounded hover:bg-slate-700 transition-colors shrink-0"
                  >
                    Copy
                  </button>
                </div>
              </div>

              <CampaignCard
                campaigns={[selectedCampaign]}
                compact
              />

              {selectedCampaign.milestones && selectedCampaign.milestones.length > 0 && (
                <div className="mt-6 mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs text-slate-500">Milestones</div>
                    <div className="flex gap-2 text-[10px]">
                      {selectedCampaign.milestones.filter(m => parseMilestoneStatus(m.status) === 2).length > 0 && (
                        <span className="text-green-400">
                          {selectedCampaign.milestones.filter(m => parseMilestoneStatus(m.status) === 2).length} Approved
                        </span>
                      )}
                      {selectedCampaign.milestones.filter(m => parseMilestoneStatus(m.status) === 1).length > 0 && (
                        <span className="text-yellow-400">
                          {selectedCampaign.milestones.filter(m => parseMilestoneStatus(m.status) === 1).length} Active
                        </span>
                      )}
                      {selectedCampaign.milestones.filter(m => parseMilestoneStatus(m.status) === 3).length > 0 && (
                        <span className="text-red-400">
                          {selectedCampaign.milestones.filter(m => parseMilestoneStatus(m.status) === 3).length} Rejected
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-3">
                    {selectedCampaign.milestones.map((ms, i) => {
                      const msXLM = (Number(ms.amount) / 10_000_000).toFixed(0)
                      const st = parseMilestoneStatus(ms.status)
                      const now = Math.floor(Date.now() / 1000)
                      const votingOpen = st === 1 && ms.voteDeadline > now
                      const votingEnded = st === 1 && ms.voteDeadline > 0 && now >= ms.voteDeadline
                      const approvals = Number(ms.approvals || '0')
                      const rejections = Number(ms.rejections || '0')
                      const totalVoted = approvals + rejections
                      const totalVoterWeight = Number(selectedCampaign.totalVoterWeight || '0')
                      const quorumPct = totalVoterWeight > 0 ? (totalVoted / totalVoterWeight) * 100 : 0
                      const supermajorityPct = totalVoted > 0 ? (approvals / totalVoted) * 100 : 0
                      const donorWeight = Number(selectedCampaign.donorTotal || '0')
                      const hasVoted = selectedCampaign.hasVoted?.[i]
                      const refundClaimed = selectedCampaign.refundClaimed?.[i]
                      const deadlineDate = ms.voteDeadline ? new Date(ms.voteDeadline * 1000) : null
                      const timeLeft = deadlineDate ? Math.max(0, Math.ceil((deadlineDate - new Date()) / 1000)) : 0

                      let statusColor = 'text-slate-500'
                      let statusLabel = 'Pending'
                      if (st === 1) { statusColor = 'text-yellow-400'; statusLabel = votingEnded ? 'Voting Ended' : 'Submitted' }
                      if (st === 2) { statusColor = 'text-green-400'; statusLabel = 'Approved' }
                      if (st === 3) { statusColor = 'text-red-400'; statusLabel = 'Rejected' }

                      return (
                        <div key={i} className="bg-slate-900 rounded-lg p-3 border border-slate-700">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex-1">
                              <div className="text-xs font-medium text-white">{ms.description}</div>
                              <div className="text-[11px] text-slate-500 font-mono">{msXLM} XLM</div>
                            </div>
                            <span className={`text-[11px] font-medium ${statusColor}`}>{statusLabel}</span>
                          </div>

                          {st === 1 && votingOpen && (
                            <div className="mb-2 space-y-1.5">
                              <div className="flex items-center gap-2 text-[10px] text-slate-500">
                                <span>Approve ({Math.round(approvals / 10_000_000)} XLM)</span>
                                <span className="text-slate-600">|</span>
                                <span>Reject ({Math.round(rejections / 10_000_000)} XLM)</span>
                                <span className="text-slate-600">|</span>
                                <span>Quorum: {quorumPct.toFixed(0)}% / 51%</span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden flex">
                                <div
                                  className="h-full bg-green-500 transition-all"
                                  style={{ width: `${totalVoted > 0 ? (approvals / totalVoted) * 100 : 0}%` }}
                                />
                                <div
                                  className="h-full bg-red-500 transition-all"
                                  style={{ width: `${totalVoted > 0 ? (rejections / totalVoted) * 100 : 0}%` }}
                                />
                              </div>
                              <div className="flex justify-between text-[10px] text-slate-600">
                                <span>Supermajority: {supermajorityPct.toFixed(0)}% / 66%</span>
                                <span>{timeLeft > 0 ? `${Math.floor(timeLeft / 3600)}h ${Math.floor((timeLeft % 3600) / 60)}m left` : 'Deadline passed'}</span>
                              </div>
                            </div>
                          )}

                          <div className="flex items-center gap-1.5 flex-wrap">
                            {st === 0 && (
                              <button
                                onClick={() => submitMilestone(selectedCampaign.address, i)}
                                disabled={isSending}
                                className="text-[10px] px-2 py-1 rounded bg-yellow-400/10 text-yellow-400 hover:bg-yellow-400/20 transition-colors disabled:opacity-50"
                              >
                                Submit
                              </button>
                            )}
                            {st === 1 && votingOpen && !hasVoted && donorWeight > 0 && (
                              <>
                                <button
                                  onClick={() => voteOnMilestone(selectedCampaign.address, i, true)}
                                  disabled={isSending}
                                  className="text-[10px] px-2 py-1 rounded bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-50"
                                >
                                  Approve ({(donorWeight / 10_000_000).toFixed(0)} XLM)
                                </button>
                                <button
                                  onClick={() => voteOnMilestone(selectedCampaign.address, i, false)}
                                  disabled={isSending}
                                  className="text-[10px] px-2 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                                >
                                  Reject ({(donorWeight / 10_000_000).toFixed(0)} XLM)
                                </button>
                              </>
                            )}
                            {st === 1 && hasVoted && (
                              <span className="text-[10px] text-slate-500">You voted</span>
                            )}
                            {st === 1 && !hasVoted && donorWeight === 0 && (
                              <span className="text-[10px] text-slate-600">Donate to vote</span>
                            )}
                            {st === 1 && !hasVoted && (votingEnded || (!votingOpen && ms.voteDeadline > 0)) && (
                              <button
                                onClick={() => releaseMilestone(selectedCampaign.address, i)}
                                disabled={isSending}
                                className="text-[10px] px-2 py-1 rounded bg-cyan-400/10 text-cyan-400 hover:bg-cyan-400/20 transition-colors disabled:opacity-50"
                              >
                                Release
                              </button>
                            )}
                            {st === 1 && hasVoted && quorumPct >= 51 && supermajorityPct >= 66 && (
                              <button
                                onClick={() => releaseMilestone(selectedCampaign.address, i)}
                                disabled={isSending}
                                className="text-[10px] px-2 py-1 rounded bg-cyan-400/10 text-cyan-400 hover:bg-cyan-400/20 transition-colors disabled:opacity-50"
                              >
                                Release
                              </button>
                            )}
                            {st === 2 && (
                              <button
                                onClick={() => mintNfts(selectedCampaign.address, i)}
                                disabled={isSending}
                                className="text-[10px] px-2 py-1 rounded bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors disabled:opacity-50"
                              >
                                Mint NFTs
                              </button>
                            )}
                            {st === 3 && !refundClaimed && (
                              <button
                                onClick={() => claimRefund(selectedCampaign.address, i)}
                                disabled={isSending}
                                className="text-[10px] px-2 py-1 rounded bg-orange-400/10 text-orange-400 hover:bg-orange-400/20 transition-colors disabled:opacity-50"
                              >
                                Claim Refund
                              </button>
                            )}
                            {st === 3 && refundClaimed && (
                              <span className="text-[10px] text-slate-500">Refund claimed</span>
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

      <footer className="max-w-2xl mx-auto px-4 sm:px-5 py-8 mt-12 border-t border-slate-800">
        <div className="text-center">
          <div className="text-xs text-slate-500 mb-2">Stellar Crowdfund — Donor-Protected Escrow on Stellar Testnet</div>
          <div className="text-[10px] text-slate-600 font-mono space-y-0.5">
            <div>Factory: {CONTRACT_ADDRESSES.factory.slice(0, 8)}...{CONTRACT_ADDRESSES.factory.slice(-6)}</div>
            <div>RewardNFT: {CONTRACT_ADDRESSES.rewardNft.slice(0, 8)}...{CONTRACT_ADDRESSES.rewardNft.slice(-6)}</div>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
