import React from 'react'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import { PsitSocAppContext } from '../../../src/components/psit/soc/PsitSocAppContext'
import { ApiGetCall } from '../../../src/api/ApiCall'

vi.setConfig({ testTimeout: 60000 })

vi.mock('../../../src/api/ApiCall', () => ({
  ApiGetCall: vi.fn(() => ({ data: undefined, isFetching: false, isFetched: true, isError: false })),
  ApiPostCall: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  ApiGetCallWithPagination: vi.fn(() => ({ data: undefined, isFetching: false })),
}))

const socCase = {
  CaseId: 'PSIT-SOC-1',
  Tenant: 'client.test',
  Entities: { appId: 'app-guid' },
}

// The defect this pins is not cosmetic. These panels answer "Aucun consentement" once they have
// finished looking; they used to answer it from their first render, so for a second or three an
// analyst was told the application had no access - the opposite of what was about to appear.
describe('a panel that is still reading', () => {
  it('says it is reading, and does not answer the question yet', () => {
    ApiGetCall.mockImplementation(() => ({
      data: undefined,
      isFetching: true,
      isFetched: false,
      isError: false,
    }))

    renderWithProviders(<PsitSocAppContext socCase={socCase} queryKey="k" />)

    expect(screen.getByText(/Lecture de l’application et de ses consentements/)).toBeInTheDocument()
    expect(screen.queryByText(/Aucun consentement/)).not.toBeInTheDocument()
  })

  it('answers once the read has come back, and stops saying it is reading', () => {
    ApiGetCall.mockImplementation(() => ({
      data: { Results: [] },
      isFetching: false,
      isFetched: true,
      isError: false,
    }))

    renderWithProviders(<PsitSocAppContext socCase={socCase} queryKey="k" />)

    expect(screen.queryByText(/Lecture de l’application/)).not.toBeInTheDocument()
  })

  it('keeps showing what it has during a background refresh', () => {
    // isFetching alone would blank a populated panel every time the cache refreshes, which is
    // worse than the problem being fixed.
    ApiGetCall.mockImplementation(() => ({
      data: { Results: [] },
      isFetching: true,
      isFetched: true,
      isError: false,
    }))

    renderWithProviders(<PsitSocAppContext socCase={socCase} queryKey="k" />)

    expect(screen.queryByText(/Lecture de l’application/)).not.toBeInTheDocument()
  })
})
