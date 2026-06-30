import { useState } from 'react'
import useStore from '../store'

export default function FeedbackForm({ onClose, onSubmit }) {
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [hover, setHover] = useState(0)
  const setStatus = useStore((s) => s.setStatus)

  const handleSubmit = () => {
    if (rating === 0) return
    const feedback = { rating, comment, timestamp: new Date().toISOString() }
    const stored = localStorage.getItem('crowdfund_feedback')
    const list = stored ? JSON.parse(stored) : []
    list.unshift(feedback)
    localStorage.setItem('crowdfund_feedback', JSON.stringify(list))
    setSubmitted(true)
    onSubmit()
    setStatus('Thank you for your feedback!')
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl p-6 shadow-xl border border-slate-700 max-w-sm w-full">
        {submitted ? (
          <div className="text-center">
            <div className="text-lg text-green-400 mb-2">Feedback submitted!</div>
            <button
              onClick={onClose}
              className="text-xs text-slate-400 border border-slate-600 px-3 py-1.5 rounded-md hover:bg-slate-700 transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="text-sm font-semibold text-white mb-3">How was your experience?</div>
            <div className="flex gap-1 justify-center mb-4">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHover(star)}
                  onMouseLeave={() => setHover(0)}
                  className={`text-2xl transition-colors cursor-pointer ${
                    star <= (hover || rating) ? 'text-yellow-400' : 'text-slate-600'
                  }`}
                >
                  ★
                </button>
              ))}
            </div>
            <textarea
              placeholder="Share your thoughts (optional)..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 text-white text-xs outline-none mb-3 transition-colors focus:border-cyan-400 resize-none"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={onClose}
                className="text-xs text-slate-400 border border-slate-600 px-3 py-1.5 rounded-md hover:bg-slate-700 transition-colors"
              >
                Skip
              </button>
              <button
                onClick={handleSubmit}
                disabled={rating === 0}
                className="text-xs bg-cyan-400 text-slate-900 px-3 py-1.5 rounded-md font-semibold hover:bg-cyan-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Submit
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
