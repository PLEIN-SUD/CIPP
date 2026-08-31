import React from 'react'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test-utils'
import { PsitSocHoldControls } from '../../../src/components/psit/soc/PsitSocHoldControls'
import { ApiGetCall, ApiPostCall } from '../../../src/api/ApiCall'

// Rendering MUI through jsdom on a cold cache runs past Vitest's 5 s default on a laptop, and a
// timeout reads exactly like a broken assertion. Set per file rather than in vitest.config.mjs,
// which is upstream: no divergence, and the value travels with the tests that need it.
vi.setConfig({ testTimeout: 60000 })

vi.mock('../../../src/api/ApiCall', () => ({
  ApiGetCall: vi.fn(() => ({ data: undefined, isFetching: false, isSuccess: false, isError: false })),
  ApiPostCall: vi.fn(() => ({ mutate: vi.fn(), isPending: false, isSuccess: false, isError: false })),
  ApiGetCallWithPagination: vi.fn(() => ({ data: undefined, isFetching: false })),
}))

const socCase = {
  CaseId: 'PSIT-SOC-1',
  Tenant: 'client.test',
  Status: 'investigating',
}

const wireAnalysts = () => {
  ApiGetCall.mockImplementation((opts) => {
    if (String(opts?.url ?? '').includes('PSITListSocAnalysts')) {
      return {
        data: { Analysts: [{ displayName: 'Senior', userPrincipalName: 'senior@partner.test' }], Warnings: [], Notes: [] },
        isFetching: false,
        isSuccess: true,
        isError: false,
      }
    }
    return { data: undefined, isFetching: false, isSuccess: false, isError: false }
  })
}

describe('PsitSocHoldControls', () => {
  it('puts the dossier on hold with a mandatory reason, journaled', async () => {
    wireAnalysts()
    const mutate = vi.fn()
    ApiPostCall.mockReturnValue({ mutate, isPending: false, isSuccess: false, isError: false })

    renderWithProviders(<PsitSocHoldControls socCase={socCase} queryKey="k" />)
    await userEvent.click(screen.getByRole('button', { name: /Mettre en attente/ }))
    const dialogButton = screen.getAllByRole('button', { name: 'Mettre en attente' }).pop()
    expect(dialogButton).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/Ce qu'on attend/), 'liste des adresses source (extsoc)')
    await userEvent.click(screen.getAllByRole('button', { name: 'Mettre en attente' }).pop())

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          Status: 'on-hold',
          LogAction: expect.objectContaining({ Action: 'on-hold' }),
        }),
      })
    )
  })

  it('offers Reprendre on a held dossier, journaled as resumed', async () => {
    wireAnalysts()
    const mutate = vi.fn()
    ApiPostCall.mockReturnValue({ mutate, isPending: false, isSuccess: false, isError: false })

    renderWithProviders(<PsitSocHoldControls socCase={{ ...socCase, Status: 'on-hold' }} queryKey="k" />)
    await userEvent.click(screen.getByRole('button', { name: /Reprendre/ }))

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          Status: 'investigating',
          LogAction: expect.objectContaining({ Action: 'resumed' }),
        }),
      })
    )
  })

  it('escalates through the dedicated endpoint, recipient and reason both required', async () => {
    wireAnalysts()
    const mutate = vi.fn()
    ApiPostCall.mockReturnValue({ mutate, isPending: false, isSuccess: false, isError: false })

    renderWithProviders(<PsitSocHoldControls socCase={socCase} queryKey="k" />)
    await userEvent.click(screen.getByRole('button', { name: /Escalader/ }))
    const confirm = screen.getAllByRole('button', { name: 'Escalader' }).pop()
    expect(confirm).toBeDisabled()

    await userEvent.click(screen.getByLabelText('Escalader à'))
    await userEvent.click(screen.getByRole('option', { name: /Senior/ }))
    await userEvent.type(screen.getByLabelText(/Motif/), 'second regard demandé')
    await userEvent.click(screen.getAllByRole('button', { name: 'Escalader' }).pop())

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/PSITExecSocEscalate',
        data: expect.objectContaining({
          EscalateTo: 'senior@partner.test',
          Reason: 'second regard demandé',
        }),
      })
    )
  })

  it('renders nothing on a closed dossier', () => {
    wireAnalysts()
    const { container } = renderWithProviders(
      <PsitSocHoldControls socCase={{ ...socCase, Status: 'closed' }} queryKey="k" />
    )
    expect(container).toBeEmptyDOMElement()
  })
})
