import { Contract, Address, TransactionBuilder, Networks, rpc, nativeToScVal, scValToNative } from '@stellar/stellar-sdk'
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit'
import { SOROBAN_RPC_URL, HORIZON_URL } from './config'

const HORIZON_SERVER = new (await import('@stellar/stellar-sdk')).Horizon.Server(HORIZON_URL)
const SOROBAN_SERVER = new rpc.Server(SOROBAN_RPC_URL)

export async function submitOnChainFeedback(publicKey, campaignAddress, rating, comment) {
  if (!publicKey) throw new Error('No wallet connected')
  if (!campaignAddress) throw new Error('No campaign selected')

  const maxRetries = 3
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const campaignContract = new Contract(campaignAddress)
      const account = await HORIZON_SERVER.loadAccount(publicKey)

      const tx = new TransactionBuilder(account, {
        fee: '500',
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          campaignContract.call(
            'submit_feedback',
            new Address(publicKey).toScVal(),
            nativeToScVal(rating, { type: 'u32' }),
            nativeToScVal(comment || '', { type: 'string' })
          )
        )
        .setTimeout(60)
        .build()

      let simResult
      try {
        simResult = await SOROBAN_SERVER.simulateTransaction(tx)
      } catch (err) {
        const detail = err?.response?.data || err?.message || err
        throw new Error('Simulation failed: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)))
      }
      if (simResult.error) {
        const detail = simResult.error?.message || simResult.error?.toString() || JSON.stringify(simResult.error)
        throw new Error('Contract error: ' + detail)
      }

      const assembledTx = rpc.assembleTransaction(tx, simResult).build()
      const { signedTxXdr } = await StellarWalletsKit.signTransaction(assembledTx.toXDR(), {
        networkPassphrase: Networks.TESTNET,
      })

      const signedTx = TransactionBuilder.fromXDR(signedTxXdr, Networks.TESTNET)
      await HORIZON_SERVER.submitTransaction(signedTx)
      return
    } catch (err) {
      const is400 = err?.response?.status === 400 || err?.message?.includes('400')
      if (is400 && attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 2000))
        continue
      }
      throw err
    }
  }
}

async function invokeCampaignRead(campaignAddress, fn, ...args) {
  const contract = new Contract(campaignAddress)
  const sourceAccount = await HORIZON_SERVER.loadAccount('GDGGSUZ42XTYN5MLZGLNNUGO446SVL6XVZQQSPTSCEM2PCHCRZCW3X3C')
  const tx = new TransactionBuilder(sourceAccount, { fee: '200', networkPassphrase: Networks.TESTNET })
    .addOperation(contract.call(fn, ...args))
    .setTimeout(30)
    .build()
  const result = await SOROBAN_SERVER.simulateTransaction(tx)
  if (result.error) return null
  return scValToNative(result.result?.retval)
}

export async function fetchOnChainFeedback(campaignAddress) {
  if (!campaignAddress) return []
  try {
    const count = await invokeCampaignRead(campaignAddress, 'get_feedback_count')
    if (!count || count === 0) return []

    const feedbacks = []
    for (let i = 0; i < Math.min(count, 20); i++) {
      try {
        const fb = await invokeCampaignRead(campaignAddress, 'get_feedback', nativeToScVal(i, { type: 'u32' }))
        if (fb) {
          feedbacks.push({
            user: fb.user?.toString() || '',
            rating: Number(fb.rating || 0),
            comment: fb.comment?.toString() || '',
            timestamp: Number(fb.timestamp || 0),
          })
        }
      } catch { continue }
    }
    return feedbacks.reverse()
  } catch {
    return []
  }
}
