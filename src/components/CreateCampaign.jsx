import { useState } from 'react'
import useStore from '../store'

export default function CreateCampaign({ onSubmit }) {
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [deadlineDays, setDeadlineDays] = useState('30')
  const isSending = useStore((s) => s.isSending)
  const publicKey = useStore((s) => s.publicKey)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!name.trim()) return
    if (!goal || parseFloat(goal) <= 0) return
    if (!deadlineDays || parseInt(deadlineDays) <= 0) return

    const deadlineTs = Math.floor(Date.now() / 1000) + parseInt(deadlineDays) * 86400
    onSubmit(name.trim(), goal, deadlineTs)
    setName('')
    setGoal('')
    setDeadlineDays('30')
  }

  return (
    <div className="bg-slate-800 rounded-xl p-8 shadow-lg border border-slate-700">
      <h3 className="text-lg font-bold text-white mb-4">Create New Campaign</h3>

      {!publicKey ? (
        <p className="text-center text-slate-500 text-sm">
          Connect your wallet to create a campaign.
        </p>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Campaign Name
            </label>
            <input
              type="text"
              placeholder="e.g. Community Garden Fund"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-700 bg-slate-900 text-white text-sm outline-none transition-colors focus:border-cyan-400"
            />
          </div>

          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Funding Goal (XLM)
            </label>
            <input
              type="number"
              placeholder="e.g. 1000"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              min="1"
              step="1"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-700 bg-slate-900 text-white font-mono text-sm outline-none transition-colors focus:border-cyan-400"
            />
          </div>

          <div className="mb-6">
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Deadline (days from now)
            </label>
            <input
              type="number"
              placeholder="e.g. 30"
              value={deadlineDays}
              onChange={(e) => setDeadlineDays(e.target.value)}
              min="1"
              step="1"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-700 bg-slate-900 text-white font-mono text-sm outline-none transition-colors focus:border-cyan-400"
            />
          </div>

          <button
            type="submit"
            disabled={isSending}
            className={`w-full py-3 rounded-lg text-sm font-semibold tracking-wide transition-all ${
              isSending
                ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                : 'bg-cyan-400 text-slate-900 cursor-pointer hover:bg-cyan-300'
            }`}
          >
            {isSending ? 'Creating...' : 'Create Campaign'}
          </button>
        </form>
      )}
    </div>
  )
}
