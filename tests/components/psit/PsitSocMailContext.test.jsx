import React from 'react'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test-utils'
import { PsitSocMailContext } from '../../../src/components/psit/soc/PsitSocMailContext'
import { ApiPostCall } from '../../../src/api/ApiCall'

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
})
