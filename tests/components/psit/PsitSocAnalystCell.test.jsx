import React from 'react'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import { PsitSocAnalystCell } from '../../../src/components/psit/PsitSocAnalystCell'
import { ApiGetCall } from '../../../src/api/ApiCall'

vi.setConfig({ testTimeout: 60000 })

vi.mock('../../../src/api/ApiCall', () => ({
  ApiGetCall: vi.fn(() => ({ data: undefined, isFetching: false, isError: false })),
}))

// The queue's analyst cell: photo and name instead of a bare email. What is pinned is the
// fallback chain - name over email, email when no name is known, initial when no photo answers -
// because a cell that goes blank on a missing photo reads as "unassigned", which is a lie.
describe('PsitSocAnalystCell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ApiGetCall.mockImplementation(() => ({ data: undefined, isFetching: false, isError: false }))
  })

  it('shows the display name with the email one hover away', () => {
    renderWithProviders(
      <PsitSocAnalystCell upn="analyste@partner.test" displayName="Alice Analyste" />
    )
    expect(screen.getByText('Alice Analyste')).toBeInTheDocument()
    expect(screen.getByTitle('analyste@partner.test')).toBeInTheDocument()
  })

  it('falls back to the email when no name is known', () => {
    renderWithProviders(<PsitSocAnalystCell upn="analyste@partner.test" />)
    expect(screen.getByText('analyste@partner.test')).toBeInTheDocument()
  })

  it('shows the initial while no photo answers', () => {
    renderWithProviders(
      <PsitSocAnalystCell upn="analyste@partner.test" displayName="Alice Analyste" />
    )
    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('asks for the photo through the same query key as the top banner', () => {
    renderWithProviders(
      <PsitSocAnalystCell upn="analyste@partner.test" displayName="Alice Analyste" />
    )
    expect(ApiGetCall).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/ListUserPhoto',
        queryKey: 'userPhoto-analyste@partner.test',
      })
    )
  })

  it('renders nothing for an unassigned case', () => {
    const { container } = renderWithProviders(<PsitSocAnalystCell upn="" />)
    expect(container).toBeEmptyDOMElement()
  })
})
