import React from 'react'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test-utils'
import { PsitSocUserContext } from '../../../src/components/psit/soc/PsitSocUserContext'
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

const socCase = {
  CaseId: 'PSIT-SOC-20260824-CCCC',
  Tenant: 'contoso.test',
  Entities: { upn: 'a.tkachenko@contoso.test', userId: 'user-guid' },
}

// One Swiss success and one Chinese failed spray, usage location FR: the panel should colour the
// Swiss row as a foreign success and the Chinese one as noise.
const signInLog = [
  {
    ipAddress: '195.65.131.222',
    createdDateTime: '2026-08-24T09:02:00Z',
    status: { errorCode: 0 },
    location: { countryOrRegion: 'CH', city: 'Bretigny' },
    appDisplayName: 'Microsoft Graph',
  },
  {
    ipAddress: '5.5.5.5',
    createdDateTime: '2026-08-24T02:00:00Z',
    status: { errorCode: 50126 },
    location: { countryOrRegion: 'CN' },
  },
]

const wireApi = ({ signins = signInLog, rules = [], user = { id: 'user-guid', usageLocation: 'FR' } } = {}) => {
  ApiGetCall.mockImplementation((opts) => {
    const url = opts?.url ?? ''
    if (url.includes('ListUserSigninLogs')) {
      return { data: signins, isFetching: false, isFetched: true, isSuccess: true, isError: false }
    }
    if (url.includes('ListUserMailboxRules')) {
      return { data: rules, isFetching: false, isFetched: true, isSuccess: true, isError: false }
    }
    if (url.includes('ListUsers')) {
      return { data: [user], isFetching: false, isFetched: true, isSuccess: true, isError: false }
    }
    return { data: undefined, isFetching: false, isFetched: false, isSuccess: false, isError: false }
  })
}

describe('PsitSocUserContext', () => {
  it('asks for a UPN when the case targets no user', () => {
    wireApi()
    renderWithProviders(<PsitSocUserContext socCase={{ ...socCase, Entities: {} }} queryKey="k" />)

    expect(screen.getByText(/ne cible pas d’utilisateur/)).toBeInTheDocument()
  })

  it('groups the sign-ins by address and colours the foreign success', () => {
    wireApi()
    renderWithProviders(<PsitSocUserContext socCase={socCase} queryKey="k" />)

    expect(screen.getByText('195.65.131.222')).toBeInTheDocument()
    // The Swiss success against a FR usage location reads as a compromise clue.
    expect(screen.getByText('succès hors zone')).toBeInTheDocument()
    // The Chinese failed attempts are grouped too, as noise.
    expect(screen.getByText('5.5.5.5')).toBeInTheDocument()
  })

  it('lists an exfiltrating inbox rule with its effect', () => {
    wireApi({ rules: [{ Name: 'copie', ForwardTo: 'attacker@evil.test' }] })
    renderWithProviders(<PsitSocUserContext socCase={socCase} queryKey="k" />)

    expect(screen.getByText(/copie — transfère vers l’extérieur/)).toBeInTheDocument()
  })

  it('runs a graduated action, then logs it on the case', async () => {
    wireApi()
    const mutate = vi.fn((payload, options) => options?.onSuccess?.())
    ApiPostCall.mockImplementation(() => ({ mutate, isPending: false, isSuccess: false, isError: false }))

    renderWithProviders(<PsitSocUserContext socCase={socCase} queryKey="k" />)
    await userEvent.click(screen.getByRole('button', { name: 'Révoquer les sessions' }))

    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(2))
    // First the tenant action...
    const tenantCall = mutate.mock.calls[0][0]
    expect(tenantCall.url).toBe('/api/ExecRevokeSessions')
    expect(tenantCall.data.id).toBe('user-guid')
    expect(tenantCall.data.tenantFilter).toBe('contoso.test')
    // ...then the case log entry, so the case tells the whole story.
    const logCall = mutate.mock.calls[1][0]
    expect(logCall.url).toBe('/api/PSITExecSocCase')
    expect(logCall.data.LogAction.Action).toBe('revoke-sessions')
  })
})
