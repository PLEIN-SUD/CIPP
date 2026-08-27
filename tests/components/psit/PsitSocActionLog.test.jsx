import React from 'react'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test-utils'
import { PsitSocActionLog } from '../../../src/components/psit/soc/PsitSocActionLog'
import { ApiPostCall } from '../../../src/api/ApiCall'

// The journal is the case's account of what was done. What is pinned: an action done earlier than
// it is logged carries both instants, and the declared one only travels when the analyst gives it.

vi.setConfig({ testTimeout: 60000 })

vi.mock('../../../src/api/ApiCall', () => ({
  ApiGetCall: vi.fn(() => ({ data: undefined, isFetching: false, isSuccess: false })),
  ApiPostCall: vi.fn(() => ({ mutate: vi.fn(), isPending: false, isSuccess: false, isError: false })),
  ApiGetCallWithPagination: vi.fn(() => ({ data: undefined, isFetching: false })),
}))

const socCase = (log = []) => ({
  CaseId: 'PSIT-SOC-1',
  Tenant: 'contoso.test',
  ActionLog: log,
})

describe('declared action time', () => {
  it('shows both instants when the gesture predates its logging', () => {
    renderWithProviders(
      <PsitSocActionLog
        socCase={socCase([
          { Action: 'mail-client', Detail: 'prévenu', Utc: '2026-08-27T11:40:00Z', OccurredUtc: '2026-08-27T09:12:00Z', Analyst: 'a' },
          { Action: 'status', Detail: 'investigating', Utc: '2026-08-27T08:00:00Z', Analyst: 'a' },
        ])}
        queryKey="k"
      />
    )

    expect(screen.getByText(/fait le 2026-08-27T09:12:00Z • consigné le 2026-08-27T11:40:00Z/)).toBeInTheDocument()
    // An entry without a declared time keeps its single-instant line.
    expect(screen.getByText(/^2026-08-27T08:00:00Z/)).toBeInTheDocument()
  })

  it('sends the declared time only when the analyst filled it', async () => {
    const mutate = vi.fn()
    ApiPostCall.mockImplementation(() => ({ mutate, isPending: false, isSuccess: false, isError: false }))

    renderWithProviders(<PsitSocActionLog socCase={socCase()} queryKey="k" />)
    await userEvent.type(screen.getByLabelText(/Action menée hors de CIPP/), 'mail client')
    await userEvent.click(screen.getByRole('button', { name: /Consigner/ }))

    expect(mutate.mock.calls[0][0].data.LogAction.OccurredUtc).toBeUndefined()

    await userEvent.type(screen.getByLabelText(/Action menée hors de CIPP/), 'mail client')
    await userEvent.type(screen.getByLabelText(/Quand \(optionnel/), '2026-08-27T09:12')
    await userEvent.click(screen.getByRole('button', { name: /Consigner/ }))

    expect(mutate.mock.calls[1][0].data.LogAction.OccurredUtc).toBe('2026-08-27T09:12')
  })
})
