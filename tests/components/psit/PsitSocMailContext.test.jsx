import React from 'react'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test-utils'
import { PsitSocMailContext } from '../../../src/components/psit/soc/PsitSocMailContext'
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
  CaseId: 'PSIT-SOC-20260824-EEEE',
  Tenant: 'contoso.test',
  TypeId: 18,
  Entities: {
    networkMessageId: 'b0f2a3c4-1111-2222-3333-444455556666',
    receivedUtc: '2026-08-24T07:00:00Z',
  },
}

describe('PsitSocMailContext', () => {
  beforeEach(() => {
    ApiPostCall.mockImplementation(() => ({ mutate: vi.fn(), isPending: false, isSuccess: false, isError: false }))
  })

  it('asks for a message id when the case carries none', () => {
    renderWithProviders(<PsitSocMailContext socCase={{ ...socCase, Entities: {} }} queryKey="k" />)
    expect(screen.getByText(/ne porte pas d’identifiant de message/)).toBeInTheDocument()
  })

  it('states the Safe Links limit so an empty screen is not read as "nobody clicked"', () => {
    renderWithProviders(<PsitSocMailContext socCase={socCase} queryKey="k" />)
    expect(screen.getByText(/l’absence de clic enregistré ne vaut pas absence de clic/)).toBeInTheDocument()
  })

  it('says on the button that the deletion is reversible', () => {
    renderWithProviders(<PsitSocMailContext socCase={socCase} queryKey="k" />)
    expect(screen.getByRole('button', { name: /réversible/ })).toBeInTheDocument()
  })

  it('purges every copy when no recipient is named, and logs it on the case', async () => {
    const mutate = vi.fn((payload, options) => options?.onSuccess?.())
    ApiPostCall.mockImplementation(() => ({ mutate, isPending: false, isSuccess: false, isError: false }))

    renderWithProviders(<PsitSocMailContext socCase={socCase} queryKey="k" />)
    await userEvent.click(screen.getByRole('button', { name: /réversible/ }))

    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(2))
    const purge = mutate.mock.calls[0][0]
    expect(purge.url).toBe('/api/PSITExecMailRemediate')
    expect(purge.data.NetworkMessageId).toBe('b0f2a3c4-1111-2222-3333-444455556666')
    expect(purge.data.Recipients).toEqual([])
    // The reception time bounds the lookup window server-side.
    expect(purge.data.ReceivedUtc).toBe('2026-08-24T07:00:00Z')
    expect(mutate.mock.calls[1][0].data.LogAction.Action).toBe('mail-soft-delete')
  })

  it('splits a typed recipient list on commas and spaces', async () => {
    const mutate = vi.fn((payload, options) => options?.onSuccess?.())
    ApiPostCall.mockImplementation(() => ({ mutate, isPending: false, isSuccess: false, isError: false }))

    renderWithProviders(<PsitSocMailContext socCase={socCase} queryKey="k" />)
    await userEvent.type(
      screen.getByRole('textbox', { name: /Destinataires/ }),
      'a@contoso.test, b@contoso.test'
    )
    await userEvent.click(screen.getByRole('button', { name: /réversible/ }))

    await waitFor(() => expect(mutate).toHaveBeenCalled())
    expect(mutate.mock.calls[0][0].data.Recipients).toEqual(['a@contoso.test', 'b@contoso.test'])
  })

  const evidence = {
    Message: {
      NetworkMessageId: 'b0f2a3c4-1111-2222-3333-444455556666',
      Subject: 'Votre facture en attente',
      SenderDisplayName: 'Comptabilite',
      SenderFrom: 'billing@sender.test',
      SenderMailFrom: 'bounce@sender.test',
      SenderIp: '203.0.113.9',
      ThreatTypes: ['Phish'],
      DetectionMethods: ['URL malicious reputation'],
      Spf: 'fail',
      Dkim: 'none',
      Dmarc: 'fail',
      Urls: ['https://sender.test/pay'],
    },
    Recipients: [
      { Recipient: 'first@contoso.test', OriginalAction: 'Delivered', OriginalLocation: 'Inbox', LatestLocation: 'Inbox', StillDelivered: true },
      { Recipient: 'second@contoso.test', OriginalAction: 'Delivered', OriginalLocation: 'Inbox', LatestLocation: 'Quarantine', StillDelivered: false },
    ],
    Metadata: { Found: true, RecipientCount: 2, StillDelivered: 1, WindowStart: '2026-08-19T09:00:00Z', WindowEnd: '2026-08-21T09:00:00Z', WindowFromReport: true },
  }

  const wireEvidence = (data, extra = {}) =>
    ApiGetCall.mockImplementation((opts) => {
      const url = String(opts?.url ?? '')
      if (url.includes('PSITListMailEvidence')) {
        return { data, isFetching: false, isFetched: true, isSuccess: true, isError: false, ...extra }
      }
      return { data: undefined, isFetching: false, isFetched: false, isSuccess: false, isError: false }
    })

  it('shows who sent the message and what Defender made of it', () => {
    // The panel used to offer a delete button and no evidence, which asked an analyst to remove a
    // message he could not see.
    wireEvidence(evidence)
    renderWithProviders(<PsitSocMailContext socCase={socCase} queryKey="k" />)

    expect(screen.getByText('Votre facture en attente')).toBeInTheDocument()
    expect(screen.getByText(/billing@sender.test/)).toBeInTheDocument()
    expect(screen.getByText('Phish')).toBeInTheDocument()
    expect(screen.getByText(/SPF fail/)).toBeInTheDocument()
  })

  it('flags an envelope sender that differs from the displayed address', () => {
    wireEvidence(evidence)
    renderWithProviders(<PsitSocMailContext socCase={socCase} queryKey="k" />)

    expect(screen.getByText(/Enveloppe expéditeur différente/)).toBeInTheDocument()
  })

  it('says per recipient where the copy sits, not one verdict for the message', () => {
    // Delivered to one mailbox and quarantined in another is two situations, and only the first
    // is worth purging.
    wireEvidence(evidence)
    renderWithProviders(<PsitSocMailContext socCase={socCase} queryKey="k" />)

    expect(screen.getByText('first@contoso.test')).toBeInTheDocument()
    expect(screen.getByText('second@contoso.test')).toBeInTheDocument()
    expect(screen.getByText('encore lisible')).toBeInTheDocument()
    expect(screen.getByText('hors boîte')).toBeInTheDocument()
  })

  it('names the window and both causes when nothing was found', () => {
    wireEvidence({
      Message: null,
      Recipients: [],
      Metadata: { Found: false, WindowStart: '2026-08-19T09:00:00Z', WindowEnd: '2026-08-21T09:00:00Z', WindowFromReport: true },
    })
    renderWithProviders(<PsitSocMailContext socCase={socCase} queryKey="k" />)

    expect(screen.getByText(/Aucun message analysé trouvé/)).toBeInTheDocument()
    expect(screen.getByText(/licence Defender for Office 365 Plan 2/)).toBeInTheDocument()
  })

  it('shows a failed read as a failure, never as a message nobody received', () => {
    wireEvidence(undefined, { isError: true, isFetched: true, isSuccess: false })
    renderWithProviders(<PsitSocMailContext socCase={socCase} queryKey="k" />)

    expect(screen.getByText(/La lecture du message a échoué/)).toBeInTheDocument()
    expect(screen.queryByText('first@contoso.test')).not.toBeInTheDocument()
  })

  const wireCapability = (state) =>
    ApiGetCall.mockImplementation((opts) => {
      if (String(opts?.url ?? '').includes('PSITListSocCapabilities')) {
        return {
          data: state
            ? { Actions: [{ Action: 'mail-remediate', State: state, SkuName: 'Defender for Office 365 Plan 2' }] }
            : undefined,
          isFetching: false,
          isFetched: true,
          isSuccess: true,
          isError: false,
        }
      }
      return { data: undefined, isFetching: false, isFetched: false, isSuccess: false, isError: false }
    })

  it('replaces the button with where to go when the tenant is not licensed', () => {
    wireCapability('unlicensed')
    renderWithProviders(<PsitSocMailContext socCase={socCase} queryKey="k" />)

    expect(screen.queryByRole('button', { name: /réversible/ })).not.toBeInTheDocument()
    // The replacement says where to go instead, and names the plan that is missing.
    expect(screen.getByText(/Suppression indisponible sur ce tenant/)).toBeInTheDocument()
    expect(screen.getAllByText(/Threat Explorer/).length).toBeGreaterThan(0)
  })

  it('keeps the button when the licence could not be checked, and says so', () => {
    // "We could not check" is not "you cannot": hiding the action would hide one the tenant has.
    wireCapability('unknown')
    renderWithProviders(<PsitSocMailContext socCase={socCase} queryKey="k" />)

    expect(screen.getByRole('button', { name: /réversible/ })).toBeInTheDocument()
    expect(screen.getByText(/n’ont pas pu être vérifiées/)).toBeInTheDocument()
  })

  it('keeps the button while the licence lookup is still in flight', () => {
    wireCapability(null)
    renderWithProviders(<PsitSocMailContext socCase={socCase} queryKey="k" />)

    expect(screen.getByRole('button', { name: /réversible/ })).toBeInTheDocument()
  })
})
