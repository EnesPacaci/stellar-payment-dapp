import useStore from '../store'

export default function CampaignCard() {
  const { totalRaised, goal, donationCount } = useStore()

  const goalXLM = parseFloat(goal) / 10_000_000
  const raisedXLM = parseFloat(totalRaised) / 10_000_000
  const progressPct = goalXLM > 0 ? Math.min((raisedXLM / goalXLM) * 100, 100) : 0

  return (
    <div>
      <div className="flex justify-between mb-6">
        <div className="text-center flex-1">
          <div className="text-2xl font-bold text-cyan-400 font-mono">
            {raisedXLM.toFixed(2)}
          </div>
          <div className="text-xs text-slate-400 mt-1">Raised (XLM)</div>
        </div>
        <div className="text-center flex-1">
          <div className="text-2xl font-bold text-cyan-400 font-mono">
            {goalXLM.toFixed(0)}
          </div>
          <div className="text-xs text-slate-400 mt-1">Goal (XLM)</div>
        </div>
        <div className="text-center flex-1">
          <div className="text-2xl font-bold text-cyan-400 font-mono">
            {donationCount}
          </div>
          <div className="text-xs text-slate-400 mt-1">Donations</div>
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
      <div className="text-xs text-right text-slate-400 mb-6">
        {progressPct.toFixed(1)}% funded
      </div>
    </div>
  )
}
