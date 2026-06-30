import useStore from '../store'

function timeAgo(dateStr) {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  if (isNaN(then)) return ''
  const seconds = Math.floor((now - then) / 1000)
  if (seconds < 10) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function RecentDonations() {
  const recentDonors = useStore((s) => s.recentDonors)
  const donationCount = useStore((s) => s.donationCount)
  const publicKey = useStore((s) => s.publicKey)

  return (
    <div className="mt-6 pt-5 border-t border-slate-700">
      <div className="flex justify-between items-center mb-3">
        <div className="text-sm font-semibold text-slate-300">
          Recent Donations
        </div>
        {donationCount > 0 && (
          <div className="text-[10px] text-slate-500">
            {donationCount} total
          </div>
        )}
      </div>
      {recentDonors.length > 0 ? (
        recentDonors.map((d, i) => {
          const isYou = publicKey && d.address === publicKey
          return (
            <div
              key={d.tx || i}
              className="flex justify-between items-center py-2 border-b border-slate-800 last:border-b-0"
            >
              <div>
                <div className="text-xs font-mono">
                  {isYou ? (
                    <span className="text-cyan-400 font-semibold">You</span>
                  ) : (
                    <span className="text-slate-400">
                      User {d.address.slice(0, 6)}...{d.address.slice(-4)}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-600">
                  {timeAgo(d.time)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-semibold text-cyan-400">
                  {(parseFloat(d.amount) / 10_000_000).toFixed(2)} XLM
                </div>
                {d.tx && (
                  <a
                    href={`https://stellar.expert/explorer/testnet/tx/${d.tx}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-slate-600 hover:text-cyan-400 transition-colors"
                  >
                    view tx
                  </a>
                )}
              </div>
            </div>
          )
        })
      ) : (
        <div className="text-xs text-slate-600 text-center py-4">
          No donations yet. Be the first!
        </div>
      )}
    </div>
  )
}
