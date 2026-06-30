import useStore from '../store'

export default function RecentDonations() {
  const recentDonors = useStore((s) => s.recentDonors)
  const donationCount = useStore((s) => s.donationCount)

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
        recentDonors.map((d, i) => (
          <div
            key={i}
            className="flex justify-between items-center py-2 border-b border-slate-800 last:border-b-0"
          >
            <div>
              <div className="text-xs font-mono text-slate-400">
                {d.address.slice(0, 6)}...{d.address.slice(-4)}
              </div>
              <div className="text-[11px] text-slate-600">
                {new Date(d.time).toLocaleString()}
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
        ))
      ) : (
        <div className="text-xs text-slate-600 text-center py-4">
          No donations yet. Be the first!
        </div>
      )}
    </div>
  )
}
