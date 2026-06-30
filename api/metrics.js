import { rpc, scValToNative } from '@stellar/stellar-sdk'

const FACTORY_ID = 'CC746HDMG7BQ4IBL3324VIUYIHKP5LITPABDNAK4JH222OMRINVTXJ54'
const CAMPAIGN_ID = 'CBJW2KCJXLWIPDO4TFIU3P7ZVH6XFH5ZJ2CP7VQW62FVINX4YNTGNAAM'
const RPC_URL = 'https://soroban-testnet.stellar.org'

const SOROBAN = new rpc.Server(RPC_URL)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'no-cache')

  try {
    const startTime = Date.now()

    const latestLedgerInfo = await SOROBAN.getLatestLedger()
    const latestLedger = latestLedgerInfo?.sequence || 0
    const startLedger = Math.max(latestLedger - 5000, 1)

    const eventsResult = await SOROBAN.getEvents({
      startLedger,
      filters: [{ type: 'contract', contractIds: [CAMPAIGN_ID] }],
      pagination: { limit: 200 },
    }).catch(() => ({ events: [] }))
    const events = eventsResult?.events || []
    let donations = 0, feedbacks = 0, votes = 0
    const uniqueDonors = new Set()

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

    const responseTime = Date.now() - startTime

    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      responseTimeMs: responseTime,
      network: 'Stellar Testnet',
      rpcLatestLedger: latestLedger,
      contracts: {
        factory: FACTORY_ID,
        campaign: CAMPAIGN_ID,
      },
      stats: {
        totalDonations: donations,
        totalFeedback: feedbacks,
        totalVotes: votes,
        uniqueDonors: uniqueDonors.size,
        totalEvents: events.length,
      },
    })
  } catch (err) {
    res.status(200).json({
      status: 'degraded',
      timestamp: new Date().toISOString(),
      error: err.message,
      contracts: {
        factory: FACTORY_ID,
        campaign: CAMPAIGN_ID,
      },
    })
  }
}
