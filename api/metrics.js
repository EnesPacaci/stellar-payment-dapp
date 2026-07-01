import { rpc, scValToNative } from '@stellar/stellar-sdk'

const FACTORY_ID = 'CDXVHHKWEA7VA62KZKMTUCLQC6XR3URCZBA7QGPAFE6PP4AY2NG675TM'
const RPC_URL = 'https://soroban-testnet.stellar.org'

const SOROBAN = new rpc.Server(RPC_URL)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'no-cache')

  try {
    const startTime = Date.now()

    const latestLedgerInfo = await SOROBAN.getLatestLedger()
    const latestLedger = latestLedgerInfo?.sequence || 0
    const startLedger = Math.max(latestLedger - 100000, 1)

    const campaignsResult = await SOROBAN.simulateContract({
      contractId: FACTORY_ID,
      method: 'get_campaigns',
      args: [],
    }).catch(() => null)

    let campaignAddresses = []
    if (campaignsResult?.result?.retval) {
      try {
        const native = scValToNative(campaignsResult.result.retval)
        if (Array.isArray(native)) {
          campaignAddresses = native.map(a => a.toString())
        }
      } catch {}
    }

    let donations = 0, feedbacks = 0, votes = 0
    const uniqueDonors = new Set()

    for (const campaignAddr of campaignAddresses) {
      try {
        const eventsResult = await SOROBAN.getEvents({
          startLedger,
          filters: [{ type: 'contract', contractIds: [campaignAddr] }],
          pagination: { limit: 200 },
        }).catch(() => ({ events: [] }))
        const events = eventsResult?.events || []

        for (const e of events) {
          try {
            const sym = scValToNative(e.topic[0])
            if (sym === 'donate') {
              donations++
              const data = scValToNative(e.value)
              if (data?.[0]) uniqueDonors.add(data[0].toString())
            } else if (sym === 'feedback') {
              feedbacks++
            } else if (sym === 'vote_a' || sym === 'vote_r') {
              votes++
            }
          } catch {}
        }
      } catch {}
    }

    const responseTime = Date.now() - startTime

    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      responseTimeMs: responseTime,
      network: 'Stellar Testnet',
      rpcLatestLedger: latestLedger,
      contracts: {
        factory: FACTORY_ID,
        totalCampaigns: campaignAddresses.length,
      },
      stats: {
        totalDonations: donations,
        totalFeedback: feedbacks,
        totalVotes: votes,
        uniqueDonors: uniqueDonors.size,
      },
    })
  } catch (err) {
    res.status(200).json({
      status: 'degraded',
      timestamp: new Date().toISOString(),
      error: err.message,
      contracts: {
        factory: FACTORY_ID,
      },
    })
  }
}
