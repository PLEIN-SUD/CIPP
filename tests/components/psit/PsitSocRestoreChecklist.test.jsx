import React from 'react'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test-utils'
import { PsitSocRestoreChecklist } from '../../../src/components/psit/soc/PsitSocRestoreChecklist'
import { ApiPostCall } from '../../../src/api/ApiCall'

// Rendering MUI through jsdom on a cold cache runs past Vitest's 5 s default on a laptop, and a
// timeout reads exactly like a broken assertion. Set per file rather than in vitest.config.mjs,
// which is upstream: no divergence, and the value travels with the tests that need it.
vi.setConfig({ testTimeout: 60000 })

vi.mock('../../../src/api/ApiCall', () => ({
  ApiGetCall: vi.fn(() => ({ data: undefined, isFetching: false, isSuccess: false, isError: false })),
  ApiPostCall: vi.fn(() => ({ mutate: vi.fn(), isPending: false, isSuccess: false, isError: false })),
  ApiGetCallWithPagination: vi.fn(() => ({ data: undefined, isFetching: false })),
}))

const remediatedBenignCase = {
  CaseId: 'PSIT-SOC-1',
  Tenant: 'client.test',
  Qualification: { Verdict: 'benign-true-positive', Justification: 'VPN traité' },
  ActionLog: [
    { Action: 'remediate-user', Detail: 'Remédiation CIPP exécutée', Analyst: 'a', Utc: '2026-08-31T10:28:00Z' },
  ],
}

describe('PsitSocRestoreChecklist', () => {
  it('renders nothing on a retained compromise: nothing is given back to an attacker', () => {
    const { container } = renderWithProviders(
      <PsitSocRestoreChecklist
        socCase={{ ...remediatedBenignCase, Qualification: { Verdict: 'true-positive' } }}
        queryKey="k"
      />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('lists what the remediation cut, and says how much is still owed', () => {
    renderWithProviders(<PsitSocRestoreChecklist socCase={remediatedBenignCase} queryKey="k" />)

    expect(screen.getByText(/5 restaurations à faire/)).toBeInTheDocument()
    expect(screen.getByText('Connexion réactivée (compte débloqué)')).toBeInTheDocument()
    expect(screen.getByText('Méthodes MFA ré-enrôlées par le titulaire')).toBeInTheDocument()
  })

  it('journals a restoration with the exact sentence the list will match on re-read', async () => {
    const mutate = vi.fn()
    ApiPostCall.mockReturnValue({ mutate, isPending: false, isSuccess: false, isError: false })

    renderWithProviders(<PsitSocRestoreChecklist socCase={remediatedBenignCase} queryKey="k" />)
    await userEvent.click(screen.getAllByRole('button', { name: 'Journaliser la restauration' })[0])

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/PSITExecSocCase',
        data: expect.objectContaining({
          LogAction: { Action: 'restored', Detail: 'Connexion réactivée (compte débloqué)' },
        }),
      })
    )
  })

  it('says all is given back once the journal holds every restoration', () => {
    const restored = {
      ...remediatedBenignCase,
      ActionLog: [
        ...remediatedBenignCase.ActionLog,
        { Action: 'restored', Detail: 'Connexion réactivée (compte débloqué)' },
        { Action: 'restored', Detail: 'Nouveau mot de passe transmis au titulaire' },
        { Action: 'restored', Detail: 'Méthodes MFA ré-enrôlées par le titulaire' },
        { Action: 'restored', Detail: 'Partage OneDrive rétabli' },
        { Action: 'restored', Detail: 'Règles de boîte légitimes réactivées' },
      ],
    }
    renderWithProviders(<PsitSocRestoreChecklist socCase={restored} queryKey="k" />)

    expect(screen.getByText(/Tout a été rendu au titulaire/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Journaliser la restauration' })).not.toBeInTheDocument()
  })
})
