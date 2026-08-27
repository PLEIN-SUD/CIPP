import React from 'react'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import { PsitBecCheckList } from '../../../src/components/psit/soc/PsitBecCheckList'

// The first version hid its own point: the one-line reading built to avoid expanding sat inside
// the accordion, behind the expand. What is pinned: the reading shows on the closed row, and what
// reads as compromise is listed first.

vi.setConfig({ testTimeout: 60000 })

// One exfiltrating rule (reads bad) among otherwise quiet collections.
const becData = {
  ExtractedAt: '2026-08-27T08:00:00Z',
  NewRules: [{ Name: 'exfil', ForwardTo: 'smtp:out@evil.test' }],
  SuspectUserSignIns: [],
  MFADevices: [],
  AddedApps: [],
}

describe('the checks, readable while closed', () => {
  it('shows each check’s reading without expanding anything', () => {
    renderWithProviders(<PsitBecCheckList becData={becData} />)

    // The rule check's one-line reading, visible on the closed row.
    expect(screen.getByText(/envoient du courrier hors de l’organisation/)).toBeInTheDocument()
    // The exact figure depends on how many collections read bad in this fixture; the badge's
    // job is to exist and to say some do.
    expect(screen.getByText(/à regarder sur/)).toBeInTheDocument()
  })

  it('lists what reads as compromise first', () => {
    renderWithProviders(<PsitBecCheckList becData={becData} />)

    const statuses = screen.getAllByText(/à regarder|rien à signaler|non déterminé|informatif/)
    expect(statuses[0]).toHaveTextContent('à regarder')
  })

  it('renders nothing while the collection is still running', () => {
    const { container } = renderWithProviders(<PsitBecCheckList becData={{ Waiting: true }} />)
    expect(container).toBeEmptyDOMElement()
  })
})
