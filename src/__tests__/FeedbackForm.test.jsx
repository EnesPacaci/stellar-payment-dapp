import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import FeedbackForm from '../components/FeedbackForm'
import useStore from '../store'

vi.mock('../feedback', () => ({
  submitOnChainFeedback: vi.fn().mockResolvedValue(undefined),
  fetchOnChainFeedback: vi.fn().mockResolvedValue([]),
}))

describe('FeedbackForm', () => {
  it('renders feedback form with stars', () => {
    useStore.setState({ setStatus: () => {}, selectedCampaign: { address: 'test' } })
    render(<FeedbackForm onClose={() => {}} onSubmit={() => {}} />)
    expect(screen.getByText('How was your experience?')).toBeInTheDocument()
    expect(screen.getByText('Skip')).toBeInTheDocument()
    expect(screen.getByText('Submit')).toBeInTheDocument()
  })

  it('submit button is disabled when no rating selected', () => {
    useStore.setState({ setStatus: () => {}, selectedCampaign: { address: 'test' } })
    render(<FeedbackForm onClose={() => {}} onSubmit={() => {}} />)
    expect(screen.getByText('Submit')).toBeDisabled()
  })

  it('submit button enabled after star selection', () => {
    useStore.setState({ setStatus: () => {}, selectedCampaign: { address: 'test' } })
    render(<FeedbackForm onClose={() => {}} onSubmit={() => {}} />)
    const stars = screen.getAllByText('★')
    fireEvent.click(stars[2])
    expect(screen.getByText('Submit')).not.toBeDisabled()
  })

  it('calls onClose when Skip is clicked', () => {
    const handleClose = vi.fn()
    useStore.setState({ setStatus: () => {}, selectedCampaign: { address: 'test' } })
    render(<FeedbackForm onClose={handleClose} onSubmit={() => {}} />)
    fireEvent.click(screen.getByText('Skip'))
    expect(handleClose).toHaveBeenCalled()
  })

  it('shows submitted state after submit', async () => {
    useStore.setState({ setStatus: () => {}, selectedCampaign: { address: 'test' }, publicKey: 'GABC...' })
    render(<FeedbackForm onClose={() => {}} onSubmit={() => {}} />)
    const stars = screen.getAllByText('★')
    fireEvent.click(stars[3])
    fireEvent.click(screen.getByText('Submit'))
    await waitFor(() => {
      expect(screen.getByText('Feedback submitted on-chain!')).toBeInTheDocument()
    })
  })
})
