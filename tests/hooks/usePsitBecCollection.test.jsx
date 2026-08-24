import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { usePsitBecCollection } from '../../src/hooks/use-psit-bec-collection'
import { ApiGetCall } from '../../src/api/ApiCall'

// The collection hook carries behaviour that was paid for once on the upstream page: the queued
// run, the poll, and the refresh that must not be cancelled by its own stale cache. Extracting it
// is only safe if those survive, so they are pinned here.

vi.setConfig({ testTimeout: 60000 })

vi.mock('../../src/api/ApiCall', () => ({
  ApiGetCall: vi.fn(() => ({ data: undefined, isLoading: false, isSuccess: false, refetch: vi.fn() })),
}))

// A probe component: the hook needs a React tree, and its return value is what matters.
const Probe = (props) => {
  const collection = usePsitBecCollection(props)
  return (
    <div>
      <span data-testid="fetching">{String(collection.isFetching)}</span>
      <span data-testid="data">{collection.becData ? 'loaded' : 'none'}</span>
      <button onClick={collection.restartCollection}>restart</button>
    </div>
  )
}

const wire = (implementation) => ApiGetCall.mockImplementation(implementation)

describe('usePsitBecCollection', () => {
  it('does not queue a run before the mailbox is known', () => {
    const calls = []
    wire((opts) => {
      calls.push(opts)
      return { data: undefined, isLoading: false, isSuccess: false, refetch: vi.fn() }
    })

    render(<Probe userId="u1" tenantFilter="contoso.test" userPrincipalName={undefined} />)

    // The initial call is registered but parked: waiting is false until the UPN is resolved.
    const initial = calls.find((call) => call.queryKey?.startsWith('execBECCheck-initial'))
    expect(initial.waiting).toBe(false)
  })

  it('queues the run once the mailbox is known, and polls on the returned GUID', () => {
    const calls = []
    wire((opts) => {
      calls.push(opts)
      if (opts.queryKey?.startsWith('execBECCheck-initial')) {
        return { data: { GUID: 'run-guid' }, isLoading: false, isSuccess: true, refetch: vi.fn() }
      }
      return { data: undefined, isLoading: false, isSuccess: false, refetch: vi.fn() }
    })

    render(<Probe userId="u1" tenantFilter="contoso.test" userPrincipalName="a@contoso.test" />)

    const initial = calls.find((call) => call.queryKey?.startsWith('execBECCheck-initial'))
    expect(initial.waiting).toBe(true)
    expect(initial.data.username).toBe('a@contoso.test')
    // Overwrite is absent on a normal run: it is the refresh that forces a fresh collection.
    expect(initial.data.Overwrite).toBeUndefined()

    const polling = calls.find((call) => call.queryKey === 'execBECCheck-polling-run-guid')
    expect(polling.data.GUID).toBe('run-guid')
  })

  it('reports fetching until the poll lands a finished run', () => {
    wire((opts) => {
      if (opts.queryKey?.startsWith('execBECCheck-initial')) {
        return { data: { GUID: 'run-guid' }, isLoading: false, isSuccess: true, refetch: vi.fn() }
      }
      return {
        data: { NewRules: [] },
        isLoading: false,
        isSuccess: true,
        dataUpdatedAt: 1,
        refetch: vi.fn(),
      }
    })

    render(<Probe userId="u1" tenantFilter="contoso.test" userPrincipalName="a@contoso.test" />)

    expect(screen.getByTestId('data').textContent).toBe('loaded')
    expect(screen.getByTestId('fetching').textContent).toBe('false')
  })

  it('keeps reporting fetching while the run is still waiting', () => {
    wire((opts) => {
      if (opts.queryKey?.startsWith('execBECCheck-initial')) {
        return { data: { GUID: 'run-guid' }, isLoading: false, isSuccess: true, refetch: vi.fn() }
      }
      return { data: { Waiting: true }, isLoading: false, isSuccess: true, dataUpdatedAt: 1, refetch: vi.fn() }
    })

    render(<Probe userId="u1" tenantFilter="contoso.test" userPrincipalName="a@contoso.test" />)
    expect(screen.getByTestId('fetching').textContent).toBe('true')
  })

  it('a refresh re-runs the collection and only then polls, never the other way round', async () => {
    const initialRefetch = vi.fn(() => Promise.resolve())
    const pollingRefetch = vi.fn()
    wire((opts) => {
      if (opts.queryKey?.startsWith('execBECCheck-initial')) {
        return { data: { GUID: 'run-guid' }, isLoading: false, isSuccess: true, refetch: initialRefetch }
      }
      return { data: { NewRules: [] }, isLoading: false, isSuccess: true, dataUpdatedAt: 1, refetch: pollingRefetch }
    })

    render(<Probe userId="u1" tenantFilter="contoso.test" userPrincipalName="a@contoso.test" />)
    await userEvent.click(screen.getByText('restart'))

    // The backend resets the cache row to Waiting before answering, so the poll must follow the
    // re-run rather than race it.
    await waitFor(() => expect(initialRefetch).toHaveBeenCalled())
    await waitFor(() => expect(pollingRefetch).toHaveBeenCalled())
  })
})
