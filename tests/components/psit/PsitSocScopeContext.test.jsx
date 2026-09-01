import React from 'react'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test-utils'
import { PsitSocScopeContext } from '../../../src/components/psit/soc/PsitSocScopeContext'
import { ApiGetCall, ApiPostCall } from '../../../src/api/ApiCall'

vi.setConfig({ testTimeout: 60000 })

vi.mock('../../../src/api/ApiCall', () => ({
  ApiGetCall: vi.fn(() => ({ data: undefined, isFetching: false, isFetched: false, isSuccess: false, isError: false })),
  ApiPostCall: vi.fn(() => ({ mutate: vi.fn(), isPending: false, isSuccess: false, isError: false })),
  ApiGetCallWithPagination: vi.fn(() => ({ data: undefined, isFetching: false })),
}))

// What is pinned here: each block answers its own scope question with the honest absences -
// a device enrolled around the alert is flagged, an admin consent says it covers the tenant,
// and the campaign search is a click, never a mount effect.

const baseCase = {
  CaseId: 'PSIT-SOC-1',
  Tenant: 'contoso.test',
  TypeId: 2,
  CreatedUtc: '2026-09-02T08:00:00Z',
  Entities: { upn: 'p.martin@contoso.test', userId: 'user-guid' },
  Evidence: {},
}

const wire = (handlers) => {
  ApiGetCall.mockImplementation((opts) => {
    const url = opts?.url ?? ''
    for (const [needle, answer] of handlers) {
      if (url.includes(needle)) {
        return { data: answer, isFetching: false, isFetched: true, isSuccess: true, isError: false }
      }
    }
    return { data: undefined, isFetching: false, isFetched: false, isSuccess: false, isError: false }
  })
}

describe('PsitSocScopeContext', () => {
  it('flags a device enrolled around the alert as the persistence question it is', () => {
    wire([
      [
        'registeredDevices',
        {
          Results: [
            { id: 'd1', displayName: 'PC-ANCIEN', operatingSystem: 'Windows', trustType: 'AzureAd', registrationDateTime: '2025-01-10T08:00:00Z' },
            { id: 'd2', displayName: 'IPHONE-NOUVEAU', operatingSystem: 'iOS', trustType: 'Workplace', registrationDateTime: '2026-09-01T22:00:00Z' },
          ],
        },
      ],
    ])

    renderWithProviders(<PsitSocScopeContext socCase={baseCase} evidence={{}} />)

    expect(screen.getByText('Appareils Entra du compte')).toBeInTheDocument()
    expect(screen.getByText('IPHONE-NOUVEAU')).toBeInTheDocument()
    expect(screen.getByText('récent')).toBeInTheDocument()
    // The old device carries no flag.
    expect(screen.getAllByText('récent')).toHaveLength(1)
  })

  it('says the consent reach on an application dossier, admin consent included', () => {
    wire([
      [
        'oauth2PermissionGrants',
        {
          Results: [
            { consentType: 'AllPrincipals', principalId: null },
            { consentType: 'Principal', principalId: 'u1' },
            { consentType: 'Principal', principalId: 'u2' },
          ],
        },
      ],
      [
        "Endpoint=users&",
        { Results: [
          { id: 'u1', userPrincipalName: 'a@contoso.test' },
          { id: 'u2', userPrincipalName: 'b@contoso.test' },
        ] },
      ],
    ])

    renderWithProviders(
      <PsitSocScopeContext
        socCase={{ ...baseCase, TypeId: 6, Entities: { appId: 'app-1' } }}
        evidence={{ app: { principal: { id: 'sp-1' } } }}
      />
    )

    expect(screen.getByText(/consentement administrateur couvre tout le tenant/)).toBeInTheDocument()
    expect(screen.getByText('a@contoso.test')).toBeInTheDocument()
    expect(screen.getByText('b@contoso.test')).toBeInTheDocument()
  })

  it('lists the touched role members and the recorded change actors on a type 4', () => {
    wire([
      [
        'directoryRoles',
        {
          Results: [
            {
              id: 'r1',
              displayName: 'Exchange Administrator',
              members: [
                { id: 'm1', userPrincipalName: 'admin1@contoso.test' },
                { id: 'm2', userPrincipalName: 'admin2@contoso.test' },
              ],
            },
            { id: 'r2', displayName: 'Global Reader', members: [] },
          ],
        },
      ],
    ])

    renderWithProviders(
      <PsitSocScopeContext
        socCase={{
          ...baseCase,
          TypeId: 4,
          Evidence: {
            identity: { activeRoles: ['Exchange Administrator'] },
            audit: { summary: { Actors: [{ Actor: 'acteur@contoso.test', Count: 2 }] } },
          },
        }}
        evidence={{}}
      />
    )

    expect(screen.getByText('Exchange Administrator')).toBeInTheDocument()
    expect(screen.getByText('admin1@contoso.test')).toBeInTheDocument()
    expect(screen.queryByText('Global Reader')).not.toBeInTheDocument()
    expect(screen.getByText('acteur@contoso.test')).toBeInTheDocument()
  })

  it('searches the campaign on click only, and reports the trace', async () => {
    const mutate = vi.fn((payload, options) => options?.onSuccess?.())
    ApiPostCall.mockReturnValue({
      mutate,
      isPending: false,
      isSuccess: true,
      isError: false,
      data: { data: [
        { RecipientAddress: 'x@contoso.test' },
        { RecipientAddress: 'y@contoso.test' },
        { RecipientAddress: 'x@contoso.test' },
      ] },
    })
    wire([
      ['PSITListMailEvidence', { Message: { SenderFromAddress: 'pirate@example.net' } }],
    ])

    renderWithProviders(
      <PsitSocScopeContext
        socCase={{ ...baseCase, TypeId: 18, Entities: { networkMessageId: 'nm-1' } }}
        evidence={{}}
      />
    )

    expect(mutate).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Chercher la campagne' }))

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/ListMessageTrace',
        data: { tenantFilter: 'contoso.test', sender: 'pirate@example.net', days: 2 },
      })
    )
    expect(screen.getByText(/2 destinataire\(s\)/)).toBeInTheDocument()
  })

  it('renders nothing without a dossier', () => {
    const { container } = renderWithProviders(<PsitSocScopeContext socCase={null} evidence={{}} />)
    expect(container).toBeEmptyDOMElement()
  })
})
