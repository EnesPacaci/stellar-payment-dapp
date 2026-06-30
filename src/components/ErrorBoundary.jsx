import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
          <div className="bg-slate-800 rounded-xl p-8 shadow-lg border border-slate-700 max-w-md w-full text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <div className="text-lg font-bold text-white mb-2">Something went wrong</div>
            <div className="text-sm text-slate-400 mb-4">
              An unexpected error occurred. Please try refreshing the page.
            </div>
            <div className="text-xs text-slate-600 mb-4 font-mono break-all">
              {this.state.error?.message || 'Unknown error'}
            </div>
            <button
              onClick={() => window.location.reload()}
              className="bg-cyan-400 text-slate-900 px-4 py-2 rounded-md text-sm font-semibold hover:bg-cyan-300 transition-colors"
            >
              Refresh Page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
