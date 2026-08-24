import React from 'react'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test-utils'
import { PsitSocAppContext } from '../../../src/components/psit/soc/PsitSocAppContext'
import { ApiGetCall, ApiPostCall } from '../../../src/api/ApiCall'

// Rendering MUI through jsdom on a cold cache runs past Vitest's 5 s default on a laptop, and a
// timeout reads exactly like a broken assertion. Set per file rather than in vitest.config.mjs,
// which is upstream: no divergence, and the value travels with the tests that need it.
vi.setConfig({ testTimeout: 60000 })

vi.mock('../../../src/api/ApiCall', () => ({
  ApiGetCall: vi.fn(() => ({ data: undefined, isFetching: false, isFetched: false, isSuccess: false, isError: false })),
  ApiPostCall: vi.fn(() => ({ mutate: vi.fn(), isPending: false, isSuccess: false, isError: false })),
  ApiGetCallWithPagination: vi.fn(() => ({ data: undefined, isFetching: false })),
}))

const appId = 'ff8d92dc-3d82-41d6-bcbd-b9174d163620'
const socCase = {
  CaseId: 'PSIT-SOC-20260824-FFFF',
  Tenant: 'contoso.test',
  TypeId: 6,
  Entities: { appId },
}

const wireApi = ({
  grants = [{ ApplicationID: appId, ObjectID: 'sp-object-id', Scope: 'Mail.ReadWrite,offline_access' }],
  principal = { id: 'sp-object-id', appId, displayName: 'Suspicious Mail App', createdDateTime: '2026-08-19T05:20:47Z' },
} = {}) => {
  ApiGetCall.mockImplementation((opts) => {
    const url = opts?.url ?? ''
    if (url.includes('ListOAuthApps')) {
      return { data: grants, isFetching: false, isFetched: true, isSuccess: true, isError: false }
    }
    if (url.includes('ListGraphRequest')) {
      return {
        data: principal ? { Results: [principal] } : { Results: [] },
        isFetching: false,
        isFetched: true,
        isSuccess: true,
        isError: false,
      }
    }
    return { data: undefined, isFetching: false, isFetched: false, isSuccess: false, isError: false }
  })
}

describe('PsitSocAppContext', () => {
  it('asks for an appId when the case targets no application', () => {
    wireApi()
    renderWithProviders(<PsitSocAppContext socCase={{ ...socCase, Entities: {} }} queryKey="k" />)
    expect(screen.getByText(/ne cible pas d’application/)).toBeInTheDocument()
  })

  it('reads the grant: risky scopes flagged, refresh token called out, publisher unverified', () => {
    wireApi()
    renderWithProviders(<PsitSocAppContext socCase={socCase} queryKey="k" />)

    expect(screen.getByText(/Mail.ReadWrite — accès en écriture ou envoi/)).toBeInTheDocument()
    expect(screen.getByText('jeton de rafraîchissement')).toBeInTheDocument()
    expect(screen.getByText('éditeur non vérifié')).toBeInTheDocument()
  })

  it('shows a verified publisher and a read-only grant as what they are', () => {
    wireApi({
      grants: [{ ApplicationID: appId, ObjectID: 'sp-object-id', Scope: 'User.Read' }],
      principal: {
        id: 'sp-object-id',
        appId,
        displayName: 'Business App',
        verifiedPublisher: { displayName: 'Contoso Ltd' },
      },
    })
    renderWithProviders(<PsitSocAppContext socCase={socCase} queryKey="k" />)

    expect(screen.getByText(/éditeur vérifié : Contoso Ltd/)).toBeInTheDocument()
    expect(screen.getByText('lecture seule')).toBeInTheDocument()
  })

  it('never presents an unreadable grant as harmless', () => {
    wireApi({ grants: [] })
    renderWithProviders(<PsitSocAppContext socCase={socCase} queryKey="k" />)

    expect(screen.queryByText('lecture seule')).not.toBeInTheDocument()
    expect(screen.getByText(/ne veut pas dire que l’application n’a aucun droit/)).toBeInTheDocument()
  })

  it('revokes the consent, then logs it on the case', async () => {
    wireApi()
    const mutate = vi.fn((payload, options) => options?.onSuccess?.())
    ApiPostCall.mockImplementation(() => ({ mutate, isPending: false, isSuccess: false, isError: false }))

    renderWithProviders(<PsitSocAppContext socCase={socCase} queryKey="k" />)
    await userEvent.click(screen.getByRole('button', { name: 'Révoquer le consentement' }))

    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(2))
    const revoke = mutate.mock.calls[0][0]
    expect(revoke.url).toBe('/api/PSITExecRevokeAppConsent')
    expect(revoke.data.AppId).toBe(appId)
    expect(revoke.data.ServicePrincipalId).toBe('sp-object-id')
    expect(mutate.mock.calls[1][0].data.LogAction.Action).toBe('revoke-app-consent')
  })

  it('states that the application survives the revocation, disabled', () => {
    wireApi()
    renderWithProviders(<PsitSocAppContext socCase={socCase} queryKey="k" />)
    expect(screen.getByText(/L’application n’est pas\s+supprimée/)).toBeInTheDocument()
  })
})
