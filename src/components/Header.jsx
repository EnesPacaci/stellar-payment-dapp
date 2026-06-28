import useStore from '../store'

export default function Header({ onConnect, onDisconnect }) {
  const { publicKey, balance, walletName } = useStore()

  return (
    <header className="bg-slate-800 border-b border-slate-700 px-6 py-3.5 flex items-center justify-between">
      <span className="font-bold text-lg tracking-tight text-cyan-400">
        Stellar Crowdfund
      </span>
      {publicKey ? (
        <div className="flex items-center gap-3.5">
          <span className="text-xs text-slate-300 font-mono">
            Balance: {balance ? `${parseFloat(balance).toFixed(4)} XLM` : '...'}
          </span>
          <span className="text-xs text-slate-400 font-mono bg-white/5 px-2.5 py-1 rounded">
            {publicKey.slice(0, 6)}...{publicKey.slice(-4)}
          </span>
          {walletName && (
            <span className="text-[11px] text-slate-500">{walletName}</span>
          )}
          <button
            onClick={onDisconnect}
            className="text-xs text-slate-300 border border-slate-600 px-4 py-1.5 rounded-md hover:bg-slate-700 transition-colors"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <button
          onClick={onConnect}
          className="bg-cyan-400 text-slate-900 border-none px-5 py-2 rounded-md text-sm font-semibold cursor-pointer hover:bg-cyan-300 transition-colors"
        >
          Connect Wallet
        </button>
      )}
    </header>
  )
}
