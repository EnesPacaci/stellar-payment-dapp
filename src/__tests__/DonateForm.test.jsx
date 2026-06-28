import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import DonateForm from '../components/DonateForm'
import useStore from '../store'

describe('DonateForm', () => {
  it('shows connect prompt when wallet not connected', () => {
    useStore.setState({ publicKey: null, amount: '', isSending: false })
    render(<DonateForm onDonate={() => {}} />)
    expect(screen.getByText('Connect your wallet to donate.')).toBeInTheDocument()
  })

  it('renders donate form when wallet connected', () => {
    useStore.setState({ publicKey: 'GDGGSUZ42XTYN5MLZGLNNUGO446SVL6XVZQQSPTSCEM2PCHCRZCW3X3C', amount: '', isSending: false })
    render(<DonateForm onDonate={() => {}} />)
    expect(screen.getByText('10 XLM')).toBeInTheDocument()
    expect(screen.getByText('50 XLM')).toBeInTheDocument()
    expect(screen.getByText('100 XLM')).toBeInTheDocument()
    expect(screen.getByText('500 XLM')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Enter amount...')).toBeInTheDocument()
    expect(screen.getByText('Donate XLM')).toBeInTheDocument()
  })

  it('disables button while sending', () => {
    useStore.setState({ publicKey: 'GDGGSUZ42XTYN5MLZGLNNUGO446SVL6XVZQQSPTSCEM2PCHCRZCW3X3C', amount: '10', isSending: true })
    render(<DonateForm onDonate={() => {}} />)
    expect(screen.getByText('Sending...')).toBeDisabled()
  })
})
