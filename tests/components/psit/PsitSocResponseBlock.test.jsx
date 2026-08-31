import React from 'react'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test-utils'
import { PsitSocResponseBlock } from '../../../src/components/psit/soc/PsitSocResponseBlock'

// Rendering MUI through jsdom on a cold cache runs past Vitest's 5 s default on a laptop, and a
// timeout reads exactly like a broken assertion. Set per file rather than in vitest.config.mjs,
// which is upstream: no divergence, and the value travels with the tests that need it.
vi.setConfig({ testTimeout: 60000 })

const benignCase = {
  CaseId: 'PSIT-SOC-1',
  Tenant: 'client.test',
  TypeId: 2,
  TicketRef: 'T20260831.0012',
  Qualification: { Verdict: 'benign-true-positive', Justification: 'VPN du titulaire, traité' },
}

describe('PsitSocResponseBlock', () => {
  it('drafts the treated-benign reply by default: keep the detection', async () => {
    renderWithProviders(<PsitSocResponseBlock socCase={benignCase} />)
    await userEvent.click(screen.getByRole('button', { name: /Réponse SOC externe/ }))

    const draft = screen.getByRole('textbox', { name: '' })
    expect(draft.value).toMatch(/continuer à signaler ce motif/)
    expect(draft.value).toMatch(/PSIT-SOC-1/)
  })

  it('offers the inquiry alone while the dossier is not qualified', async () => {
    renderWithProviders(
      <PsitSocResponseBlock socCase={{ ...benignCase, Qualification: null }} />
    )
    await userEvent.click(screen.getByRole('button', { name: /Réponse SOC externe/ }))

    // No verdict, no answer to send: the block opens straight on the request for details.
    const draft = screen.getByRole('textbox', { name: '' })
    expect(draft.value).toMatch(/précisions suivantes/)
  })

  it('renders nothing outside a dossier', () => {
    const { container } = renderWithProviders(<PsitSocResponseBlock socCase={{}} />)
    expect(container).toBeEmptyDOMElement()
  })
})
