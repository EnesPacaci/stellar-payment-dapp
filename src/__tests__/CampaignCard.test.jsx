import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import CampaignCard from '../components/CampaignCard'
import useStore from '../store'

describe('CampaignCard', () => {
  const mockCampaigns = [
    { address: 'CBTEST123456789', goal: '1000000000', raised: '500000000', deadline: 1751241600 },
    { address: 'CBTEST987654321', goal: '2000000000', raised: '100000000', deadline: 1751241600 },
  ]

  it('renders empty state when no campaigns', () => {
    render(<CampaignCard campaigns={[]} onSelect={() => {}} />)
    expect(screen.getByText('No campaigns yet.')).toBeInTheDocument()
  })

  it('renders campaign list with goals and raised amounts', () => {
    render(<CampaignCard campaigns={mockCampaigns} onSelect={() => {}} />)
    expect(screen.getByText('50.00')).toBeInTheDocument()
    expect(screen.getByText('100.00')).toBeInTheDocument()
    expect(screen.getByText('200.00')).toBeInTheDocument()
  })

  it('calls onSelect when a campaign is clicked', () => {
    const handleSelect = vi.fn()
    render(<CampaignCard campaigns={mockCampaigns} onSelect={handleSelect} />)
    const cards = screen.getAllByText(/raised/)
    fireEvent.click(cards[0].closest('[class*="cursor-pointer"]'))
    expect(handleSelect).toHaveBeenCalledWith(mockCampaigns[0])
  })

  it('renders compact view for single selected campaign', () => {
    render(<CampaignCard campaigns={[mockCampaigns[0]]} onSelect={() => {}} compact />)
    expect(screen.getByText('50.00')).toBeInTheDocument()
    expect(screen.getByText('100.00')).toBeInTheDocument()
    expect(screen.getByText(/Funded/)).toBeInTheDocument()
  })
})
