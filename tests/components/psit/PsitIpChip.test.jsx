import React from 'react'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import { PsitIpChip } from '../../../src/components/psit/soc/PsitIpChip'
import { psitPublicIps } from '../../../src/hooks/use-psit-ip-reputation'

vi.setConfig({ testTimeout: 60000 })

// What is pinned here: the chip only exists when a reputation is known (absence is never a
// score of zero), the score drives the colour, and the private ranges never leave the browser.

describe('PsitIpChip', () => {
  const reputation = {
    Score: 87,
    Reports: 23,
    Country: 'RU',
    Isp: 'Example Hosting',
    UsageType: 'Data Center/Web Hosting/Transit',
    IsTor: false,
    CheckedUtc: '2026-09-02T08:00:00Z',
    Stale: false,
  }

  it('renders nothing while the reputation is unknown', () => {
    const { container } = renderWithProviders(<PsitIpChip ip="203.0.113.9" reputation={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('wears the score, coloured by severity', () => {
    renderWithProviders(<PsitIpChip ip="203.0.113.9" reputation={reputation} />)
    const chip = screen.getByText('87')
    expect(chip).toBeInTheDocument()
    expect(chip.closest('.MuiChip-root').className).toMatch(/colorError/)
  })

  it('says Tor on the label when the address is an exit node', () => {
    renderWithProviders(
      <PsitIpChip ip="203.0.113.9" reputation={{ ...reputation, Score: 30, IsTor: true }} />
    )
    expect(screen.getByText('30 · Tor')).toBeInTheDocument()
  })

  it('shows a zero as an outlined chip: checked and clean is an answer', () => {
    renderWithProviders(
      <PsitIpChip ip="203.0.113.9" reputation={{ ...reputation, Score: 0, Reports: 0 }} />
    )
    const chip = screen.getByText('0')
    expect(chip.closest('.MuiChip-root').className).toMatch(/outlined/i)
  })
})

describe('psitPublicIps', () => {
  it('keeps public addresses only, unique, sorted, capped at twenty', () => {
    const ips = psitPublicIps([
      '203.0.113.9',
      '203.0.113.9',
      '10.0.0.4',
      '192.168.1.1',
      '172.20.0.1',
      '127.0.0.1',
      'fe80::1',
      '',
      null,
      '198.51.100.4',
    ])
    expect(ips).toEqual(['198.51.100.4', '203.0.113.9'])

    const many = psitPublicIps(Array.from({ length: 30 }, (_, i) => `203.0.113.${i + 1}`))
    expect(many).toHaveLength(20)
  })
})
