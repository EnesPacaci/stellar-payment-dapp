import { create } from 'zustand'

const useStore = create((set) => ({
  publicKey: null,
  balance: null,
  walletName: '',
  status: '',
  txHash: '',
  isSending: false,
  amount: '',
  totalRaised: '0',
  goal: '0',
  recentDonors: [],
  donationCount: 0,

  setPublicKey: (publicKey) => set({ publicKey }),
  setBalance: (balance) => set({ balance }),
  setWalletName: (walletName) => set({ walletName }),
  setStatus: (status) => set({ status }),
  setTxHash: (txHash) => set({ txHash }),
  setIsSending: (isSending) => set({ isSending }),
  setTotalRaised: (totalRaised) => set({ totalRaised }),
  setGoal: (goal) => set({ goal }),
  setRecentDonors: (recentDonors) => set({ recentDonors }),
  setDonationCount: (donationCount) => set({ donationCount }),
  setAmount: (amount) => set({ amount }),
  resetWallet: () => set({ publicKey: null, balance: null, walletName: '', amount: '' }),
  resetTx: () => set({ status: '', txHash: '' }),
}))

export default useStore
