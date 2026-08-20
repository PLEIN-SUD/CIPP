import React from 'react'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test-utils'
import { PsitBecIncidentPanel } from '../../../src/components/psit/PsitBecIncidentPanel'
import { ApiGetCall, ApiPostCall } from '../../../src/api/ApiCall'

vi.mock('../../../src/api/ApiCall', () => ({
  ApiGetCall: vi.fn(() => ({
    data: undefined,
    isFetching: false,
    isSuccess: false,
    isError: false,
  })),
  ApiPostCall: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
  })),
  ApiGetCallWithPagination: vi.fn(() => ({ data: undefined, isFetching: false })),
}))

const userData = { id: 'user-guid', userPrincipalName: 'p.martin@contoso.test' }

// Nothing the data settles on its own: a filing rule is a question, not a compromise.
const openQuestionBecData = {
  ExtractedAt: '2026-08-20T10:32:00Z',
  NewRules: [{ Name: 'classement', MoveToFolder: 'DOSSIERS' }],
  SuspectUserSignIns: [],
  LocationAnalysis: { UsageLocation: 'FR' },
}

// A rule forwarding outside the organisation: the collection settles this one.
const compromisedBecData = {
  ...openQuestionBecData,
  NewRules: [{ Name: 'copie', ForwardTo: 'attacker@evil.test' }],
}

const render = (props = {}) =>
  renderWithProviders(
    <PsitBecIncidentPanel
      userData={userData}
      becData={openQuestionBecData}
      tenantFilter="contoso.test"
      triage={[]}
      {...props}
    />
  )

describe('PsitBecIncidentPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ApiGetCall.mockImplementation(() => ({
      data: undefined,
      isFetching: false,
      isSuccess: false,
      isError: false,
    }))
  })

  it('keeps the business reference editable before any compromise is retained', () => {
    render()

    expect(screen.getByText('Fiche de dossier')).toBeInTheDocument()
    expect(screen.getByLabelText('Ticket Autotask')).toBeEnabled()
    // The incident-specific fields stay out of the way until they are warranted, and the panel
    // says so rather than showing empty article 33.3 inputs.
    expect(screen.getByText(/apparaîtront si une compromission est retenue/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Conséquences probables')).not.toBeInTheDocument()
    expect(screen.queryByText(/article 33\.3/)).not.toBeInTheDocument()
  })

  it('reveals the article 33.3 fields once a compromise is established', () => {
    render({ becData: compromisedBecData })

    expect(screen.getByText(/article 33\.3/)).toBeInTheDocument()
    expect(screen.getByLabelText('Conséquences probables')).toBeInTheDocument()
    expect(screen.getByText('Confinement attesté par le journal CIPP')).toBeInTheDocument()
    // Containment is read from the CIPP log, so with no log every action reads as unattested.
    expect(screen.getAllByText(/non attestée/).length).toBeGreaterThan(0)
  })

  it('posts the Autotask ticket, which is what both reports quote', async () => {
    const mutate = vi.fn()
    ApiPostCall.mockImplementation(() => ({
      mutate,
      isPending: false,
      isSuccess: false,
      isError: false,
    }))

    render()

    const save = screen.getByRole('button', { name: /Enregistrer la fiche/ })
    expect(save).toBeDisabled()

    await userEvent.type(screen.getByLabelText('Ticket Autotask'), 'T20260820.0042')
    await userEvent.click(screen.getByRole('button', { name: /Enregistrer la fiche/ }))

    expect(mutate).toHaveBeenCalledTimes(1)
    const payload = mutate.mock.calls[0][0]
    expect(payload.url).toBe('/api/PSITExecBecIncident')
    expect(payload.data).toMatchObject({
      tenantFilter: 'contoso.test',
      userId: 'user-guid',
      autotaskTicket: 'T20260820.0042',
    })
  })

  it('shows the stored reference and who last touched the record', () => {
    ApiGetCall.mockImplementation(() => ({
      data: {
        Incident: {
          Reference: 'PSIT-BEC-20260820-AB12',
          AutotaskTicket: 'T20260820.0042',
          UpdatedBy: 's.miro@pleinsudit.com',
          UpdatedUtc: '2026-08-20T14:00:00Z',
        },
      },
      isFetching: false,
      isSuccess: true,
      isError: false,
    }))

    render()

    expect(
      screen.getByText(/PSIT-BEC-20260820-AB12 — dernière mise à jour par s\.miro@pleinsudit\.com/)
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Ticket Autotask')).toHaveValue('T20260820.0042')
  })

  it('renders nothing while the collection is still running', () => {
    const { container } = render({ becData: { Waiting: true } })
    expect(container).toBeEmptyDOMElement()
  })
})
