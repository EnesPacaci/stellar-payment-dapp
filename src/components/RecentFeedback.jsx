import { useState, useEffect, useCallback } from 'react'
import useStore from '../store'
import { fetchOnChainFeedback } from '../feedback'

function timeAgo(ts) {
  if (!ts) return ''
  const now = Date.now()
  const then = ts * 1000
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

function StarRating({ rating }) {
  return (
    <span className="text-yellow-400">
      {[1, 2, 3, 4, 5].map(s => (
        <span key={s} className={s <= rating ? 'opacity-100' : 'opacity-25'}>★</span>
      ))}
    </span>
  )
}

export default function RecentFeedback() {
  const [feedbacks, setFeedbacks] = useState([])
  const [feedbackCount, setFeedbackCount] = useState(0)
  const selectedCampaign = useStore((s) => s.selectedCampaign)
  const publicKey = useStore((s) => s.publicKey)

  const loadFeedback = useCallback(async () => {
    if (!selectedCampaign) return
    const items = await fetchOnChainFeedback(selectedCampaign.address)
    setFeedbacks(items.slice(0, 10))
    setFeedbackCount(items.length)
  }, [selectedCampaign])

  useEffect(() => {
    loadFeedback()
  }, [loadFeedback])

  useEffect(() => {
    if (!selectedCampaign) return
    let cancelled = false
    let timeout
    const poll = async () => {
      if (!cancelled) await loadFeedback()
      if (!cancelled) timeout = setTimeout(poll, 15000)
    }
    timeout = setTimeout(poll, 15000)
    return () => { cancelled = true; clearTimeout(timeout) }
  }, [selectedCampaign, loadFeedback])

  return (
    <div className="mt-6 pt-5 border-t border-slate-700">
      <div className="flex justify-between items-center mb-3">
        <div className="text-sm font-semibold text-slate-300">
          User Feedback
        </div>
        {feedbackCount > 0 && (
          <div className="text-[10px] text-slate-500">
            {feedbackCount} total
          </div>
        )}
      </div>
      {feedbacks.length > 0 ? (
        feedbacks.map((f, i) => {
          const isYou = publicKey && f.user === publicKey
          return (
            <div
              key={i}
              className="py-3 border-b border-slate-800 last:border-b-0"
            >
              <div className="flex justify-between items-start mb-1">
                <div className="text-xs font-mono">
                  {isYou ? (
                    <span className="text-cyan-400 font-semibold">You</span>
                  ) : (
                    <span className="text-slate-400">
                      User {f.user.slice(0, 6)}...{f.user.slice(-4)}
                    </span>
                  )}
                </div>
                <StarRating rating={f.rating} />
              </div>
              {f.comment && (
                <div className="text-[11px] text-slate-300 mb-1">
                  "{f.comment.length > 50 ? f.comment.slice(0, 50) + '...' : f.comment}"
                </div>
              )}
              <div className="text-[11px] text-slate-600">
                {timeAgo(f.timestamp)}
              </div>
            </div>
          )
        })
      ) : (
        <div className="text-xs text-slate-600 text-center py-4">
          No feedback yet. Be the first!
        </div>
      )}
    </div>
  )
}
