import useStore from '../store'

export default function Header({ onConnect, onDisconnect, onShowNft }) {
  const { publicKey, balance, walletName, isSending } = useStore()

  return (
    <header className="bg-slate-800 border-b border-slate-700 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-2">
      <span className="font-bold text-base sm:text-lg tracking-tight text-cyan-400 shrink-0">
        Stellar Crowdfund
      </span>
      {publicKey ? (
        <div className="flex items-center gap-2 sm:gap-3.5 flex-wrap">
          <span className="text-[11px] sm:text-xs text-slate-300 font-mono">
            {balance ? `${parseFloat(balance).toFixed(4)} XLM` : '...'}
          </span>
          <span className="text-[11px] sm:text-xs text-slate-400 font-mono bg-white/5 px-2 py-1 rounded">
            {publicKey.slice(0, 6)}...{publicKey.slice(-4)}
          </span>
          {walletName && (
            <span className="text-[10px] sm:text-[11px] text-slate-500 hidden sm:inline">{walletName}</span>
          )}
          <button
            onClick={onShowNft}
            disabled={isSending}
            className="text-[11px] sm:text-xs text-purple-400 border border-purple-600/50 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-md transition-colors hover:bg-purple-500/10 shrink-0 disabled:opacity-50"
          >
            NFTs
          </button>
          <button
            onClick={onDisconnect}
            disabled={isSending}
            className={`text-[11px] sm:text-xs text-slate-300 border border-slate-600 px-2.5 sm:px-4 py-1 sm:py-1.5 rounded-md transition-colors shrink-0 ${
              isSending ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-700'
            }`}
          >
            Disconnect
          </button>
        </div>
      ) : (
        <button
          onClick={onConnect}
          className="bg-cyan-400 text-slate-900 border-none px-4 sm:px-5 py-1.5 sm:py-2 rounded-md text-sm font-semibold cursor-pointer hover:bg-cyan-300 transition-colors"
        >
          Connect Wallet
        </button>
      )}
    </header>
  )
}
