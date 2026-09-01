import React from 'react'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test-utils'
import {
  PsitSocSourceMailButton,
  PsitSocSourceMailSection,
} from '../../../src/components/psit/soc/PsitSocSourceMail'

vi.setConfig({ testTimeout: 60000 })

// What is pinned here: the mail surfaces only when the ingestion stored one (old dossiers
// render nothing), the body keeps its line breaks, and the header button opens the full text.

const socCase = {
  CaseId: 'PSIT-SOC-1',
  Tenant: 'contoso.test',
  SourceSubject: '[SOC x Client] Impossible travel - p.martin',
  SourceMail: 'Bonjour,\nUne connexion inhabituelle a été détectée.\nCordialement.',
}

describe('PsitSocSourceMailSection', () => {
  it('shows the subject and the body verbatim', () => {
    renderWithProviders(<PsitSocSourceMailSection socCase={socCase} />)

    expect(screen.getByText('Mail d’origine du SOC')).toBeInTheDocument()
    expect(screen.getByText('[SOC x Client] Impossible travel - p.martin')).toBeInTheDocument()
    expect(screen.getByText(/Une connexion inhabituelle/)).toBeInTheDocument()
  })

  it('renders nothing on a dossier from before the fields existed', () => {
    const { container } = renderWithProviders(
      <PsitSocSourceMailSection socCase={{ CaseId: 'X' }} />
    )
    expect(container).toBeEmptyDOMElement()
  })
})

describe('PsitSocSourceMailButton', () => {
  it('opens the full mail on click', async () => {
    renderWithProviders(<PsitSocSourceMailButton socCase={socCase} />)

    await userEvent.click(screen.getByRole('button', { name: 'Mail d’origine' }))

    expect(screen.getByText('Mail d’origine du SOC')).toBeInTheDocument()
    expect(screen.getByText(/Cordialement/)).toBeInTheDocument()
  })

  it('says when only the subject travelled, and hides entirely when nothing did', async () => {
    renderWithProviders(
      <PsitSocSourceMailButton socCase={{ ...socCase, SourceMail: '' }} />
    )
    await userEvent.click(screen.getByRole('button', { name: 'Mail d’origine' }))
    expect(screen.getByText(/Seul le sujet a été transmis/)).toBeInTheDocument()

    const { container } = renderWithProviders(
      <PsitSocSourceMailButton socCase={{ CaseId: 'X' }} />
    )
    expect(container).toBeEmptyDOMElement()
  })
})
