import React from 'react'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test-utils'
import { PsitBecIncidentPanel } from '../../../src/components/psit/PsitBecIncidentPanel'
import { ApiGetCall, ApiPostCall } from '../../../src/api/ApiCall'

// Rendering MUI through jsdom on a cold cache runs past Vitest's 5 s default on a laptop, and a
// timeout reads exactly like a broken assertion. Set per file rather than in vitest.config.mjs,
// which is upstream: no divergence, and the value travels with the tests that need it.
vi.setConfig({ testTimeout: 60000 })


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

    expect(screen.getByText('Fiche BEC')).toBeInTheDocument()
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
          UpdatedBy: 'analyste@example.test',
          UpdatedUtc: '2026-08-20T14:00:00Z',
        },
      },
      isFetching: false,
      isSuccess: true,
      isError: false,
    }))

    render()

    expect(
      screen.getByText(/PSIT-BEC-20260820-AB12, dernière mise à jour par analyste@example\.test/)
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Ticket Autotask')).toHaveValue('T20260820.0042')
  })

  it('survives a one-row list arriving as a bare object', () => {
    // The worker flattens single-element collections, so ExternalActions and ThirdPartiesNotified
    // arrive as objects. This is the payload that crashed the page with "map is not a function".
    ApiGetCall.mockImplementation(() => ({
      data: {
        Incident: {
          Reference: 'PSIT-BEC-20260820-AB12',
          ExternalActions: {
            Action: 'Banque prévenue',
            DoneUtc: '2026-08-20T13:30:00Z',
            By: 'DAF',
          },
          ThirdPartiesNotified: { Name: 'Banque', NotifiedUtc: '2026-08-20T13:30:00Z' },
          DataCategories: 'Données bancaires ou financières',
        },
      },
      isFetching: false,
      isSuccess: true,
      isError: false,
    }))

    render({ becData: compromisedBecData })

    expect(screen.getByDisplayValue('Banque prévenue')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Banque')).toBeInTheDocument()
    expect(screen.getByText('Données bancaires ou financières')).toBeInTheDocument()
  })

  it('captures the handover of the report and sends it with the record', async () => {
    const mutate = vi.fn()
    ApiPostCall.mockImplementation(() => ({
      mutate,
      isPending: false,
      isSuccess: false,
      isError: false,
    }))

    render({ becData: compromisedBecData })

    await userEvent.type(screen.getByLabelText('Remis à'), 'Direction financière')
    await userEvent.type(screen.getByLabelText('Accusé de réception par'), 'DAF')
    await userEvent.click(screen.getByRole('button', { name: /Enregistrer la fiche/ }))

    expect(mutate.mock.calls[0][0].data).toMatchObject({
      deliveredTo: 'Direction financière',
      acknowledgedBy: 'DAF',
    })
  })

  it('constrains the case fields the reports print, and defaults the marking', async () => {
    const mutate = vi.fn()
    ApiPostCall.mockImplementation(() => ({
      mutate,
      isPending: false,
      isSuccess: false,
      isError: false,
    }))

    render({ becData: compromisedBecData })

    // TLP is a document property with the strictest default, not a template constant.
    expect(screen.getByLabelText('Marquage de diffusion (TLP)')).toHaveTextContent(
      'TLP:AMBER+STRICT'
    )

    // The channel is a closed list on both surfaces: a free field is how "Pigeon voyageur" was
    // printed in a client annex.
    await userEvent.type(screen.getByLabelText('Tickets liés (optionnel)'), 'T20260821.0002')
    await userEvent.click(screen.getByRole('button', { name: /Enregistrer la fiche/ }))

    const payload = mutate.mock.calls[0][0].data
    expect(payload.tlp).toBe('TLP:AMBER+STRICT')
    expect(payload.relatedTickets).toEqual(['T20260821.0002'])
  })

  it('flags an unusual ticket without refusing it', async () => {
    render()
    const field = screen.getByLabelText('Ticket Autotask')

    await userEvent.type(field, 'ticket 42')
    expect(screen.getByText(/Forme inhabituelle/)).toBeInTheDocument()
    // Indicative only: the save stays available.
    expect(screen.getByRole('button', { name: /Enregistrer la fiche/ })).toBeEnabled()
  })

  it('asks what the access was followed by instead of deducing it', async () => {
    render({ becData: compromisedBecData })

    const field = screen.getByLabelText("Effet observé de l'accès")
    await userEvent.click(field)
    expect(await screen.findByRole('option', { name: 'Envoi en masse' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Détournement de fils' })).toBeInTheDocument()

    // "Autre" opens a short free field, injected into the same sentence template.
    await userEvent.click(screen.getByRole('option', { name: 'Autre (à préciser)' }))
    expect(
      await screen.findByLabelText('Préciser (une ligne, reprise telle quelle dans le résumé)')
    ).toBeInTheDocument()
  })

  it('warns about the banned lexicon in a free field, without blocking', async () => {
    render({ becData: compromisedBecData })

    await userEvent.type(
      screen.getByLabelText('Note de synthèse (complément, après le paragraphe composé)'),
      'envoi de spam massif'
    )

    expect(screen.getByText(/« spam »/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Enregistrer la fiche/ })).toBeEnabled()
  })

  it('renders nothing while the collection is still running', () => {
    const { container } = render({ becData: { Waiting: true } })
    expect(container).toBeEmptyDOMElement()
  })

  it('shows why the save failed, not only that it did', () => {
    // A bare "échec de l'enregistrement" sent an analyst hunting for a cause the API had already
    // named - an optional field left blank that a validated parameter refused.
    ApiPostCall.mockImplementation(() => ({
      mutate: vi.fn(),
      isPending: false,
      isSuccess: false,
      isError: true,
      error: {
        response: {
          data: { Results: "Could not save the incident record: argument '' does not belong to the set" },
        },
      },
    }))
    render()

    // The mocked ApiPostCall errors every request at once, so the save panel and the
    // delete panel both render it: at least one visible occurrence is the contract.
    expect(screen.getAllByText(/does not belong to the set/).length).toBeGreaterThan(0)
  })
})

describe('the ticket the dossier already knows', () => {
  // Opened from a SOC dossier, the Autotask number travelled with the alert; retyping it was
  // the kind of errand this portal exists to remove. A suggestion, never an override.
  it('prefills the Autotask field when the record has none of its own', () => {
    render({ suggestedTicket: 'T20260828.0009' })
    expect(screen.getByDisplayValue('T20260828.0009')).toBeInTheDocument()
    expect(screen.getByText(/Repris du dossier SOC/)).toBeInTheDocument()
  })

  it('never overrides a ticket the record already stores', () => {
    ApiGetCall.mockImplementation(() => ({
      data: { Incident: { Reference: 'BEC-2026-001', AutotaskTicket: 'T20260101.0001' } },
      isFetching: false,
      isSuccess: true,
      isError: false,
    }))
    render({ suggestedTicket: 'T20260828.0009' })
    expect(screen.getByDisplayValue('T20260101.0001')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('T20260828.0009')).not.toBeInTheDocument()
  })
})
