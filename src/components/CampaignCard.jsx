export default function CampaignCard({ campaigns = [], onSelect, compact = false }) {
  if (compact && campaigns.length === 1) {
    const c = campaigns[0]
    const goalXLM = parseFloat(c.goal) / 10_000_000
    const raisedXLM = parseFloat(c.raised) / 10_000_000
    const progressPct = goalXLM > 0 ? Math.min((raisedXLM / goalXLM) * 100, 100) : 0
    const deadlineDate = c.deadline ? new Date(c.deadline * 1000) : null
    const isExpired = deadlineDate && deadlineDate < new Date()
    const daysLeft = deadlineDate ? Math.max(0, Math.ceil((deadlineDate - new Date()) / 86400000)) : null

    return (
      <div>
        {c.name && (
          <div className="text-lg font-bold text-white mb-4">{c.name}</div>
        )}
        <div className="flex justify-between mb-6">
          <div className="text-center flex-1">
            <div className="text-xl sm:text-2xl font-bold text-cyan-400 font-mono">
              {raisedXLM.toFixed(2)}
            </div>
            <div className="text-[10px] sm:text-xs text-slate-400 mt-1">Raised (XLM)</div>
          </div>
          <div className="text-center flex-1">
            <div className="text-xl sm:text-2xl font-bold text-cyan-400 font-mono">
              {goalXLM.toFixed(2)}
            </div>
            <div className="text-[10px] sm:text-xs text-slate-400 mt-1">Goal (XLM)</div>
          </div>
          <div className="text-center flex-1">
            <div className="text-xl sm:text-2xl font-bold text-cyan-400 font-mono">
              {progressPct.toFixed(1)}%
            </div>
            <div className="text-[10px] sm:text-xs text-slate-400 mt-1">Funded</div>
          </div>
        </div>

        <div className="w-full h-3 bg-slate-700 rounded-full overflow-hidden mb-2">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${progressPct}%`,
              background: 'linear-gradient(90deg, #38bdf8, #818cf8)',
            }}
          />
        </div>
        <div className="text-xs text-right text-slate-400 mb-2">
          {progressPct.toFixed(1)}% funded
        </div>
        {deadlineDate && (
          <div className={`text-xs text-center ${isExpired ? 'text-red-400' : 'text-slate-500'}`}>
            {isExpired ? 'Campaign ended' : `${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining`}
          </div>
        )}
      </div>
    )
  }

  if (campaigns.length === 0) {
    return (
      <div className="bg-slate-800 rounded-xl p-8 shadow-lg border border-slate-700 text-center">
        <div className="text-slate-500 text-sm">No campaigns yet.</div>
        <div className="text-slate-600 text-xs mt-1">Create the first campaign to get started!</div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {campaigns.map((c) => {
        const goalXLM = parseFloat(c.goal) / 10_000_000
        const raisedXLM = parseFloat(c.raised) / 10_000_000
        const progressPct = goalXLM > 0 ? Math.min((raisedXLM / goalXLM) * 100, 100) : 0

        return (
          <div
            key={c.address}
            onClick={() => onSelect(c)}
            className="bg-slate-800 rounded-xl p-5 shadow-lg border border-slate-700 cursor-pointer hover:border-cyan-400/50 transition-colors"
          >
            <div className="flex justify-between items-start mb-3">
              <div className="text-sm font-semibold text-white truncate flex-1 mr-3">
                {c.name || `${c.address.slice(0, 8)}...${c.address.slice(-6)}`}
              </div>
              <div className="text-xs font-semibold text-cyan-400">
                {progressPct.toFixed(1)}%
              </div>
            </div>

            <div className="flex justify-between mb-3">
              <div>
                <div className="text-lg font-bold text-white font-mono">
                  {raisedXLM.toFixed(2)}
                </div>
                <div className="text-[11px] text-slate-500">raised</div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-slate-300 font-mono">
                  {goalXLM.toFixed(2)}
                </div>
                <div className="text-[11px] text-slate-500">goal</div>
              </div>
            </div>

            <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${progressPct}%`,
                  background: 'linear-gradient(90deg, #38bdf8, #818cf8)',
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
