import React from 'react'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test-utils'
import { PsitBecTriagePanel } from '../../../src/components/psit/PsitBecTriagePanel'
import { ApiGetCall, ApiPostCall } from '../../../src/api/ApiCall'

// Rendering MUI through jsdom on a cold cache runs past Vitest's 5 s default on a laptop, and a
// timeout reads exactly like a broken assertion. Set per file rather than in vitest.config.mjs,
// which is upstream: no divergence, and the value travels with the tests that need it.
vi.setConfig({ testTimeout: 60000 })


vi.mock('../../../src/api/ApiCall', () => ({
  ApiGetCall: vi.fn(() => ({
    data: undefined,
    isFetching: false,
    isSuccess: false,
    isError: false,
  })),
  ApiPostCall: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
  })),
  ApiGetCallWithPagination: vi.fn(() => ({ data: undefined, isFetching: false })),
}))

const userData = { id: 'user-guid', userPrincipalName: 'p.martin@contoso.test' }

const becData = {
  ExtractedAt: '2026-08-20T10:32:00Z',
  NewRules: [{ Name: 'classement', MoveToFolder: 'DOSSIERS' }],
  SuspectUserSignIns: [
    {
      CreatedDateTime: '2026-08-20T06:49:00Z',
      IPAddress: '203.0.113.42',
      Country: 'IT',
      City: 'Vérone',
      Status: 'Success',
      AppDisplayName: 'Microsoft Graph',
      ForeignLocation: true,
    },
    {
      CreatedDateTime: '2026-08-17T02:00:00Z',
      IPAddress: '203.0.113.7',
      Country: 'CN',
      Status: 'Failed',
      ForeignLocation: true,
    },
  ],
  ChangedPasswords: [{ userPrincipalName: 'other@contoso.test', IsSuspectUser: false }],
  LocationAnalysis: { UsageLocation: 'FR' },
}

describe('PsitBecTriagePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ApiGetCall.mockImplementation(() => ({
      data: undefined,
      isFetching: false,
      isSuccess: false,
      isError: false,
    }))
  })

  it('shows no level and lists the open question while nothing is determined', () => {
    renderWithProviders(
      <PsitBecTriagePanel userData={userData} becData={becData} tenantFilter="contoso.test" />
    )

    expect(screen.getByText('À qualifier')).toBeInTheDocument()
    expect(
      screen.getByText(/1 connexion réussie depuis 203\.0\.113\.42/)
    ).toBeInTheDocument()
    expect(screen.getByText(/derrière un VPN ou un roaming/)).toBeInTheDocument()
    // The spray attempts are present but filed as noise, not as a question.
    expect(screen.getByText(/Écarté du verdict/)).toBeInTheDocument()
  })

  it('offers the three answers and only enables saving once one is picked', async () => {
    renderWithProviders(
      <PsitBecTriagePanel userData={userData} becData={becData} tenantFilter="contoso.test" />
    )

    const save = screen.getByRole('button', { name: /Enregistrer/ })
    expect(save).toBeDisabled()

    await userEvent.click(screen.getAllByRole('button', { name: 'Attendu' })[0])
    expect(screen.getByRole('button', { name: /Enregistrer/ })).toBeEnabled()
  })

  it('posts the determination with the signal id and the justification', async () => {
    const mutate = vi.fn()
    ApiPostCall.mockImplementation(() => ({
      mutate,
      isPending: false,
      isSuccess: false,
      isError: false,
    }))

    renderWithProviders(
      <PsitBecTriagePanel userData={userData} becData={becData} tenantFilter="contoso.test" />
    )

    await userEvent.click(screen.getAllByRole('button', { name: 'Inattendu' })[0])
    await userEvent.type(
      screen.getAllByLabelText(/Justification/)[0],
      'Utilisateur en France, confirmé par téléphone'
    )
    await userEvent.click(screen.getByRole('button', { name: /Enregistrer/ }))

    expect(mutate).toHaveBeenCalledTimes(1)
    const payload = mutate.mock.calls[0][0]
    expect(payload.url).toBe('/api/PSITExecBecTriage')
    expect(payload.data.userId).toBe('user-guid')
    expect(payload.data.determinations[0]).toMatchObject({
      Verdict: 'unexpected',
      Justification: 'Utilisateur en France, confirmé par téléphone',
    })
    expect(payload.data.determinations[0].SignalId).toMatch(/^(signin-ip:|rule-filing:)/)
  })

  it('shows who decided and when for an answered signal', () => {
    ApiGetCall.mockImplementation(() => ({
      data: {
        Determinations: [
          {
            SignalId: 'signin-ip:203.0.113.42',
            Verdict: 'expected',
            Analyst: 's.miro@pleinsudit.com',
            DecidedUtc: '2026-08-20T12:00:00Z',
            Justification: 'Déplacement client confirmé',
          },
        ],
      },
      isFetching: false,
      isSuccess: true,
      isError: false,
    }))

    renderWithProviders(
      <PsitBecTriagePanel userData={userData} becData={becData} tenantFilter="contoso.test" />
    )

    expect(
      screen.getByText(/Attendu, s\.miro@pleinsudit\.com le 2026-08-20 12:00 UTC/)
    ).toBeInTheDocument()
  })

  it('renders nothing while the collection is still running', () => {
    const { container } = renderWithProviders(
      <PsitBecTriagePanel
        userData={userData}
        becData={{ Waiting: true }}
        tenantFilter="contoso.test"
      />
    )
    expect(container).toBeEmptyDOMElement()
  })
})
