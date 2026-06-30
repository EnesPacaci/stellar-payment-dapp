import useStore from '../store'

export default function NftModal({ tokens, onClose }) {
  const publicKey = useStore((s) => s.publicKey)

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl p-6 shadow-xl border border-slate-700 max-w-lg w-full max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <div className="text-sm font-semibold text-white">My Proof-of-Impact NFTs</div>
          <button
            onClick={onClose}
            className="text-xs text-slate-400 border border-slate-600 px-2.5 py-1 rounded-md hover:bg-slate-700 transition-colors"
          >
            Close
          </button>
        </div>

        {tokens.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-4xl mb-3">🏆</div>
            <div className="text-sm text-slate-400 mb-1">No NFTs yet</div>
            <div className="text-xs text-slate-500">Donate to a campaign and vote on milestones to earn Proof-of-Impact NFTs</div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {tokens.map((token) => (
              <div key={token.tokenId} className="bg-slate-900 rounded-lg p-3 border border-slate-700">
                <div className="text-xs font-bold text-cyan-400 mb-1">NFT #{token.tokenId}</div>
                <div className="text-[10px] text-slate-400 mb-0.5 font-mono break-all">
                  Campaign: {token.campaign ? `${token.campaign.slice(0, 6)}...${token.campaign.slice(-4)}` : 'Unknown'}
                </div>
                <div className="text-[10px] text-slate-400 mb-0.5">Milestone: {token.milestoneId}</div>
                <div className="text-[10px] text-slate-400 mb-0.5">Amount: {token.amount ? `${(Number(token.amount) / 10_000_000).toFixed(0)} XLM` : '0 XLM'}</div>
                <div className="text-[10px] text-slate-500">
                  {token.timestamp ? new Date(token.timestamp * 1000).toLocaleDateString() : ''}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 text-[10px] text-slate-600 text-center">
          {publicKey ? `${publicKey.slice(0, 6)}...${publicKey.slice(-4)}` : ''}
        </div>
      </div>
    </div>
  )
}
