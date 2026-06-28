import useStore from '../store'

const quickAmounts = [10, 50, 100, 500]

export default function DonateForm({ onDonate }) {
  const publicKey = useStore((s) => s.publicKey)
  const amount = useStore((s) => s.amount)
  const isSending = useStore((s) => s.isSending)
  const setAmount = useStore((s) => s.setAmount)

  return (
    <div>
      {!publicKey ? (
        <p className="text-center text-slate-500 text-sm mt-5">
          Connect your wallet to donate.
        </p>
      ) : (
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            Donation Amount (XLM)
          </label>
          <div className="flex gap-2 mb-4">
            {quickAmounts.map((val) => (
              <button
                key={val}
                onClick={() => setAmount(val.toString())}
                className="flex-1 py-2 rounded-md border border-slate-700 bg-transparent text-cyan-400 cursor-pointer text-xs font-medium hover:bg-slate-700 transition-colors"
              >
                {val} XLM
              </button>
            ))}
          </div>
          <input
            type="number"
            placeholder="Enter amount..."
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="0"
            step="0.01"
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-700 bg-slate-900 text-white font-mono text-sm outline-none mb-4 transition-colors focus:border-cyan-400"
          />
          <button
            onClick={onDonate}
            disabled={isSending}
            className={`w-full py-3 rounded-lg text-sm font-semibold tracking-wide transition-all ${
              isSending
                ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                : 'bg-cyan-400 text-slate-900 cursor-pointer hover:bg-cyan-300'
            }`}
          >
            {isSending ? 'Sending...' : 'Donate XLM'}
          </button>
        </div>
      )}
    </div>
  )
}
