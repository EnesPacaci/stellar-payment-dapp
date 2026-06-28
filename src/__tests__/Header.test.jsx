import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import Header from '../components/Header'
import useStore from '../store'

describe('Header', () => {
  it('renders connect button when not connected', () => {
    useStore.setState({ publicKey: null, balance: null, walletName: '' })
    render(<Header onConnect={() => {}} onDisconnect={() => {}} />)
    expect(screen.getByText('Connect Wallet')).toBeInTheDocument()
    expect(screen.getByText('Stellar Crowdfund')).toBeInTheDocument()
  })

  it('renders wallet info when connected', () => {
    useStore.setState({
      publicKey: 'GDGGSUZ42XTYN5MLZGLNNUGO446SVL6XVZQQSPTSCEM2PCHCRZCW3X3C',
      balance: '100.0000000',
      walletName: 'Freighter',
    })
    render(<Header onConnect={() => {}} onDisconnect={() => {}} />)
    expect(screen.getByText('Disconnect')).toBeInTheDocument()
    expect(screen.getByText(/Balance:/)).toBeInTheDocument()
    expect(screen.getByText('Freighter')).toBeInTheDocument()
  })
})
