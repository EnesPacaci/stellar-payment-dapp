import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import NftModal from '../components/NftModal'
import useStore from '../store'

describe('NftModal', () => {
  it('renders empty state when no tokens', () => {
    useStore.setState({ publicKey: null })
    render(<NftModal tokens={[]} onClose={() => {}} />)
    expect(screen.getByText('My Proof-of-Impact NFTs')).toBeInTheDocument()
    expect(screen.getByText('No NFTs yet')).toBeInTheDocument()
  })

  it('renders token list when tokens exist', () => {
    const tokens = [
      { tokenId: 1, campaign: 'CBTEST123456789ABC', milestoneId: 0, amount: '500000000', timestamp: 1700000000 },
      { tokenId: 2, campaign: 'CBTEST987654321DEF', milestoneId: 1, amount: '300000000', timestamp: 1700100000 },
    ]
    useStore.setState({ publicKey: 'GDGGSUZ42XTYN5MLZGLNNUGO446SVL6XVZQQSPTSCEM2PCHCRZCW3X3C' })
    render(<NftModal tokens={tokens} onClose={() => {}} />)
    expect(screen.getByText('NFT #1')).toBeInTheDocument()
    expect(screen.getByText('NFT #2')).toBeInTheDocument()
    expect(screen.getByText('Milestone: 0')).toBeInTheDocument()
    expect(screen.getByText('Milestone: 1')).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    const handleClose = vi.fn()
    useStore.setState({ publicKey: null })
    render(<NftModal tokens={[]} onClose={handleClose} />)
    fireEvent.click(screen.getByText('Close'))
    expect(handleClose).toHaveBeenCalled()
  })
})
