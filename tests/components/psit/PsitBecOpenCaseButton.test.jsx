import React from 'react'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test-utils'
import { PsitBecOpenCaseButton } from '../../../src/components/psit/soc/PsitBecOpenCaseButton'
import { ApiPostCall } from '../../../src/api/ApiCall'

// No case demanded at the door, no retained compromise without a case at the exit. What is pinned
// here is the gap the button covers - caseless investigation, compromised verdict - and nothing
// else: a clean mailbox or an investigation already attached to a case must not grow the button.

vi.setConfig({ testTimeout: 60000 })

const replace = vi.fn()
vi.mock('next/router', () => ({
  useRouter: () => ({ query: {}, pathname: '/security/soc/bec', replace }),
}))

vi.mock('../../../src/api/ApiCall', () => ({
  ApiGetCall: vi.fn(() => ({ data: undefined, isFetching: false, isSuccess: false })),
  ApiPostCall: vi.fn(() => ({ mutate: vi.fn(), isPending: false, isSuccess: false, isError: false })),
  ApiGetCallWithPagination: vi.fn(() => ({ data: undefined, isFetching: false })),
}))

const userData = { id: 'user-guid', userPrincipalName: 'p@contoso.test', usageLocation: 'FR' }
// A rule forwarding outside the organisation: an established signal, compromise by data alone.
const compromised = {
  NewRules: [{ Name: 'exfil', ForwardTo: 'smtp:out@evil.test' }],
  SuspectUserSignIns: [],
}
const clean = { NewRules: [], SuspectUserSignIns: [] }

describe('opening a case from a caseless investigation', () => {
  it('appears when a compromise is retained and no case is attached', () => {
    renderWithProviders(
      <PsitBecOpenCaseButton userData={userData} becData={compromised} tenantFilter="contoso.test" triage={[]} />
    )
    expect(screen.getByRole('button', { name: /Ouvrir un dossier/ })).toBeInTheDocument()
    expect(screen.getByText(/n’existe encore dans aucune file/)).toBeInTheDocument()
  })

  it('stays away from a clean mailbox', () => {
    renderWithProviders(
      <PsitBecOpenCaseButton userData={userData} becData={clean} tenantFilter="contoso.test" triage={[]} />
    )
    expect(screen.queryByRole('button', { name: /Ouvrir un dossier/ })).not.toBeInTheDocument()
  })

  it('stays away when the investigation already belongs to a case', () => {
    renderWithProviders(
      <PsitBecOpenCaseButton
        userData={userData}
        becData={compromised}
        tenantFilter="contoso.test"
        triage={[]}
        caseId="PSIT-SOC-1"
      />
    )
    expect(screen.queryByRole('button', { name: /Ouvrir un dossier/ })).not.toBeInTheDocument()
  })

  it('creates the case with the mailbox as entity and an idempotent reference', async () => {
    const mutate = vi.fn()
    ApiPostCall.mockImplementation(() => ({ mutate, isPending: false, isSuccess: false, isError: false }))

    renderWithProviders(
      <PsitBecOpenCaseButton userData={userData} becData={compromised} tenantFilter="contoso.test" triage={[]} />
    )
    await userEvent.click(screen.getByRole('button', { name: /Ouvrir un dossier/ }))

    const payload = mutate.mock.calls[0][0]
    expect(payload.url).toBe('/api/PSITExecSocCase')
    expect(payload.data.Entities).toEqual({ userId: 'user-guid', upn: 'p@contoso.test' })
    // A double click lands on the same case, not on two: the reference is derived, not random.
    expect(payload.data.ExternalRef).toBe('BEC:contoso.test:user-guid')
  })
})
