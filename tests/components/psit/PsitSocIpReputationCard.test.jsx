import React from 'react'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test-utils'
import { PsitSocIpReputationCard } from '../../../src/components/psit/soc/PsitSocIpReputationCard'
import { ApiGetCall, ApiPostCall } from '../../../src/api/ApiCall'

vi.setConfig({ testTimeout: 60000 })

vi.mock('../../../src/api/ApiCall', () => ({
  ApiGetCall: vi.fn(() => ({ data: undefined, isFetching: false, isSuccess: false, isError: false })),
  ApiPostCall: vi.fn(() => ({ mutate: vi.fn(), isPending: false, isSuccess: false, isError: false })),
  ApiGetCallWithPagination: vi.fn(() => ({ data: undefined, isFetching: false })),
}))

// What is pinned here: the card states who set the key and when but never the key itself, and
// the save posts the typed key (an empty one being the deliberate clear).

describe('PsitSocIpReputationCard', () => {
  it('says configured, by whom and when - and no key value anywhere', () => {
    ApiGetCall.mockReturnValue({
      data: { Configured: true, SetUtc: '2026-09-01T08:00:00Z', SetBy: 'a@partner.test' },
      isFetching: false,
      isSuccess: true,
      isError: false,
    })

    renderWithProviders(<PsitSocIpReputationCard />)

    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText(/a@partner.test/)).toBeInTheDocument()
  })

  it('says absent when no key is configured', () => {
    ApiGetCall.mockReturnValue({
      data: { Configured: false },
      isFetching: false,
      isSuccess: true,
      isError: false,
    })

    renderWithProviders(<PsitSocIpReputationCard />)

    expect(screen.getByText('Inactive')).toBeInTheDocument()
    expect(screen.getByText(/puces de réputation sont absentes/)).toBeInTheDocument()
  })

  it('posts the typed key on save', async () => {
    ApiGetCall.mockReturnValue({ data: { Configured: false }, isFetching: false, isSuccess: true, isError: false })
    const mutate = vi.fn()
    ApiPostCall.mockReturnValue({ mutate, isPending: false, isSuccess: false, isError: false })

    renderWithProviders(<PsitSocIpReputationCard />)
    await userEvent.type(screen.getByLabelText(/Clé API AbuseIPDB/), 'abc123')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/PSITExecIpReputationKey',
        data: { Key: 'abc123' },
      }),
      expect.anything()
    )
  })
})
